import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { postJournalEntry } from '../services/accounting';

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
    const { categoryId, beneficiary, amount, taxAmount = 0, paymentMethod = 'CASH', cashboxId, bankId, description } = req.body;

    const count = await prisma.expense.count();
    const expenseNumber = `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
    const totalAmount = parseFloat(amount) + parseFloat(taxAmount || 0);

    const expense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          expenseNumber,
          categoryId,
          beneficiary,
          amount: parseFloat(amount),
          taxAmount: parseFloat(taxAmount || 0),
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
          ...(parseFloat(taxAmount || 0) > 0 ? [{ accountCode: '1300', debit: parseFloat(taxAmount || 0), label: 'ضريبة قيمة مضافة - مدخلات' }] : []),
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
        _count: { select: { transactions: true } },
      },
    });
    res.json(banks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/banks/transactions', async (req, res) => {
  try {
    const { bankId, type, amount, referenceNumber, description } = req.body;
    const amountVal = parseFloat(amount);

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
          referenceNumber,
          description,
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

    res.status(201).json(transaction);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
