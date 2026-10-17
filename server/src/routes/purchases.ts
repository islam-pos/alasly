import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { sendInvoicePdf, sendShortageRequest } from '../services/whatsapp';
import { nextInvoiceNumber, withInvoiceTransaction } from '../services/documentNumbers';
import { postJournalEntry } from '../services/accounting';
import { AuthenticatedRequest } from '../middleware/auth';
import { branchWhere } from '../services/branchScope';

const router = Router();

router.get('/items/:itemId/price-history', async (req, res) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: req.params.itemId },
      select: { id: true, nameAr: true, sku: true },
    });
    if (!item) return res.status(404).json({ error: 'الصنف غير موجود' });
    const history = await prisma.purchaseInvoiceItem.findMany({
      where: {
        itemId: item.id,
        invoice: {
          ...branchWhere(req as AuthenticatedRequest),
          status: { notIn: ['DRAFT', 'CANCELLED'] },
        },
      },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            date: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ item, prices: history.map(({ invoice, quantity, unitPrice }) => ({
      supplier: invoice.supplier,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      quantity,
      unitPrice,
    })) });
  } catch (error) {
    console.error('Failed to load supplier price history:', error);
    res.status(500).json({ error: 'تعذر تحميل مقارنة أسعار الموردين' });
  }
});

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
router.get('/invoices', async (req: AuthenticatedRequest, res) => {
  try {
    const invoices = await prisma.purchaseInvoice.findMany({
      where: branchWhere(req),
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

router.post('/invoices', async (req: AuthenticatedRequest, res) => {
  try {
    const { items, ...data } = req.body;
    if (
      !Array.isArray(items) || items.length === 0 ||
      typeof data.supplierId !== 'string' || typeof data.warehouseId !== 'string' ||
      items.some((item: any) =>
        typeof item?.itemId !== 'string' ||
        !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0 ||
        !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0
      )
    ) return res.status(400).json({ error: 'بيانات فاتورة المشتريات غير صالحة' });
    const subtotal = items.reduce((sum: number, it: any) => sum + (parseFloat(it.unitPrice) * parseInt(it.quantity)), 0);
    const discount = parseFloat(data.discount) || 0;
    if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) {
      return res.status(400).json({ error: 'قيمة الخصم غير صالحة' });
    }
    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount = 0;
    const grandTotal = taxableAmount;
    const paidAmount = parseFloat(data.paidAmount) || 0;
    if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > grandTotal) {
      return res.status(400).json({ error: 'المبلغ المدفوع يجب ألا يتجاوز إجمالي الفاتورة' });
    }
    const remainingAmount = Math.max(0, grandTotal - paidAmount);

    const invoice = await withInvoiceTransaction(prisma, async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, 'PINV');
      return tx.purchaseInvoice.create({
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
          status: 'DRAFT',
          notes: data.notes || null,
          createdById: req.user?.id,
          items: {
            create: items.map((it: any) => {
              const itemTotal = parseFloat(it.unitPrice) * parseInt(it.quantity);
              return {
                itemId: it.itemId,
                quantity: parseInt(it.quantity),
                unitPrice: parseFloat(it.unitPrice),
                taxRate: 0,
                taxAmount: 0,
                total: itemTotal,
              };
            }),
          },
        },
        include: { supplier: true, warehouse: true, items: { include: { item: true } } },
      });
    });

    await logAudit({
      userId: req.user?.id,
      action: 'CREATE',
      entity: 'PurchaseInvoice',
      entityId: invoice.id,
      details: `إنشاء مسودة فاتورة مشتريات ${invoice.invoiceNumber}`,
      ipAddress: req.ip,
    });
    res.status(201).json(invoice);
  } catch (err: any) {
    console.error('Purchase invoice error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/invoices/:id/approve', async (req: AuthenticatedRequest, res) => {
  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const draft = await tx.purchaseInvoice.findFirst({
        where: { id: req.params.id, ...branchWhere(req) },
        include: { items: true },
      });

      router.post('/invoices/:id/reject', async (req: AuthenticatedRequest, res) => {
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        if (!reason || reason.length > 500) return res.status(400).json({ error: 'سبب رفض الفاتورة مطلوب وبحد أقصى 500 حرف' });
        try {
          const invoice = await prisma.purchaseInvoice.findFirst({
            where: { id: req.params.id, ...branchWhere(req) },
          });
          if (!invoice) return res.status(404).json({ error: 'فاتورة المشتريات غير موجودة' });
          if (invoice.status !== 'DRAFT') return res.status(400).json({ error: 'لا يمكن رفض إلا فاتورة بانتظار الاعتماد' });
          if (invoice.createdById === req.user?.id) return res.status(400).json({ error: 'لا يمكن رفض فاتورة أنشأتها بنفسك' });
          const rejected = await prisma.purchaseInvoice.update({
            where: { id: invoice.id },
            data: {
              status: 'CANCELLED',
              notes: [invoice.notes, `رفض: ${reason}`].filter(Boolean).join('\n').slice(0, 2000),
            },
            include: { supplier: true, warehouse: true, items: { include: { item: true } } },
          });
          await logAudit({
            userId: req.user?.id,
            action: 'REJECT',
            entity: 'PurchaseInvoice',
            entityId: invoice.id,
            details: `رفض فاتورة مشتريات ${invoice.invoiceNumber}: ${reason}`,
            ipAddress: req.ip,
          });
          res.json(rejected);
        } catch (error) {
          console.error('Failed to reject purchase invoice:', error);
          res.status(500).json({ error: 'تعذر رفض فاتورة المشتريات' });
        }
      });
      if (!draft) throw new Error('فاتورة المشتريات غير موجودة');
      if (draft.status !== 'DRAFT') throw new Error('الفاتورة ليست مسودة بانتظار الاعتماد');
      if (draft.createdById === req.user?.id) throw new Error('لا يمكن اعتماد فاتورة أنشأتها بنفسك');
      if (draft.paidAmount < 0 || draft.paidAmount > draft.grandTotal) throw new Error('المبلغ المدفوع المسجل غير صالح');
      const remainingAmount = Math.max(0, draft.grandTotal - draft.paidAmount);

      for (const item of draft.items) {
        const currentBalance = await tx.stockBalance.findUnique({
          where: { itemId_warehouseId: { itemId: item.itemId, warehouseId: draft.warehouseId } },
        });
        const previousQty = currentBalance?.quantity || 0;
        if (currentBalance) {
          await tx.stockBalance.update({
            where: { id: currentBalance.id },
            data: { quantity: previousQty + item.quantity },
          });
        } else {
          await tx.stockBalance.create({
            data: { itemId: item.itemId, warehouseId: draft.warehouseId, quantity: item.quantity },
          });
        }
        await tx.stockTransaction.create({
          data: {
            itemId: item.itemId,
            warehouseId: draft.warehouseId,
            type: 'PURCHASE',
            quantity: item.quantity,
            unitCost: item.unitPrice,
            totalCost: item.quantity * item.unitPrice,
            referenceType: 'PurchaseInvoice',
            referenceId: draft.id,
            notes: `شراء بموجب فاتورة مشتريات ${draft.invoiceNumber}`,
          },
        });
        const stockItem = await tx.item.findUnique({ where: { id: item.itemId } });
        if (!stockItem) throw new Error(`الصنف ${item.itemId} لم يعد موجوداً`);
        const newAverage = previousQty + item.quantity > 0
          ? ((previousQty * stockItem.avgCost) + (item.quantity * item.unitPrice)) / (previousQty + item.quantity)
          : item.unitPrice;
        await tx.item.update({
          where: { id: item.itemId },
          data: { purchasePrice: item.unitPrice, avgCost: Math.round(newAverage * 100) / 100 },
        });
      }

      if (remainingAmount > 0) {
        await tx.supplier.update({
          where: { id: draft.supplierId },
          data: { currentBalance: { increment: remainingAmount } },
        });
      }
      const paymentMethod = draft.paymentMethod || 'CREDIT';
      await postJournalEntry(tx, {
        journalCode: 'PUR',
        memo: `فاتورة مشتريات ${draft.invoiceNumber}`,
        referenceType: 'PurchaseInvoice',
        referenceId: draft.id,
        branchId: draft.branchId,
        lines: [
          ...(draft.grandTotal > 0 ? [{ accountCode: '1200', debit: draft.grandTotal, label: 'إضافة مشتريات إلى المخزون' }] : []),
          ...(remainingAmount > 0 ? [{
            accountCode: '2000',
            credit: remainingAmount,
            label: 'ذمم المورد',
            partnerType: 'SUPPLIER',
            partnerId: draft.supplierId,
          }] : []),
          ...(draft.paidAmount > 0 ? [{
            accountCode: paymentMethod === 'CASH' ? '1000' : paymentMethod === 'CARD' ? '1010' : paymentMethod === 'BANK' ? '1020' : '2990',
            credit: draft.paidAmount,
            label: `سداد مشتريات - ${paymentMethod}`,
          }] : []),
        ],
      });
      return tx.purchaseInvoice.update({
        where: { id: draft.id },
        data: {
          remainingAmount,
          status: remainingAmount === 0 ? 'PAID' : draft.paidAmount > 0 ? 'PARTIALLY_PAID' : 'POSTED',
          approvedById: req.user?.id,
          approvedAt: new Date(),
        },
        include: { supplier: true, warehouse: true, items: { include: { item: true } } },
      });
    });

    await logAudit({
      userId: req.user?.id,
      action: 'APPROVE',
      entity: 'PurchaseInvoice',
      entityId: invoice.id,
      details: `اعتماد فاتورة مشتريات ${invoice.invoiceNumber} بمبلغ ${invoice.grandTotal} ج.م`,
      ipAddress: req.ip,
    });
    let whatsappNotification: { sent: boolean; reason?: string } | { sent: false; error: string } = {
      sent: false,
      reason: 'no_supplier_or_opt_in',
    };
    if (invoice.supplier.whatsappOptIn && invoice.supplier.whatsappNumber) {
      try {
        const company = await prisma.companySetting.findFirst();
        if (!company) throw new Error('بيانات المنشأة غير موجودة لإنشاء ملف الفاتورة');
        whatsappNotification = await sendInvoicePdf('supplier', invoice, company, invoice.supplier);
      } catch (error: any) {
        console.error(`WhatsApp supplier invoice send failed for ${invoice.invoiceNumber}:`, error);
        whatsappNotification = { sent: false, error: error.message || 'تعذر إرسال الفاتورة عبر واتساب' };
      }
    }
    res.json({ ...invoice, whatsappNotification });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر اعتماد فاتورة المشتريات';
    res.status(message === 'فاتورة المشتريات غير موجودة' ? 404 : 400).json({ error: message });
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
