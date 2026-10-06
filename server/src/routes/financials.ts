import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';

const router = Router();

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

      return exp;
    });

    await logAudit({ action: 'CREATE', entity: 'Expense', entityId: expense.id, details: `تسجيل سند مصروف ${expenseNumber} بمبلغ ${totalAmount} ر.س` });

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

      return rev;
    });

    await logAudit({ action: 'CREATE', entity: 'Revenue', entityId: revenue.id, details: `تسجيل إيراد ${revenueNumber} بمبلغ ${amountVal} ر.س` });

    res.status(201).json(revenue);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Cashbox Vouchers (Section 12: سند قبض / سند صرف) ---
router.get('/cash/transactions', async (req, res) => {
  try {
    const transactions = await prisma.cashTransaction.findMany({
      include: { cashbox: true },
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
          description,
          referenceType: referenceType || (customerId ? 'CUSTOMER_PAYMENT' : 'SUPPLIER_PAYMENT'),
          referenceId,
        },
      });

      return txRecord;
    });

    await logAudit({
      action: type,
      entity: 'CashTransaction',
      entityId: transaction.id,
      details: `${type === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} بمبلغ ${amountVal} ر.س لصالح/من ${partyName}`,
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
      details: `إغلاق وردية الكاشير رقم ${shift.shiftNumber} بفارق نقدي ${diff} ر.س`,
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

      return await tx.bankTransaction.create({
        data: {
          bankId,
          type,
          amount: amountVal,
          referenceNumber,
          description,
        },
      });
    });

    res.status(201).json(transaction);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
