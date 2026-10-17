import { Router } from 'express';
import { createHash } from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { postJournalEntry } from '../services/accounting';
import { findUniqueBankTransactionMatch, isStatementDirection, parseBankStatementCsv } from '../services/bankReconciliation';

const router = Router();

router.get('/cashboxes', async (_req, res) => {
  try {
    const cashboxes = await prisma.cashbox.findMany({ orderBy: { name: 'asc' } });
    res.json(cashboxes);
  } catch (error) {
    console.error('Failed to load cashboxes:', error);
    res.status(500).json({ error: 'تعذر تحميل بيانات الصناديق النقدية' });
  }
});

router.get('/expense-categories', async (_req, res) => {
  try {
    const categories = await prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
    res.json(categories);
  } catch (error) {
    console.error('Failed to load expense categories:', error);
    res.status(500).json({ error: 'تعذر تحميل تصنيفات المصروفات' });
  }
});

// --- Expenses ---
router.get('/expenses', async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({
      include: { category: true, cashbox: true, bank: true },
      orderBy: { date: 'desc' },
    });
    res.json(expenses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/expenses', async (req, res) => {
  try {
    const { categoryId, beneficiary, amount, paymentMethod = 'CASH', cashboxId, bankId, description } = req.body;

    const count = await prisma.expense.count();
    const expenseNumber = `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
    const totalAmount = parseFloat(amount);

    const expense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          expenseNumber,
          categoryId,
          beneficiary,
          amount: parseFloat(amount),
          taxAmount: 0,
          totalAmount,
          paymentMethod,
          cashboxId: paymentMethod === 'CASH' ? cashboxId : null,
          bankId: paymentMethod === 'BANK' ? bankId : null,
          description,
        },
      });

      // Deduct from cashbox or bank
      if (paymentMethod === 'CASH' && cashboxId) {
        await tx.cashbox.update({
          where: { id: cashboxId },
          data: { balance: { decrement: totalAmount } },
        });

        await tx.cashTransaction.create({
          data: {
            cashboxId,
            type: 'PAYMENT',
            amount: totalAmount,
            referenceType: 'EXPENSE',
            referenceId: exp.id,
            partyType: 'SUPPLIER',
            partyName: beneficiary || 'جهة خارجية',
            description: `صرف سند مصروف رقم ${expenseNumber}: ${description || ''}`,
          },
        });
      } else if (paymentMethod === 'BANK' && bankId) {
        await tx.bank.update({
          where: { id: bankId },
          data: { currentBalance: { decrement: totalAmount } },
        });

        await tx.bankTransaction.create({
          data: {
            bankId,
            type: 'WITHDRAWAL',
            amount: totalAmount,
            referenceNumber: expenseNumber,
            description: `سداد مصروف رقم ${expenseNumber}: ${description || ''}`,
          },
        });
      }

      await postJournalEntry(tx, {
        journalCode: paymentMethod === 'BANK' ? 'BNK' : 'CSH',
        memo: `مصروف ${expenseNumber}`,
        referenceType: 'Expense',
        referenceId: exp.id,
        lines: [
          ...(parseFloat(amount) > 0 ? [{ accountCode: '6000', debit: parseFloat(amount), label: description || 'مصروف تشغيلي' }] : []),
          ...(totalAmount > 0 ? [{
            accountCode: paymentMethod === 'CASH' ? '1000' : paymentMethod === 'BANK' ? '1020' : '2990',
            credit: totalAmount,
            label: `سداد مصروف - ${paymentMethod}`,
          }] : []),
        ],
      });

      return exp;
    });

    await logAudit({ action: 'CREATE', entity: 'Expense', entityId: expense.id, details: `تسجيل سند مصروف ${expenseNumber} بمبلغ ${totalAmount} ج.م` });

    res.status(201).json(expense);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Revenues ---
router.get('/revenues', async (req, res) => {
  try {
    const revenues = await prisma.revenue.findMany({
      include: { category: true, cashbox: true, bank: true },
      orderBy: { date: 'desc' },
    });
    res.json(revenues);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/revenues', async (req, res) => {
  try {
    const { categoryId, source, amount, paymentMethod = 'CASH', cashboxId, bankId, description } = req.body;

    const count = await prisma.revenue.count();
    const revenueNumber = `REV-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
    const amountVal = parseFloat(amount);

    const revenue = await prisma.$transaction(async (tx) => {
      const rev = await tx.revenue.create({
        data: {
          revenueNumber,
          categoryId,
          source,
          amount: amountVal,
          paymentMethod,
          cashboxId: paymentMethod === 'CASH' ? cashboxId : null,
          bankId: paymentMethod === 'BANK' ? bankId : null,
          description,
        },
      });

      if (paymentMethod === 'CASH' && cashboxId) {
        await tx.cashbox.update({
          where: { id: cashboxId },
          data: { balance: { increment: amountVal } },
        });
      } else if (paymentMethod === 'BANK' && bankId) {
        await tx.bank.update({
          where: { id: bankId },
          data: { currentBalance: { increment: amountVal } },
        });
      }

      await postJournalEntry(tx, {
        journalCode: paymentMethod === 'BANK' ? 'BNK' : 'CSH',
        memo: `إيراد ${revenueNumber}`,
        referenceType: 'Revenue',
        referenceId: rev.id,
        lines: [
          ...(amountVal > 0 ? [{
            accountCode: paymentMethod === 'CASH' ? '1000' : paymentMethod === 'BANK' ? '1020' : paymentMethod === 'CARD' ? '1010' : '2990',
            debit: amountVal,
            label: `تحصيل إيراد - ${paymentMethod}`,
          }] : []),
          ...(amountVal > 0 ? [{ accountCode: '4900', credit: amountVal, label: description || source || 'إيراد آخر' }] : []),
        ],
      });

      return rev;
    });

    await logAudit({ action: 'CREATE', entity: 'Revenue', entityId: revenue.id, details: `تسجيل إيراد ${revenueNumber} بمبلغ ${amountVal} ج.م` });

    res.status(201).json(revenue);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Cashbox Vouchers (Section 12: سند قبض / سند صرف) ---
router.get('/cash/transactions', async (req, res) => {
  try {
    const transactions = await prisma.cashTransaction.findMany({
      include: { cashbox: true, customer: true, supplier: true },
      orderBy: { date: 'desc' },
    });
    res.json(transactions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cash/vouchers', async (req, res) => {
  try {
    const {
      type, // RECEIPT or PAYMENT
      cashboxId,
      amount,
      customerId,
      supplierId,
      partyName,
      description,
      referenceType,
      referenceId,
    } = req.body;

    const amountVal = parseFloat(amount);

    const transaction = await prisma.$transaction(async (tx) => {
      // Update cashbox balance
      if (type === 'RECEIPT') {
        await tx.cashbox.update({
          where: { id: cashboxId },
          data: { balance: { increment: amountVal } },
        });

        // If from customer, reduce customer debt
        if (customerId) {
          await tx.customer.update({
            where: { id: customerId },
            data: { currentBalance: { decrement: amountVal } },
          });
        }
      } else {
        await tx.cashbox.update({
          where: { id: cashboxId },
          data: { balance: { decrement: amountVal } },
        });

        // If to supplier, reduce supplier payable
        if (supplierId) {
          await tx.supplier.update({
            where: { id: supplierId },
            data: { currentBalance: { decrement: amountVal } },
          });
        }
      }

      const txRecord = await tx.cashTransaction.create({
        data: {
          cashboxId,
          type,
          amount: amountVal,
          partyType: customerId ? 'CUSTOMER' : supplierId ? 'SUPPLIER' : 'OTHER',
          partyName,
          customerId: customerId || null,
          supplierId: supplierId || null,
          description,
          referenceType: referenceType || (customerId ? 'CUSTOMER_PAYMENT' : 'SUPPLIER_PAYMENT'),
          referenceId,
        },
      });

      await postJournalEntry(tx, {
        journalCode: 'CSH',
        memo: `${type === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} ${txRecord.id}`,
        referenceType: 'CashTransaction',
        referenceId: txRecord.id,
        lines: type === 'RECEIPT'
          ? [
            { accountCode: '1000', debit: amountVal, label: 'إيداع بالصندوق' },
            customerId
              ? { accountCode: '1100', credit: amountVal, label: 'تحصيل من العميل', partnerType: 'CUSTOMER', partnerId: customerId }
              : { accountCode: '2990', credit: amountVal, label: 'متحصلات أخرى' },
          ]
          : [
            supplierId
              ? { accountCode: '2000', debit: amountVal, label: 'سداد للمورد', partnerType: 'SUPPLIER', partnerId: supplierId }
              : { accountCode: '2990', debit: amountVal, label: 'مدفوعات أخرى' },
            { accountCode: '1000', credit: amountVal, label: 'صرف من الصندوق' },
          ],
      });

      return txRecord;
    });

    await logAudit({
      action: type,
      entity: 'CashTransaction',
      entityId: transaction.id,
      details: `${type === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} بمبلغ ${amountVal} ج.م لصالح/من ${partyName}`,
    });

    res.status(201).json(transaction);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Cash Shifts & Reconciliation (Section 12: تسوية الورديات) ---
router.get('/cash/shifts', async (req, res) => {
  try {
    const shifts = await prisma.cashShift.findMany({
      include: { cashbox: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(shifts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cash/shifts/close', async (req, res) => {
  try {
    const { shiftId, actualCash, differenceReason, notes } = req.body;

    const shift = await prisma.cashShift.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: 'الوردية غير موجودة' });

    const actual = parseFloat(actualCash);
    const diff = actual - shift.expectedCash;

    const closed = await prisma.cashShift.update({
      where: { id: shiftId },
      data: {
        endTime: new Date(),
        actualCash: actual,
        difference: diff,
        differenceReason: differenceReason || null,
        status: 'CLOSED',
        notes: notes || shift.notes,
      },
    });

    await logAudit({
      action: 'CLOSE_SHIFT',
      entity: 'CashShift',
      entityId: shiftId,
      details: `إغلاق وردية الكاشير رقم ${shift.shiftNumber} بفارق نقدي ${diff} ج.م`,
    });

    res.json(closed);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Bank Accounts & Transactions (Section 13) ---
router.get('/banks', async (req, res) => {
  try {
    const banks = await prisma.bank.findMany({
      include: {
        transactions: { take: 10, orderBy: { date: 'desc' } },
        reconciliations: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { lines: { select: { matchedAt: true } } },
        },
        _count: { select: { transactions: true } },
      },
    });
    res.json(banks.map(({ reconciliations, ...bank }) => ({
      ...bank,
      reconciliations: reconciliations.map(({ lines, ...reconciliation }) => ({
        ...reconciliation,
        matchedCount: lines.filter((line) => line.matchedAt).length,
        unmatchedCount: lines.filter((line) => !line.matchedAt).length,
      })),
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/banks/:bankId/reconciliations', async (req, res) => {
  try {
    const reconciliations = await prisma.bankReconciliation.findMany({
      where: { bankId: req.params.bankId },
      include: {
        _count: { select: { lines: true } },
        lines: { select: { matchedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(reconciliations.map(({ lines, ...reconciliation }) => ({
      ...reconciliation,
      matchedCount: lines.filter((line) => line.matchedAt).length,
      unmatchedCount: lines.filter((line) => !line.matchedAt).length,
    })));
  } catch (error) {
    console.error('Failed to list bank reconciliations:', error);
    res.status(500).json({ error: 'تعذر تحميل مطابقات كشف الحساب' });
  }
});

router.post('/banks/:bankId/reconciliations', async (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { csv, fileName } = req.body || {};
  if (typeof csv !== 'string' || typeof fileName !== 'string' || !fileName.trim()) {
    return res.status(400).json({ error: 'أرفق ملف CSV وحدد اسمه' });
  }
  if (!fileName.toLocaleLowerCase().endsWith('.csv')) {
    return res.status(400).json({ error: 'صيغة كشف الحساب المدعومة هي CSV فقط' });
  }
  let lines;
  try {
    lines = parseBankStatementCsv(csv);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'تنسيق كشف الحساب غير صالح' });
  }

  try {
    const bank = await prisma.bank.findUnique({ where: { id: req.params.bankId }, select: { id: true } });
    if (!bank) return res.status(404).json({ error: 'الحساب البنكي غير موجود' });

    const contentHash = createHash('sha256').update(csv, 'utf8').digest('hex');
    const orderedDates = lines.map((line) => line.transactionDate.getTime()).sort((a, b) => a - b);
    const created = await prisma.$transaction(async (tx) => {
      const reconciliation = await tx.bankReconciliation.create({
        data: {
          bankId: bank.id,
          fileName: fileName.trim().replace(/[\\/]/g, '_').slice(0, 180),
          contentHash,
          statementStart: new Date(orderedDates[0]),
          statementEnd: new Date(orderedDates[orderedDates.length - 1]),
          importedById: authenticatedReq.user?.id,
          lines: { create: lines },
        },
        include: { lines: true },
      });

      let matchedCount = 0;
      for (const line of reconciliation.lines) {
        const direction = line.direction;
        if (!isStatementDirection(direction)) {
          throw new Error(`اتجاه غير صالح في سطر كشف الحساب ${line.id}`);
        }
        const dateStart = new Date(line.transactionDate);
        dateStart.setUTCDate(dateStart.getUTCDate() - 3);
        const dateEnd = new Date(line.transactionDate);
        dateEnd.setUTCDate(dateEnd.getUTCDate() + 3);
        const candidates = await tx.bankTransaction.findMany({
          where: {
            bankId: bank.id,
            reconciledAt: null,
            type: direction === 'CREDIT' ? { in: ['DEPOSIT', 'CARD_SETTLEMENT'] } : 'WITHDRAWAL',
            amount: { gte: line.amount - 0.01, lte: line.amount + 0.01 },
            date: { gte: dateStart, lte: dateEnd },
          },
          select: { id: true, type: true, amount: true, date: true, referenceNumber: true },
        });
        const match = findUniqueBankTransactionMatch({ ...line, direction }, candidates);
        if (!match) continue;
        const updated = await tx.bankTransaction.updateMany({
          where: { id: match.id, reconciledAt: null },
          data: {
            reconciledAt: new Date(),
            reconciledById: authenticatedReq.user?.id,
            statementReference: line.referenceNumber,
          },
        });
        if (updated.count !== 1) continue;
        await tx.bankStatementLine.update({
          where: { id: line.id },
          data: { matchedTransactionId: match.id, matchedAt: new Date() },
        });
        matchedCount += 1;
      }
      return { reconciliation, matchedCount };
    });

    await logAudit({
      userId: authenticatedReq.user?.id,
      action: 'IMPORT_BANK_STATEMENT',
      entity: 'BankReconciliation',
      entityId: created.reconciliation.id,
      details: `استيراد ${lines.length} حركة من كشف الحساب ${fileName}; تمت مطابقة ${created.matchedCount} حركة تلقائيًا`,
      ipAddress: req.ip,
    });
    res.status(201).json({
      id: created.reconciliation.id,
      bankId: bank.id,
      fileName: created.reconciliation.fileName,
      statementStart: created.reconciliation.statementStart,
      statementEnd: created.reconciliation.statementEnd,
      lineCount: lines.length,
      matchedCount: created.matchedCount,
      unmatchedCount: lines.length - created.matchedCount,
    });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'تم استيراد هذا الملف من قبل لهذا الحساب البنكي' });
    console.error('Failed to import bank statement:', error);
    res.status(500).json({ error: 'تعذر استيراد كشف الحساب' });
  }
});

router.get('/banks/reconciliations/:id', async (req, res) => {
  try {
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: req.params.id },
      include: {
        bank: { select: { id: true, bankName: true, accountNumber: true } },
        lines: {
          include: {
            matchedTransaction: {
              select: { id: true, type: true, amount: true, date: true, referenceNumber: true, description: true },
            },
          },
          orderBy: { transactionDate: 'asc' },
        },
      },
    });
    if (!reconciliation) return res.status(404).json({ error: 'مطابقة كشف الحساب غير موجودة' });
    const dateStart = new Date(reconciliation.statementStart);
    dateStart.setUTCDate(dateStart.getUTCDate() - 31);
    const dateEnd = new Date(reconciliation.statementEnd);
    dateEnd.setUTCDate(dateEnd.getUTCDate() + 31);
    const availableTransactions = await prisma.bankTransaction.findMany({
      where: {
        bankId: reconciliation.bankId,
        reconciledAt: null,
        date: { gte: dateStart, lte: dateEnd },
      },
      select: { id: true, type: true, amount: true, date: true, referenceNumber: true, description: true },
      orderBy: { date: 'asc' },
      take: 1000,
    });
    res.json({ ...reconciliation, availableTransactions });
  } catch (error) {
    console.error('Failed to load bank reconciliation:', error);
    res.status(500).json({ error: 'تعذر تحميل تفاصيل المطابقة' });
  }
});

router.post('/banks/reconciliations/:id/match', async (req: AuthenticatedRequest, res) => {
  const { lineId, transactionId } = req.body || {};
  if (typeof lineId !== 'string' || typeof transactionId !== 'string') {
    return res.status(400).json({ error: 'حدد حركة كشف الحساب والحركة البنكية' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const reconciliation = await tx.bankReconciliation.findUnique({
        where: { id: req.params.id },
        include: { lines: { where: { id: lineId } } },
      });
      if (!reconciliation) throw new Error('مطابقة كشف الحساب غير موجودة');
      if (reconciliation.completedAt) throw new Error('لا يمكن تعديل مطابقة مكتملة');
      const line = reconciliation.lines[0];
      if (!line || line.matchedTransactionId) throw new Error('سطر كشف الحساب غير موجود أو تمت مطابقته بالفعل');
      if (!isStatementDirection(line.direction)) throw new Error('اتجاه سطر كشف الحساب غير صالح');
      const transaction = await tx.bankTransaction.findFirst({
        where: { id: transactionId, bankId: reconciliation.bankId, reconciledAt: null },
      });
      if (!transaction) throw new Error('الحركة البنكية غير موجودة أو تمت مطابقتها بالفعل');
      const expectedTypes = line.direction === 'CREDIT' ? ['DEPOSIT', 'CARD_SETTLEMENT'] : ['WITHDRAWAL'];
      if (!expectedTypes.includes(transaction.type) || Math.abs(transaction.amount - line.amount) > 0.01) {
        throw new Error('يجب أن يتساوى اتجاه ومبلغ الحركة البنكية مع سطر الكشف');
      }
      const changed = await tx.bankTransaction.updateMany({
        where: { id: transaction.id, reconciledAt: null },
        data: {
          reconciledAt: new Date(),
          reconciledById: req.user?.id,
          statementReference: line.referenceNumber,
        },
      });
      if (changed.count !== 1) throw new Error('تمت مطابقة الحركة من مستخدم آخر؛ أعد تحميل الكشف');
      const lineUpdate = await tx.bankStatementLine.updateMany({
        where: { id: line.id, matchedTransactionId: null },
        data: { matchedTransactionId: transaction.id, matchedAt: new Date() },
      });
      if (lineUpdate.count !== 1) throw new Error('تمت مطابقة سطر كشف الحساب من مستخدم آخر؛ أعد تحميل الكشف');
      return { lineId: line.id, transactionId: transaction.id };
    });
    await logAudit({
      userId: req.user?.id,
      action: 'MATCH_BANK_STATEMENT_LINE',
      entity: 'BankReconciliation',
      entityId: req.params.id,
      details: `مطابقة سطر كشف الحساب ${result.lineId} مع الحركة البنكية ${result.transactionId}`,
      ipAddress: req.ip,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'تعذر مطابقة الحركة البنكية' });
  }
});

router.post('/banks/reconciliations/:id/complete', async (req: AuthenticatedRequest, res) => {
  try {
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { lines: true } } },
    });
    if (!reconciliation) return res.status(404).json({ error: 'مطابقة كشف الحساب غير موجودة' });
    if (reconciliation.completedAt) return res.status(409).json({ error: 'مطابقة كشف الحساب معتمدة بالفعل' });
    const unmatchedCount = await prisma.bankStatementLine.count({
      where: { reconciliationId: reconciliation.id, matchedTransactionId: null },
    });
    if (unmatchedCount > 0) {
      return res.status(400).json({ error: `تبقى ${unmatchedCount} حركة من كشف الحساب دون مطابقة` });
    }
    const completed = await prisma.bankReconciliation.updateMany({
      where: { id: reconciliation.id, completedAt: null },
      data: { completedAt: new Date() },
    });
    if (completed.count !== 1) return res.status(409).json({ error: 'تم اعتماد المطابقة من مستخدم آخر' });
    await logAudit({
      userId: req.user?.id,
      action: 'COMPLETE_BANK_RECONCILIATION',
      entity: 'BankReconciliation',
      entityId: reconciliation.id,
      details: `اعتماد مطابقة كشف حساب ${reconciliation.fileName}؛ ${reconciliation._count.lines} حركة`,
      ipAddress: req.ip,
    });
    res.json({ success: true, completedAt: new Date() });
  } catch (error) {
    console.error('Failed to complete bank reconciliation:', error);
    res.status(500).json({ error: 'تعذر اعتماد مطابقة كشف الحساب' });
  }
});

router.post('/banks/transactions', async (req, res) => {
  try {
    const { bankId, type, amount, referenceNumber, description, date } = req.body;
    const amountVal = parseFloat(amount);
    if (typeof bankId !== 'string' || !bankId
      || !['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'CARD_SETTLEMENT'].includes(type)
      || !Number.isFinite(amountVal) || amountVal <= 0) {
      return res.status(400).json({ error: 'حدد الحساب ونوع حركة بنكية صحيح ومبلغًا أكبر من صفر' });
    }
    if (referenceNumber !== undefined && referenceNumber !== null && typeof referenceNumber !== 'string') {
      return res.status(400).json({ error: 'رقم مرجع الحركة غير صالح' });
    }
    if (description !== undefined && description !== null && typeof description !== 'string') {
      return res.status(400).json({ error: 'وصف الحركة غير صالح' });
    }
    const transactionDate = date ? new Date(date) : new Date();
    if (!Number.isFinite(transactionDate.getTime())) return res.status(400).json({ error: 'تاريخ الحركة غير صالح' });

    const transaction = await prisma.$transaction(async (tx) => {
      if (type === 'DEPOSIT' || type === 'CARD_SETTLEMENT') {
        await tx.bank.update({
          where: { id: bankId },
          data: { currentBalance: { increment: amountVal } },
        });
      } else {
        await tx.bank.update({
          where: { id: bankId },
          data: { currentBalance: { decrement: amountVal } },
        });
      }

      const bankTransaction = await tx.bankTransaction.create({
        data: {
          bankId,
          type,
          amount: amountVal,
          date: transactionDate,
          referenceNumber,
          description,
          createdById: (req as AuthenticatedRequest).user?.id,
        },
      });

      const cashAccountSide = type === 'DEPOSIT' || type === 'CARD_SETTLEMENT'
        ? { accountCode: '1020', debit: amountVal, label: 'إيداع بالبنك' }
        : { accountCode: '1020', credit: amountVal, label: 'سحب من البنك' };
      const counterpartSide = type === 'CARD_SETTLEMENT'
        ? { accountCode: '1010', credit: amountVal, label: 'تسوية متحصلات البطاقات' }
        : type === 'DEPOSIT'
          ? { accountCode: '2990', credit: amountVal, label: 'إيداع بنكي غير مصنف' }
          : { accountCode: '2990', debit: amountVal, label: 'سحب بنكي غير مصنف' };
      await postJournalEntry(tx, {
        journalCode: 'BNK',
        memo: description || `حركة بنكية ${type}`,
        referenceType: 'BankTransaction',
        referenceId: bankTransaction.id,
        lines: [cashAccountSide, counterpartSide],
      });
      return bankTransaction;
    });

    await logAudit({
      userId: (req as AuthenticatedRequest).user?.id,
      action: 'CREATE_BANK_TRANSACTION',
      entity: 'BankTransaction',
      entityId: transaction.id,
      details: `تسجيل حركة ${type} بمبلغ ${amountVal} ج.م`,
      ipAddress: req.ip,
    });
    res.status(201).json(transaction);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
