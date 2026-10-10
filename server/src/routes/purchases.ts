import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { sendInvoicePdf, sendShortageRequest } from '../services/whatsapp';
import { nextInvoiceNumber, withInvoiceTransaction } from '../services/documentNumbers';

const router = Router();

// --- Purchase Requests ---
router.get('/requests', async (req, res) => {
  try {
    const requests = await prisma.purchaseRequest.findMany({
      include: {
        supplier: true,
        warehouse: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/requests', async (req, res) => {
  try {
    const { items, ...data } = req.body;
    const count = await prisma.purchaseRequest.count();
    const requestNumber = `PR-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const request = await prisma.purchaseRequest.create({
      data: {
        ...data,
        requestNumber,
        items: {
          create: items.map((i: any) => ({
            itemId: i.itemId,
            quantity: parseInt(i.quantity),
            estimatedPrice: parseFloat(i.estimatedPrice) || 0,
            notes: i.notes || null,
          })),
        },
      },
      include: { items: { include: { item: true } }, supplier: true },
    });

    await logAudit({ action: 'CREATE', entity: 'PurchaseRequest', entityId: request.id, details: `إنشاء طلب شراء ${requestNumber}` });

    let whatsappNotification: { sent: boolean; reason?: string } | { sent: false; error: string } = {
      sent: false,
      reason: 'no_supplier_or_opt_in',
    };
    if (request.supplier?.whatsappOptIn && request.supplier.whatsappNumber) {
      try {
        whatsappNotification = await sendShortageRequest(request, request.supplier);
      } catch (whatsappError: any) {
        console.error(`WhatsApp shortage request send failed for ${request.requestNumber}:`, whatsappError);
        whatsappNotification = { sent: false, error: whatsappError.message || 'تعذر إرسال طلب النواقص عبر واتساب' };
      }
    }

    res.status(201).json({ ...request, whatsappNotification });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Purchase Invoices ---
router.get('/invoices', async (req, res) => {
  try {
    const invoices = await prisma.purchaseInvoice.findMany({
      include: {
        supplier: true,
        warehouse: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const { items, ...data } = req.body;
    const subtotal = items.reduce((sum: number, it: any) => sum + (parseFloat(it.unitPrice) * parseInt(it.quantity)), 0);
    const discount = parseFloat(data.discount) || 0;
    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount = (taxableAmount * 15) / 100;
    const grandTotal = taxableAmount + taxAmount;
    const paidAmount = parseFloat(data.paidAmount) || 0;
    const remainingAmount = Math.max(0, grandTotal - paidAmount);

    const invoice = await withInvoiceTransaction(prisma, async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, 'PINV');
      // 1. Create invoice
      const createdInvoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber,
          supplierInvoiceNumber: data.supplierInvoiceNumber || null,
          supplierId: data.supplierId,
          warehouseId: data.warehouseId,
          branchId: data.branchId || null,
          subtotal,
          discount,
          taxAmount,
          grandTotal,
          paidAmount,
          remainingAmount,
          paymentMethod: data.paymentMethod || 'CREDIT',
          status: remainingAmount === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'POSTED',
          notes: data.notes || null,
          items: {
            create: items.map((it: any) => {
              const itemTotal = parseFloat(it.unitPrice) * parseInt(it.quantity);
              const itemTax = (itemTotal * 15) / 100;
              return {
                itemId: it.itemId,
                quantity: parseInt(it.quantity),
                unitPrice: parseFloat(it.unitPrice),
                taxRate: 15.0,
                taxAmount: itemTax,
                total: itemTotal + itemTax,
              };
            }),
          },
        },
      });

      // 2. Increase stock and update cost for each item
      for (const it of items) {
        const qty = parseInt(it.quantity);
        const price = parseFloat(it.unitPrice);

        // Update or insert StockBalance
        const currentBalance = await tx.stockBalance.findUnique({
          where: {
            itemId_warehouseId: {
              itemId: it.itemId,
              warehouseId: data.warehouseId,
            },
          },
        });

        if (currentBalance) {
          await tx.stockBalance.update({
            where: { id: currentBalance.id },
            data: { quantity: currentBalance.quantity + qty },
          });
        } else {
          await tx.stockBalance.create({
            data: {
              itemId: it.itemId,
              warehouseId: data.warehouseId,
              quantity: qty,
            },
          });
        }

        // Record stock transaction
        await tx.stockTransaction.create({
          data: {
            itemId: it.itemId,
            warehouseId: data.warehouseId,
            type: 'PURCHASE',
            quantity: qty,
            unitCost: price,
            totalCost: qty * price,
            referenceType: 'PurchaseInvoice',
            referenceId: createdInvoice.id,
            notes: `شراء بموجب فاتورة مشتريات ${invoiceNumber}`,
          },
        });

        // Update item purchasePrice & weighted average cost
        const itemObj = await tx.item.findUnique({ where: { id: it.itemId } });
        if (itemObj) {
          const oldQty = currentBalance ? currentBalance.quantity : 0;
          const newAvgCost = oldQty + qty > 0 ? ((oldQty * itemObj.avgCost) + (qty * price)) / (oldQty + qty) : price;
          await tx.item.update({
            where: { id: it.itemId },
            data: {
              purchasePrice: price,
              avgCost: Math.round(newAvgCost * 100) / 100,
            },
          });
        }
      }

      // 3. Update Supplier balance (increase liability by remaining amount)
      if (remainingAmount > 0) {
        await tx.supplier.update({
          where: { id: data.supplierId },
          data: {
            currentBalance: { increment: remainingAmount },
          },
        });
      }

      return createdInvoice;
    });

    await logAudit({ action: 'POST', entity: 'PurchaseInvoice', entityId: invoice.id, details: `اعتماد فاتورة مشتريات ${invoice.invoiceNumber} بمبلغ ${grandTotal} ر.س` });

    let whatsappNotification: { sent: boolean; reason?: string } | { sent: false; error: string } = {
      sent: false,
      reason: 'no_supplier_or_opt_in',
    };
    const invoiceForMessage = await prisma.purchaseInvoice.findUnique({
      where: { id: invoice.id },
      include: { supplier: true, items: { include: { item: true } } },
    });
    if (invoiceForMessage?.supplier.whatsappOptIn && invoiceForMessage.supplier.whatsappNumber) {
      try {
        const company = await prisma.companySetting.findFirst();
        if (!company) throw new Error('بيانات المنشأة غير موجودة لإنشاء ملف الفاتورة');
        whatsappNotification = await sendInvoicePdf(
          'supplier',
          invoiceForMessage,
          company,
          invoiceForMessage.supplier,
        );
      } catch (whatsappError: any) {
        console.error(`WhatsApp supplier invoice send failed for ${invoice.invoiceNumber}:`, whatsappError);
        whatsappNotification = { sent: false, error: whatsappError.message || 'تعذر إرسال الفاتورة عبر واتساب' };
      }
    }

    res.status(201).json({ ...invoice, whatsappNotification });
  } catch (err: any) {
    console.error('Purchase invoice error:', err);
    res.status(400).json({ error: err.message });
  }
});

// --- Supplier Statement of Account ---
router.get('/suppliers/statement', async (_req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: {
        purchaseInvoices: { orderBy: { date: 'asc' } },
        purchaseReturns: { orderBy: { date: 'asc' } },
        cashTransactions: { where: { type: 'PAYMENT' }, orderBy: { date: 'asc' }, include: { cashbox: true } },
      },
    });
    res.json({
      suppliers: suppliers.map((supplier) => {
        const { purchaseInvoices, purchaseReturns, cashTransactions, ...supplierDetails } = supplier;
        return {
          ...supplierDetails,
          statement: [
            ...purchaseInvoices.map((invoice) => ({
              id: invoice.id,
              date: invoice.date,
              number: invoice.invoiceNumber,
              type: 'فاتورة مشتريات',
              debit: invoice.remainingAmount,
              credit: 0,
              notes: invoice.notes,
            })),
            ...purchaseReturns.map((purchaseReturn) => ({
              id: purchaseReturn.id,
              date: purchaseReturn.date,
              number: purchaseReturn.returnNumber,
              type: 'مرتجع مشتريات',
              debit: 0,
              credit: purchaseReturn.totalAmount,
              notes: purchaseReturn.reason,
            })),
            ...cashTransactions.map((transaction) => ({
              id: transaction.id,
              date: transaction.date,
              number: transaction.referenceId || transaction.id,
              type: 'سند صرف',
              debit: 0,
              credit: transaction.amount,
              notes: transaction.description,
            })),
          ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        };
      }),
    });
  } catch (err: any) {
    console.error('Failed to load supplier statements:', err);
    res.status(500).json({ error: 'تعذر تحميل كشوف حساب الموردين' });
  }
});

router.get('/suppliers/:id/statement', async (req, res) => {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        purchaseInvoices: { orderBy: { date: 'desc' } },
        purchaseReturns: { orderBy: { date: 'desc' } },
        cashTransactions: { where: { type: 'PAYMENT' }, orderBy: { date: 'desc' } },
      },
    });

    if (!supplier) return res.status(404).json({ error: 'المورد غير موجود' });

    const { purchaseInvoices, purchaseReturns, cashTransactions, ...supplierDetails } = supplier;
    const transactions = [
      ...purchaseInvoices.map((invoice) => ({
        id: invoice.id,
        date: invoice.date,
        number: invoice.invoiceNumber,
        type: 'فاتورة مشتريات',
        debit: invoice.remainingAmount,
        credit: 0,
        notes: invoice.notes,
      })),
      ...purchaseReturns.map((purchaseReturn) => ({
        id: purchaseReturn.id,
        date: purchaseReturn.date,
        number: purchaseReturn.returnNumber,
        type: 'مرتجع مشتريات',
        debit: 0,
        credit: purchaseReturn.totalAmount,
        notes: purchaseReturn.reason,
      })),
      ...cashTransactions.map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        number: transaction.referenceId || transaction.id,
        type: 'سند صرف',
        debit: 0,
        credit: transaction.amount,
        notes: transaction.description,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({
      supplier: { ...supplierDetails, statement: transactions },
      invoicesCount: purchaseInvoices.length,
      totalPurchases: purchaseInvoices.reduce((sum, i) => sum + i.grandTotal, 0),
      totalPaid: purchaseInvoices.reduce((sum, i) => sum + i.paidAmount, 0)
        + cashTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
      totalRemaining: supplier.currentBalance,
      transactions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
