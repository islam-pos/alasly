import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { sendInvoicePdf } from '../services/whatsapp';
import { nextInvoiceNumber, withInvoiceTransaction } from '../services/documentNumbers';
import { postJournalEntry } from '../services/accounting';
import { branchWhere } from '../services/branchScope';

const router = Router();

// --- List Sales Invoices ---
router.get('/invoices', async (req: AuthenticatedRequest, res) => {
  try {
    const { type, customerId } = req.query;
    let whereClause: any = branchWhere(req);
    if (type) whereClause.invoiceType = String(type);
    if (customerId) whereClause.customerId = String(customerId);

    const invoices = await prisma.salesInvoice.findMany({
      where: whereClause,
      include: {
        customer: true,
        vehicle: true,
        warehouse: true,
        convertedInvoice: { select: { id: true, invoiceNumber: true } },
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
router.get('/invoices/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: req.params.id, ...branchWhere(req) },
      include: {
        customer: true,
        vehicle: true,
        warehouse: true,
        convertedInvoice: { select: { id: true, invoiceNumber: true } },
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
    const taxAmount = 0;
    const grandTotal = taxable;

    let paid = 0;
    let cash = parseFloat(cashPaid) || 0;
    let card = parseFloat(cardPaid) || 0;

    if (paymentMethod === 'CASH') {
      paid = grandTotal;
      cash = grandTotal;
      card = 0;
    } else if (paymentMethod === 'CARD') {
      paid = grandTotal;
      card = grandTotal;
      cash = 0;
    } else if (paymentMethod === 'SPLIT') {
      if (cash < 0 || card < 0 || cash + card > grandTotal + 0.01) {
        return res.status(400).json({ error: 'مبالغ الدفع النقدي والبطاقة تتجاوز إجمالي الفاتورة أو تحتوي على قيمة غير صالحة' });
      }
      paid = cash + card;
    } else if (paymentMethod === 'CREDIT') {
      paid = 0;
      cash = 0;
      card = 0;
    } else {
      return res.status(400).json({ error: 'طريقة الدفع غير صالحة' });
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
                return {
                  itemId: it.itemId,
                  description: itemObj?.nameAr || null,
                  quantity: parseInt(it.quantity),
                  unitPrice: parseFloat(it.unitPrice),
                  costPrice: itemObj?.avgCost || 0,
                  discount: parseFloat(it.discount) || 0,
                  taxRate: 0,
                  taxAmount: 0,
                  total: itemTotal,
                  itemType: 'PART',
                };
              })
            ),
          },
        },
        include: { items: { include: { item: true } }, customer: true },
      });

      // 2. Deduct stock & create transactions
      let costOfGoods = 0;
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
        costOfGoods += qty * (itemObj?.avgCost || 0);
      }

      const accountingLines = [
        ...(cash > 0 ? [{ accountCode: '1000', debit: cash, label: 'تحصيل نقدي' }] : []),
        ...(card > 0 ? [{ accountCode: '1010', debit: card, label: 'تحصيل بطاقة' }] : []),
        ...(remainingAmount > 0 ? [{
          accountCode: '1100',
          debit: remainingAmount,
          label: 'ذمم العميل',
          partnerType: 'CUSTOMER',
          partnerId: customerId || undefined,
        }] : []),
        ...((grandTotal - taxAmount) > 0 ? [{ accountCode: '4000', credit: grandTotal - taxAmount, label: 'إيراد بيع قطع غيار' }] : []),
        ...(taxAmount > 0 ? [{ accountCode: '2100', credit: taxAmount, label: 'ضريبة قيمة مضافة - مخرجات' }] : []),
        ...(costOfGoods > 0 ? [
          { accountCode: '5000', debit: costOfGoods, label: 'تكلفة البضاعة المباعة' },
          { accountCode: '1200', credit: costOfGoods, label: 'تخفيض المخزون المباع' },
        ] : []),
      ];
      await postJournalEntry(tx, {
        journalCode: 'SAL',
        memo: `فاتورة بيع ${invoiceNumber}`,
        referenceType: 'SalesInvoice',
        referenceId: inv.id,
        branchId: branchId || null,
        lines: accountingLines,
      });

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

router.post('/quotations', async (req: AuthenticatedRequest, res) => {
  try {
    const {
      customerId,
      warehouseId,
      branchId,
      items,
      discount = 0,
      notes,
    } = req.body || {};
    if (
      !Array.isArray(items) || items.length === 0 || items.length > 500
      || items.some((item) => !item || typeof item.itemId !== 'string'
        || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1
        || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0)
      || !Number.isFinite(Number(discount)) || Number(discount) < 0
      || (customerId !== undefined && customerId !== null && typeof customerId !== 'string')
      || (branchId !== undefined && branchId !== null && typeof branchId !== 'string')
    ) {
      return res.status(400).json({ error: 'بيانات عرض السعر غير مكتملة أو غير صالحة' });
    }

    const warehouse = warehouseId
      ? await prisma.warehouse.findUnique({ where: { id: warehouseId } })
      : await prisma.warehouse.findFirst({ where: { code: 'WH-MAIN' } });
    if (!warehouse) return res.status(400).json({ error: 'اختر مخزناً صالحاً لعرض السعر' });

    const subtotal = items.reduce((sum: number, item: any) => sum + Number(item.unitPrice) * Number(item.quantity), 0);
    const taxable = Math.max(0, subtotal - Number(discount));
    const taxAmount = 0;
    const grandTotal = taxable;
    if (grandTotal <= 0) return res.status(400).json({ error: 'إجمالي عرض السعر يجب أن يكون أكبر من صفر' });

    const quotation = await withInvoiceTransaction(prisma, async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, 'QUO');
      return tx.salesInvoice.create({
        data: {
          invoiceNumber,
          customerId: customerId || null,
          warehouseId: warehouse.id,
          branchId: branchId || null,
          invoiceType: 'QUOTATION',
          subtotal,
          discount: Number(discount),
          taxAmount,
          grandTotal,
          paidAmount: 0,
          remainingAmount: 0,
          paymentMethod: 'CREDIT',
          status: 'DRAFT',
          notes: typeof notes === 'string' ? notes.trim() || null : null,
          createdById: req.user?.id || null,
          items: {
            create: await Promise.all(items.map(async (item: any) => {
              const product = await tx.item.findUnique({ where: { id: item.itemId } });
              if (!product || !product.active) throw new Error(`الصنف ${item.itemId} غير موجود أو غير نشط`);
              const lineSubtotal = Number(item.unitPrice) * Number(item.quantity);
              return {
                itemId: product.id,
                description: product.nameAr,
                quantity: Number(item.quantity),
                unitPrice: Number(item.unitPrice),
                costPrice: product.avgCost,
                discount: 0,
                taxRate: 0,
                taxAmount: 0,
                total: lineSubtotal,
                itemType: 'PART',
              };
            })),
          },
        },
        include: { items: { include: { item: true } }, customer: true, warehouse: true },
      });
    });

    await logAudit({
      action: 'CREATE',
      entity: 'SalesQuotation',
      entityId: quotation.id,
      details: `إنشاء عرض السعر ${quotation.invoiceNumber} بإجمالي ${grandTotal} ج.م`,
    });
    res.status(201).json(quotation);
  } catch (error: any) {
    console.error('Sales quotation creation failed:', error);
    res.status(400).json({ error: error.message || 'تعذر إنشاء عرض السعر' });
  }
});

router.post('/invoices/:id/convert-quotation', async (req: AuthenticatedRequest, res) => {
  try {
    const { paymentMethod = 'CASH', cashPaid = 0, cardPaid = 0 } = req.body || {};
    if (
      !['CASH', 'CARD', 'CREDIT', 'SPLIT'].includes(paymentMethod)
      || !Number.isFinite(Number(cashPaid)) || Number(cashPaid) < 0
      || !Number.isFinite(Number(cardPaid)) || Number(cardPaid) < 0
    ) {
      return res.status(400).json({ error: 'طريقة السداد أو مبالغ التحصيل غير صالحة' });
    }
    const result = await withInvoiceTransaction(prisma, async (tx) => {
      const quotation = await tx.salesInvoice.findUnique({
        where: { id: req.params.id },
        include: { items: true },
      });
      if (!quotation || quotation.invoiceType !== 'QUOTATION') {
        throw new Error('عرض السعر غير موجود');
      }
      if (quotation.status !== 'DRAFT') {
        const existingInvoice = await tx.salesInvoice.findUnique({
          where: { quotationId: quotation.id },
          include: { items: { include: { item: true } }, customer: true, warehouse: true },
        });
        if (existingInvoice) return { invoice: existingInvoice, alreadyConverted: true };
        throw new Error('لا يمكن تحويل عرض السعر بحالته الحالية');
      }
      if (!quotation.warehouseId || quotation.items.some((line) => !line.itemId)) {
        throw new Error('عرض السعر يحتوي على صنف غير صالح أو لا يحدد مخزناً');
      }

      const quantities = new Map<string, number>();
      for (const line of quotation.items) {
        quantities.set(line.itemId!, (quantities.get(line.itemId!) || 0) + line.quantity);
      }
      for (const [itemId, quantity] of quantities) {
        const balance = await tx.stockBalance.findUnique({
          where: { itemId_warehouseId: { itemId, warehouseId: quotation.warehouseId } },
        });
        const product = await tx.item.findUnique({ where: { id: itemId } });
        const available = (balance?.quantity || 0) - (balance?.reservedQty || 0);
        if (!product || !product.active || available < quantity) {
          throw new Error(`المخزون غير كافٍ للصنف ${product?.nameAr || itemId}. المتاح: ${available}، المطلوب: ${quantity}`);
        }
      }

      const invoiceNumber = await nextInvoiceNumber(tx, 'POS');
      const cash = paymentMethod === 'CASH'
        ? quotation.grandTotal
        : paymentMethod === 'SPLIT' ? Number(cashPaid) : 0;
      const card = paymentMethod === 'CARD'
        ? quotation.grandTotal
        : paymentMethod === 'SPLIT' ? Number(cardPaid) : 0;
      if (cash + card > quotation.grandTotal) {
        throw new Error('مبلغ التحصيل يتجاوز إجمالي عرض السعر');
      }
      const paid = cash + card;
      const remainingAmount = quotation.grandTotal - paid;
      const products = new Map(
        (await tx.item.findMany({ where: { id: { in: [...quantities.keys()] } } }))
          .map((product) => [product.id, product]),
      );
      const invoice = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          quotationId: quotation.id,
          customerId: quotation.customerId,
          warehouseId: quotation.warehouseId,
          branchId: quotation.branchId,
          invoiceType: 'POS',
          subtotal: quotation.subtotal,
          discount: quotation.discount,
          taxAmount: quotation.taxAmount,
          grandTotal: quotation.grandTotal,
          paidAmount: paid,
          remainingAmount,
          paymentMethod,
          cashPaid: cash,
          cardPaid: card,
          status: remainingAmount === 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'POSTED',
          notes: `صادرة من عرض السعر ${quotation.invoiceNumber}${quotation.notes ? ` - ${quotation.notes}` : ''}`,
          createdById: req.user?.id || null,
          items: {
            create: quotation.items.map((line) => ({
              itemId: line.itemId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              costPrice: products.get(line.itemId!)?.avgCost || 0,
              discount: line.discount,
              taxRate: line.taxRate,
              taxAmount: line.taxAmount,
              total: line.total,
              itemType: line.itemType,
            })),
          },
        },
        include: { items: { include: { item: true } }, customer: true, warehouse: true },
      });

      let costOfGoods = 0;
      for (const [itemId, quantity] of quantities) {
        const product = products.get(itemId)!;
        await tx.stockBalance.update({
          where: { itemId_warehouseId: { itemId, warehouseId: quotation.warehouseId } },
          data: { quantity: { decrement: quantity } },
        });
        const totalCost = quantity * product.avgCost;
        costOfGoods += totalCost;
        await tx.stockTransaction.create({
          data: {
            itemId,
            warehouseId: quotation.warehouseId,
            type: 'SALE',
            quantity: -quantity,
            unitCost: product.avgCost,
            totalCost: -totalCost,
            referenceType: 'SalesInvoice',
            referenceId: invoice.id,
            notes: `بيع بموجب فاتورة ${invoiceNumber} المحولة من عرض السعر ${quotation.invoiceNumber}`,
          },
        });
      }

      const revenue = invoice.grandTotal - invoice.taxAmount;
      await postJournalEntry(tx, {
        journalCode: 'SAL',
        memo: `فاتورة بيع ${invoiceNumber} من عرض السعر ${quotation.invoiceNumber}`,
        referenceType: 'SalesInvoice',
        referenceId: invoice.id,
        branchId: invoice.branchId,
        createdById: req.user?.id || null,
        lines: [
          ...(cash > 0 ? [{ accountCode: '1000', debit: cash, label: 'تحصيل نقدي' }] : []),
          ...(card > 0 ? [{ accountCode: '1010', debit: card, label: 'تحصيل بالبطاقة' }] : []),
          ...(remainingAmount > 0 ? [{
            accountCode: '1100',
            debit: remainingAmount,
            label: 'ذمم العميل',
            partnerType: 'CUSTOMER',
            partnerId: invoice.customerId || undefined,
          }] : []),
          ...(revenue > 0 ? [{ accountCode: '4000', credit: revenue, label: 'إيراد بيع قطع غيار' }] : []),
          ...(invoice.taxAmount > 0 ? [{ accountCode: '2100', credit: invoice.taxAmount, label: 'ضريبة قيمة مضافة - مخرجات' }] : []),
          ...(costOfGoods > 0 ? [
            { accountCode: '5000', debit: costOfGoods, label: 'تكلفة البضاعة المباعة' },
            { accountCode: '1200', credit: costOfGoods, label: 'تخفيض المخزون المباع' },
          ] : []),
        ],
      });

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
              referenceId: invoice.id,
              partyType: 'CUSTOMER',
              partyName: invoice.customer?.name || 'عميل نقدي',
              description: `تحصيل فاتورة ${invoiceNumber} المحولة من عرض السعر ${quotation.invoiceNumber}`,
            },
          });
        }
      }
      if (invoice.customerId && remainingAmount > 0) {
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { currentBalance: { increment: remainingAmount } },
        });
      }
      await tx.salesInvoice.update({
        where: { id: quotation.id },
        data: { status: 'CONVERTED' },
      });
      return { invoice, alreadyConverted: false };
    });

    if (!result.alreadyConverted) {
      await logAudit({
        action: 'CONVERT',
        entity: 'SalesQuotation',
        entityId: req.params.id,
        details: `تحويل عرض السعر إلى الفاتورة ${result.invoice.invoiceNumber}`,
      });
    }
    res.status(result.alreadyConverted ? 200 : 201).json(result.invoice);
  } catch (error: any) {
    console.error('Sales quotation conversion failed:', error);
    res.status(400).json({ error: error.message || 'تعذر تحويل عرض السعر إلى فاتورة' });
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

    if (!originalInvoice || originalInvoice.invoiceType === 'QUOTATION') {
      return res.status(404).json({ error: 'الفاتورة الأصلية غير موجودة أو غير قابلة للإرجاع' });
    }

    const count = await prisma.salesReturn.count();
    const returnNumber = `RET-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const subtotal = items.reduce((sum: number, it: any) => sum + (parseFloat(it.unitPrice) * parseInt(it.quantity)), 0);
    const taxAmount = 0;
    const totalAmount = subtotal;

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
        salesInvoices: { where: { invoiceType: { not: 'QUOTATION' } }, orderBy: { date: 'desc' } },
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
