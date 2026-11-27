import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { sendInvoicePdf } from '../services/whatsapp';
import { nextInvoiceNumber, withInvoiceTransaction } from '../services/documentNumbers';
import { postJournalEntry } from '../services/accounting';
import { branchWhere } from '../services/branchScope';
import { buildSalesReturnSnapshot } from '../services/salesReturns';
import { isValidPosLines } from '../services/posLineValidation';

const router = Router();

router.get('/receivables/aging', async (req: AuthenticatedRequest, res) => {
  try {
    const invoices = await prisma.salesInvoice.findMany({
      where: {
        ...branchWhere(req),
        invoiceType: { not: 'QUOTATION' },
        remainingAmount: { gt: 0 },
        status: { in: ['POSTED', 'PARTIALLY_PAID'] },
        customerId: { not: null },
      },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { date: 'asc' },
    });
    const today = Date.now();
    const customerTotals = new Map<string, any>();
    for (const invoice of invoices) {
      if (!invoice.customer) continue;
      const ageDays = Math.max(0, Math.floor((today - invoice.date.getTime()) / 86_400_000));
      const total = customerTotals.get(invoice.customer.id) || {
        customer: invoice.customer,
        current: 0,
        days31To60: 0,
        days61To90: 0,
        over90Days: 0,
        total: 0,
        invoices: [],
      };
      const balance = invoice.remainingAmount;
      if (ageDays <= 30) total.current += balance;
      else if (ageDays <= 60) total.days31To60 += balance;
      else if (ageDays <= 90) total.days61To90 += balance;
      else total.over90Days += balance;
      total.total += balance;
      total.invoices.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.date,
        ageDays,
        remainingAmount: balance,
      });
      customerTotals.set(invoice.customer.id, total);
    }
    res.json([...customerTotals.values()].sort((a, b) => b.total - a.total));
  } catch (error) {
    console.error('Failed to build receivables aging report:', error);
    res.status(500).json({ error: 'تعذر تحميل تقرير أعمار مديونية العملاء' });
  }
});

router.post('/invoices/:id/payments', async (req: AuthenticatedRequest, res) => {
  const requestedAmount = Number(req.body?.amount);
  const amount = Number.isFinite(requestedAmount) ? Math.round(requestedAmount * 100) / 100 : Number.NaN;
  const paymentMethod = req.body?.paymentMethod;
  const cashboxId = typeof req.body?.cashboxId === 'string' ? req.body.cashboxId : null;
  if (!Number.isFinite(amount) || amount <= 0 || !['CASH', 'CARD', 'BANK'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'قيمة التحصيل وطريقة الدفع غير صالحتين' });
  }
  if (paymentMethod === 'CASH' && !cashboxId) {
    return res.status(400).json({ error: 'اختر الخزينة لاستلام المبلغ النقدي' });
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findFirst({
        where: { id: req.params.id, ...branchWhere(req) },
      });
      if (!invoice || !invoice.customerId) throw new Error('فاتورة العميل غير موجودة');
      if (!['POSTED', 'PARTIALLY_PAID'].includes(invoice.status) || invoice.remainingAmount <= 0) {
        throw new Error('لا توجد مديونية مفتوحة على هذه الفاتورة');
      }
      if (amount > invoice.remainingAmount) throw new Error('قيمة التحصيل تتجاوز المتبقي على الفاتورة');
      if (paymentMethod === 'CASH') {
        const cashbox = await tx.cashbox.findUnique({ where: { id: cashboxId! } });
        if (!cashbox?.active) throw new Error('الخزينة غير موجودة أو غير نشطة');
        if (
          req.user?.role !== 'admin' &&
          cashbox.branchId &&
          cashbox.branchId !== req.user?.branchId
        ) throw new Error('لا تملك صلاحية التحصيل على خزينة فرع آخر');
      }

      const remainingAmount = Math.round(Math.max(0, invoice.remainingAmount - amount) * 100) / 100;
      const nextStatus = remainingAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
      let cashTransactionId: string | null = null;
      if (paymentMethod === 'CASH') {
        const cashTransaction = await tx.cashTransaction.create({
          data: {
            cashboxId: cashboxId!,
            type: 'RECEIPT',
            amount,
            referenceType: 'CUSTOMER_PAYMENT',
            referenceId: invoice.id,
            partyType: 'CUSTOMER',
            customerId: invoice.customerId,
            description: `تحصيل فاتورة ${invoice.invoiceNumber}`,
            createdById: req.user?.id,
          },
        });
        await tx.cashbox.update({
          where: { id: cashboxId! },
          data: { balance: { increment: amount } },
        });
        cashTransactionId = cashTransaction.id;
      }
      const createdPayment = await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          amount,
          paymentMethod,
          cashboxId,
          cashTransactionId,
          notes: typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : null,
        },
      });
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { remainingAmount, status: nextStatus },
      });
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: { currentBalance: { decrement: amount } },
      });
      const debitAccount = paymentMethod === 'CASH' ? '1000' : paymentMethod === 'CARD' ? '1010' : '1020';
      await postJournalEntry(tx, {
        journalCode: 'CSH',
        memo: `تحصيل فاتورة ${invoice.invoiceNumber}`,
        referenceType: 'InvoicePayment',
        referenceId: createdPayment.id,
        branchId: invoice.branchId,
        lines: [
          { accountCode: debitAccount, debit: amount, label: `تحصيل ${paymentMethod}` },
          {
            accountCode: '1100',
            credit: amount,
            label: `تحصيل مديونية ${invoice.invoiceNumber}`,
            partnerType: 'CUSTOMER',
            partnerId: invoice.customerId,
          },
        ],
      });
      return { ...createdPayment, invoiceNumber: invoice.invoiceNumber, remainingAmount };
    });
    await logAudit({
      userId: req.user?.id,
      action: 'RECEIPT',
      entity: 'InvoicePayment',
      entityId: payment.id,
      details: `تحصيل ${amount} ج.م من فاتورة ${payment.invoiceNumber}`,
      ipAddress: req.ip,
    });
    res.status(201).json(payment);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر تسجيل التحصيل';
    res.status(message === 'فاتورة العميل غير موجودة' ? 404 : 400).json({ error: message });
  }
});

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

router.get('/pos/held', async (req: AuthenticatedRequest, res) => {
  try {
    const heldInvoices = await prisma.posHeldInvoice.findMany({
      where: branchWhere(req),
      orderBy: { updatedAt: 'desc' },
    });
    res.json(heldInvoices.map((invoice) => ({
      id: invoice.id,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      ...JSON.parse(invoice.payload),
    })));
  } catch (error) {
    console.error('Failed to load held POS invoices:', error);
    res.status(500).json({ error: 'تعذر تحميل الفواتير المعلقة' });
  }
});

router.post('/pos/held', async (req: AuthenticatedRequest, res) => {
  const { customerId = null, vehicleId = null, items, discount = 0 } = req.body || {};
  if (
    !isValidPosLines(items)
    || !Number.isFinite(Number(discount)) || Number(discount) < 0
    || (customerId !== null && typeof customerId !== 'string')
    || (vehicleId !== null && typeof vehicleId !== 'string')
  ) {
    return res.status(400).json({ error: 'بيانات الفاتورة المعلقة غير مكتملة أو غير صالحة' });
  }

  try {
    const heldInvoice = await prisma.posHeldInvoice.create({
      data: {
        branchId: req.user?.branchId || null,
        createdById: req.user?.id || null,
        payload: JSON.stringify({
          customerId,
          vehicleId,
          discount: Number(discount),
          items: items.map((item) => ({
            itemId: item.itemId,
            ...(item.itemId === null ? {
              description: String(item.description).trim(),
              itemType: 'LABOR',
            } : {}),
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
        }),
      },
    });
    res.status(201).json({
      id: heldInvoice.id,
      createdAt: heldInvoice.createdAt,
      updatedAt: heldInvoice.updatedAt,
      customerId,
      vehicleId,
      discount: Number(discount),
      items: items.map((item) => ({
        itemId: item.itemId,
        ...(item.itemId === null ? { description: String(item.description).trim(), itemType: 'LABOR' } : {}),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
    });
  } catch (error) {
    console.error('Failed to hold POS invoice:', error);
    res.status(500).json({ error: 'تعذر تعليق الفاتورة' });
  }
});

router.delete('/pos/held/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const result = await prisma.posHeldInvoice.deleteMany({
      where: { id: req.params.id, ...branchWhere(req) },
    });
    if (result.count === 0) return res.status(404).json({ error: 'الفاتورة المعلقة غير موجودة' });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to remove held POS invoice:', error);
    res.status(500).json({ error: 'تعذر حذف الفاتورة المعلقة' });
  }
});

router.post('/pos/items', async (req: AuthenticatedRequest, res) => {
  const hasPermission = (permission: string) =>
    req.authenticatedRole === 'admin' || req.rolePermissions?.includes(permission) === true;
  if (!hasPermission('manage_items') || !hasPermission('manage_item_prices')) {
    return res.status(403).json({ error: 'إضافة صنف للمخزون من نقطة البيع تتطلب صلاحية إدارة الأصناف والأسعار' });
  }

  const nameAr = typeof req.body?.nameAr === 'string' ? req.body.nameAr.trim() : '';
  const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId.trim() : '';
  const unitId = typeof req.body?.unitId === 'string' ? req.body.unitId.trim() : '';
  const sellPrice = Number(req.body?.sellPrice);
  const purchasePrice = Number(req.body?.purchasePrice ?? 0);
  const initialStock = Number(req.body?.initialStock);
  const saleQuantity = Number(req.body?.saleQuantity);
  if (
    !nameAr || nameAr.length > 200 || !categoryId || !unitId
    || !Number.isFinite(sellPrice) || sellPrice < 0
    || !Number.isFinite(purchasePrice) || purchasePrice < 0
    || !Number.isSafeInteger(initialStock) || initialStock < 1
    || !Number.isSafeInteger(saleQuantity) || saleQuantity < 1 || initialStock < saleQuantity
  ) {
    return res.status(400).json({ error: 'بيانات الصنف أو رصيده الافتتاحي غير صالحة؛ يجب أن يغطي الرصيد كمية البيع' });
  }

  const warehouse = await prisma.warehouse.findFirst({ where: { code: 'WH-MAIN', active: true } });
  if (!warehouse) return res.status(400).json({ error: 'لا يوجد مخزن رئيسي نشط لإضافة الصنف' });

  const normalizeName = (value: string) => value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

  try {
    const item = await prisma.$transaction(async (tx) => {
      const category = await tx.itemCategory.findUnique({ where: { id: categoryId } });
      if (!category?.active) throw new Error('التصنيف غير موجود أو غير نشط');
      const unit = await tx.unit.findUnique({ where: { id: unitId } });
      if (!unit) throw new Error('وحدة القياس غير موجودة');

      const categoryItems = await tx.item.findMany({ where: { categoryId }, select: { nameAr: true } });
      if (categoryItems.some((candidate) => normalizeName(candidate.nameAr) === normalizeName(nameAr))) {
        throw new Error('يوجد صنف بهذا الاسم في التصنيف؛ ابحث عنه وأضفه من قائمة الأصناف');
      }

      const createdItem = await tx.item.create({
        data: {
          nameAr,
          sku: `POS-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
          categoryId,
          unitId,
          purchasePrice,
          avgCost: purchasePrice,
          sellPrice,
          specialSellPrice: sellPrice * 0.9,
          minStock: 5,
          maxStock: 100,
        },
      });
      await tx.stockBalance.create({
        data: { itemId: createdItem.id, warehouseId: warehouse.id, quantity: initialStock },
      });
      await tx.stockTransaction.create({
        data: {
          itemId: createdItem.id,
          warehouseId: warehouse.id,
          type: 'ADJUSTMENT',
          quantity: initialStock,
          unitCost: purchasePrice,
          totalCost: initialStock * purchasePrice,
          referenceType: 'Initial',
          notes: 'رصيد افتتاحي عند تعريف الصنف من نقطة البيع',
          createdById: req.user?.id,
        },
      });
      return createdItem;
    });

    await logAudit({
      userId: req.user?.id,
      action: 'CREATE',
      entity: 'Item',
      entityId: item.id,
      details: `إضافة صنف من نقطة البيع: ${item.nameAr} (${item.sku}) برصيد افتتاحي ${initialStock}`,
      ipAddress: req.ip,
    });
    res.status(201).json({ ...item, availableQuantity: initialStock, totalQuantity: initialStock });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر إضافة الصنف للمخزون';
    res.status(message.includes('يوجد صنف') ? 409 : 400).json({ error: message });
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

    if (
      !isValidPosLines(items)
    ) {
      return res.status(400).json({ error: 'يجب اختيار أصناف صالحة للبيع مع تحديد السعر والكمية' });
    }
    if (!Number.isFinite(Number(discount)) || Number(discount) < 0) {
      return res.status(400).json({ error: 'قيمة الخصم غير صالحة' });
    }

    const defaultWarehouse = warehouseId || (await prisma.warehouse.findFirst({ where: { code: 'WH-MAIN' } }))?.id;

    // Check stock availability
    for (const it of items) {
      if (it.itemId === null) continue;
      const balance = await prisma.stockBalance.findUnique({
        where: {
          itemId_warehouseId: {
            itemId: it.itemId,
            warehouseId: defaultWarehouse!,
          },
        },
      });

      if (!balance || balance.quantity < Number(it.quantity)) {
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
                if (it.itemId === null) {
                  return {
                    itemId: null,
                    description: String(it.description).trim(),
                    quantity: Number(it.quantity),
                    unitPrice: Number(it.unitPrice),
                    costPrice: 0,
                    discount: 0,
                    taxRate: 0,
                    taxAmount: 0,
                    total: Number(it.unitPrice) * Number(it.quantity),
                    itemType: 'LABOR',
                  };
                }
                const itemObj = await tx.item.findUnique({ where: { id: it.itemId } });
                if (!itemObj || !itemObj.active) throw new Error(`الصنف ${it.itemId} غير موجود أو غير نشط`);
                const itemTotal = Number(it.unitPrice) * Number(it.quantity);
                return {
                  itemId: it.itemId,
                  description: itemObj?.nameAr || null,
                  quantity: Number(it.quantity),
                  unitPrice: Number(it.unitPrice),
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
        if (it.itemId === null) continue;
        const qty = Number(it.quantity);
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
    if (typeof salesInvoiceId !== 'string' || !salesInvoiceId || !Array.isArray(items)) {
      return res.status(400).json({ error: 'بيانات مرتجع المبيعات غير صالحة' });
    }
    const requestedItems = items.map((item: any) => ({
      itemId: typeof item?.itemId === 'string' ? item.itemId : '',
      quantity: Number(item?.quantity),
    }));

    const returnRecord = await prisma.$transaction(async (tx) => {
      const originalInvoice = await tx.salesInvoice.findUnique({
        where: { id: salesInvoiceId },
        include: {
          items: true,
          returns: { where: { status: 'POSTED' }, include: { items: true } },
        },
      });
      if (!originalInvoice || originalInvoice.invoiceType === 'QUOTATION') {
        throw new Error('الفاتورة الأصلية غير موجودة أو غير قابلة للإرجاع');
      }
      if (!originalInvoice.warehouseId) {
        throw new Error('لا يوجد مخزن مرتبط بالفاتورة لإعادة القطع إليه');
      }
      const snapshot = buildSalesReturnSnapshot({
        subtotal: originalInvoice.subtotal,
        discount: originalInvoice.discount,
        taxAmount: originalInvoice.taxAmount,
        items: originalInvoice.items,
        existingReturns: originalInvoice.returns.flatMap((salesReturn) => salesReturn.items),
        requestedItems,
      });
      const count = await tx.salesReturn.count();
      const returnNumber = `RET-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

      const ret = await tx.salesReturn.create({
        data: {
          returnNumber,
          salesInvoiceId,
          customerId: originalInvoice.customerId,
          subtotal: snapshot.subtotal,
          discount: snapshot.discount,
          taxAmount: snapshot.taxAmount,
          totalAmount: snapshot.totalAmount,
          profitBasis: 'ORIGINAL_INVOICE',
          reason: reason || null,
          items: {
            create: snapshot.items.map((item) => ({
              ...item,
              costPriceIsEstimated: false,
            })),
          },
        },
      });

      for (const item of snapshot.items) {
        await tx.stockBalance.update({
          where: { itemId_warehouseId: { itemId: item.itemId, warehouseId: originalInvoice.warehouseId } },
          data: { quantity: { increment: item.quantity } },
        });
        await tx.stockTransaction.create({
          data: {
            itemId: item.itemId,
            warehouseId: originalInvoice.warehouseId,
            type: 'SALE_RETURN',
            quantity: item.quantity,
            unitCost: item.costPrice,
            totalCost: item.quantity * item.costPrice,
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
          data: { currentBalance: { decrement: Math.min(snapshot.totalAmount, originalInvoice.remainingAmount) } },
        });
      }

      return ret;
    });

    await logAudit({
      action: 'POST',
      entity: 'SalesReturn',
      entityId: returnRecord.id,
      details: `إصدار مرتجع مبيعات ${returnRecord.returnNumber} بمبلغ ${returnRecord.totalAmount} ج.م`,
    });

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
