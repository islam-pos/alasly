import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { sendInvoicePdf } from '../services/whatsapp';
import { nextInvoiceNumber, withInvoiceTransaction } from '../services/documentNumbers';

const router = Router();

// --- List Sales Invoices ---
router.get('/invoices', async (req, res) => {
  try {
    const { type, customerId } = req.query;
    let whereClause: any = {};
    if (type) whereClause.invoiceType = String(type);
    if (customerId) whereClause.customerId = String(customerId);

    const invoices = await prisma.salesInvoice.findMany({
      where: whereClause,
      include: {
        customer: true,
        vehicle: true,
        warehouse: true,
        repairOrder: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Single Invoice ---
router.get('/invoices/:id', async (req, res) => {
  try {
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        vehicle: true,
        warehouse: true,
        repairOrder: {
          include: {
            technician: true,
            serviceAdvisor: true,
          },
        },
        items: { include: { item: true } },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Fast POS Checkout ---
router.post('/pos', async (req, res) => {
  try {
    const {
      customerId,
      vehicleId,
      warehouseId,
      branchId,
      items,
      discount = 0,
      paymentMethod = 'CASH',
      cashPaid = 0,
      cardPaid = 0,
      notes,
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'يجب اختيار صنف واحد على الأقل للبيع' });
    }

    const defaultWarehouse = warehouseId || (await prisma.warehouse.findFirst({ where: { code: 'WH-MAIN' } }))?.id;

    // Check stock availability
    for (const it of items) {
      const balance = await prisma.stockBalance.findUnique({
        where: {
          itemId_warehouseId: {
            itemId: it.itemId,
            warehouseId: defaultWarehouse!,
          },
        },
      });

      if (!balance || balance.quantity < it.quantity) {
        const itemObj = await prisma.item.findUnique({ where: { id: it.itemId } });
        return res.status(400).json({
          error: `الكمية المتوفرة من الصنف (${itemObj?.nameAr || it.itemId}) غير كافية! المتوفر: ${balance?.quantity || 0}، المطلوب: ${it.quantity}`,
        });
      }
    }

    const subtotal = items.reduce((sum: number, it: any) => sum + (parseFloat(it.unitPrice) * parseInt(it.quantity)), 0);
    const disc = parseFloat(discount) || 0;
    const taxable = Math.max(0, subtotal - disc);
    const taxAmount = (taxable * 15) / 100;
    const grandTotal = taxable + taxAmount;

    let paid = 0;
    let cash = parseFloat(cashPaid) || 0;
    let card = parseFloat(cardPaid) || 0;

    if (paymentMethod === 'CASH') {
      paid = grandTotal;
      cash = grandTotal;
    } else if (paymentMethod === 'CARD') {
      paid = grandTotal;
      card = grandTotal;
    } else if (paymentMethod === 'SPLIT') {
      paid = cash + card;
    } else if (paymentMethod === 'CREDIT') {
      paid = 0;
    }

    const remainingAmount = Math.max(0, grandTotal - paid);

    const invoice = await withInvoiceTransaction(prisma, async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, 'POS');
      // 1. Create Invoice
      const inv = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          customerId: customerId || null,
          vehicleId: vehicleId || null,
          warehouseId: defaultWarehouse,
          branchId: branchId || null,
          invoiceType: 'POS',
          subtotal,
          discount: disc,
          taxAmount,
          grandTotal,
          paidAmount: paid,
          remainingAmount,
          paymentMethod,
          cashPaid: cash,
          cardPaid: card,
          status: remainingAmount === 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'POSTED',
          notes: notes || null,
          items: {
            create: await Promise.all(
              items.map(async (it: any) => {
                const itemObj = await tx.item.findUnique({ where: { id: it.itemId } });
                const itemTotal = parseFloat(it.unitPrice) * parseInt(it.quantity);
                const itemTax = (itemTotal * 15) / 100;
                return {
                  itemId: it.itemId,
                  description: itemObj?.nameAr || null,
                  quantity: parseInt(it.quantity),
                  unitPrice: parseFloat(it.unitPrice),
                  costPrice: itemObj?.avgCost || 0,
                  discount: parseFloat(it.discount) || 0,
                  taxRate: 15.0,
                  taxAmount: itemTax,
                  total: itemTotal + itemTax,
                  itemType: 'PART',
                };
              })
            ),
          },
        },
        include: { items: { include: { item: true } }, customer: true },
      });

      // 2. Deduct stock & create transactions
      for (const it of items) {
        const qty = parseInt(it.quantity);
        const itemObj = await tx.item.findUnique({ where: { id: it.itemId } });

        await tx.stockBalance.update({
          where: {
            itemId_warehouseId: {
              itemId: it.itemId,
              warehouseId: defaultWarehouse!,
            },
          },
          data: { quantity: { decrement: qty } },
        });

        await tx.stockTransaction.create({
          data: {
            itemId: it.itemId,
            warehouseId: defaultWarehouse!,
            type: 'SALE',
            quantity: -qty,
            unitCost: itemObj?.avgCost || 0,
            totalCost: -(qty * (itemObj?.avgCost || 0)),
            referenceType: 'SalesInvoice',
            referenceId: inv.id,
            notes: `بيع بموجب فاتورة كاشير ${invoiceNumber}`,
          },
        });
      }

      // 3. Update customer balance if credit sale
      if (customerId && remainingAmount > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { currentBalance: { increment: remainingAmount } },
        });
      }

      // 4. Update Cashbox if cash received
      if (cash > 0) {
        const cashbox = await tx.cashbox.findFirst();
        if (cashbox) {
          await tx.cashbox.update({
            where: { id: cashbox.id },
            data: { balance: { increment: cash } },
          });

          await tx.cashTransaction.create({
            data: {
              cashboxId: cashbox.id,
              type: 'RECEIPT',
              amount: cash,
              referenceType: 'SALES',
              referenceId: inv.id,
              partyType: 'CUSTOMER',
              partyName: inv.customer?.name || 'عميل نقدي',
              description: `تحصيل فاتورة مبيعات POS رقم ${invoiceNumber}`,
            },
          });
        }
      }

      return inv;
    });

    await logAudit({
      action: 'POST',
      entity: 'SalesInvoice',
      entityId: invoice.id,
      details: `إصدار فاتورة بيع كاشير ${invoice.invoiceNumber} بمبلغ ${grandTotal} ج.م`,
    });

    let whatsappNotification: { sent: boolean; reason?: string } | { sent: false; error: string } = {
      sent: false,
      reason: 'no_opt_in_or_number',
    };
    if (invoice.customer?.whatsappOptIn && invoice.customer.whatsappNumber) {
      try {
        const company = await prisma.companySetting.findFirst();
        if (!company) throw new Error('بيانات المنشأة غير موجودة لإنشاء ملف الفاتورة');
        whatsappNotification = await sendInvoicePdf('sales', invoice, company, invoice.customer);
      } catch (whatsappError: any) {
        console.error(`WhatsApp sales invoice send failed for ${invoice.invoiceNumber}:`, whatsappError);
        whatsappNotification = { sent: false, error: whatsappError.message || 'تعذر إرسال الفاتورة عبر واتساب' };
      }
    }

    res.status(201).json({ ...invoice, whatsappNotification });
  } catch (err: any) {
    console.error('POS Checkout error:', err);
    res.status(400).json({ error: err.message });
  }
});

// --- Sales Returns ---
router.post('/returns', async (req, res) => {
  try {
    const { salesInvoiceId, items, reason } = req.body;

    const originalInvoice = await prisma.salesInvoice.findUnique({
      where: { id: salesInvoiceId },
      include: { items: true },
    });

    if (!originalInvoice) {
      return res.status(404).json({ error: 'الفاتورة الأصلية غير موجودة' });
    }

    const count = await prisma.salesReturn.count();
    const returnNumber = `RET-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const subtotal = items.reduce((sum: number, it: any) => sum + (parseFloat(it.unitPrice) * parseInt(it.quantity)), 0);
    const taxAmount = (subtotal * 15) / 100;
    const totalAmount = subtotal + taxAmount;

    const returnRecord = await prisma.$transaction(async (tx) => {
      // 1. Create return
      const ret = await tx.salesReturn.create({
        data: {
          returnNumber,
          salesInvoiceId,
          customerId: originalInvoice.customerId,
          subtotal,
          taxAmount,
          totalAmount,
          reason: reason || null,
          items: {
            create: items.map((it: any) => ({
              itemId: it.itemId,
              quantity: parseInt(it.quantity),
              unitPrice: parseFloat(it.unitPrice),
              total: parseFloat(it.unitPrice) * parseInt(it.quantity),
            })),
          },
        },
      });

      // 2. Restore stock for returned items
      for (const it of items) {
        const qty = parseInt(it.quantity);
        const itemObj = await tx.item.findUnique({ where: { id: it.itemId } });

        await tx.stockBalance.update({
          where: {
            itemId_warehouseId: {
              itemId: it.itemId,
              warehouseId: originalInvoice.warehouseId!,
            },
          },
          data: { quantity: { increment: qty } },
        });

        await tx.stockTransaction.create({
          data: {
            itemId: it.itemId,
            warehouseId: originalInvoice.warehouseId!,
            type: 'SALE_RETURN',
            quantity: qty,
            unitCost: itemObj?.avgCost || 0,
            totalCost: qty * (itemObj?.avgCost || 0),
            referenceType: 'SalesReturn',
            referenceId: ret.id,
            notes: `مرتجع مبيعات بموجب سند ${returnNumber} للفاتورة ${originalInvoice.invoiceNumber}`,
          },
        });
      }

      // 3. Deduct customer balance if was credit, or deduct cashbox if cash
      if (originalInvoice.customerId && originalInvoice.remainingAmount > 0) {
        await tx.customer.update({
          where: { id: originalInvoice.customerId },
          data: { currentBalance: { decrement: totalAmount } },
        });
      }

      return ret;
    });

    await logAudit({ action: 'POST', entity: 'SalesReturn', entityId: returnRecord.id, details: `إصدار مرتجع مبيعات ${returnNumber} بمبلغ ${totalAmount} ج.م` });

    res.status(201).json(returnRecord);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Customer Statement of Account ---
router.get('/customers/:id/statement', async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        salesInvoices: { orderBy: { date: 'desc' } },
        repairOrders: { orderBy: { createdAt: 'desc' } },
        vehicles: true,
      },
    });

    if (!customer) return res.status(404).json({ error: 'العميل غير موجود' });

    res.json({
      customer,
      totalSpent: customer.salesInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0),
      currentBalance: customer.currentBalance,
      invoicesCount: customer.salesInvoices.length,
      repairOrdersCount: customer.repairOrders.length,
      vehicles: customer.vehicles,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
