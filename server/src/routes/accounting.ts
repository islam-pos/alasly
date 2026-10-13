import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { logAudit } from '../middleware/audit';
import { prisma } from '../lib/prisma';
import { postJournalEntry } from '../services/accounting';

const router = Router();
const accountTypes = new Set(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']);

const parseDate = (value: unknown, endOfDay = false) => {
  if (typeof value !== 'string' || !value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
};

router.get('/accounts', async (_req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { journalLines: true } } },
    });
    res.json(accounts);
  } catch (error) {
    console.error('Failed to load chart of accounts:', error);
    res.status(500).json({ error: 'تعذر تحميل دليل الحسابات' });
  }
});

router.post('/accounts', async (req: AuthenticatedRequest, res) => {
  try {
    const { code, nameAr, nameEn, type } = req.body || {};
    if (
      typeof code !== 'string' || !/^[0-9.]{2,20}$/.test(code.trim())
      || typeof nameAr !== 'string' || !nameAr.trim()
      || typeof type !== 'string' || !accountTypes.has(type)
      || (nameEn !== undefined && nameEn !== null && typeof nameEn !== 'string')
    ) {
      return res.status(400).json({ error: 'أدخل رقم الحساب واسمه ونوعه بشكل صحيح' });
    }

    const account = await prisma.account.create({
      data: {
        code: code.trim(),
        nameAr: nameAr.trim(),
        nameEn: typeof nameEn === 'string' && nameEn.trim() ? nameEn.trim() : null,
        type,
      },
    });
    await logAudit({ action: 'CREATE', entity: 'Account', entityId: account.id, details: `إضافة الحساب ${account.code} - ${account.nameAr}` });
    res.status(201).json(account);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'رقم الحساب مستخدم من قبل' });
    console.error('Failed to create account:', error);
    res.status(500).json({ error: 'تعذر إنشاء الحساب' });
  }
});

router.patch('/accounts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { active } = req.body || {};
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'حالة الحساب غير صالحة' });
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });
    if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });
    if (account.isSystem && !active) return res.status(400).json({ error: 'لا يمكن تعطيل حساب نظام أساسي' });
    const updated = await prisma.account.update({ where: { id: account.id }, data: { active } });
    await logAudit({ action: 'UPDATE', entity: 'Account', entityId: account.id, details: `${active ? 'تفعيل' : 'تعطيل'} الحساب ${account.code}` });
    res.json(updated);
  } catch (error) {
    console.error('Failed to update account:', error);
    res.status(500).json({ error: 'تعذر تحديث الحساب' });
  }
});

router.get('/journals', async (_req, res) => {
  try {
    res.json(await prisma.accountingJournal.findMany({ where: { active: true }, orderBy: { code: 'asc' } }));
  } catch (error) {
    console.error('Failed to load accounting journals:', error);
    res.status(500).json({ error: 'تعذر تحميل دفاتر اليومية' });
  }
});

router.get('/entries', async (req, res) => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to, true);
    if (from === null || to === null) return res.status(400).json({ error: 'نطاق التاريخ غير صالح' });
    const take = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const entries = await prisma.journalEntry.findMany({
      where: {
        status: 'POSTED',
        ...(req.query.journalId ? { journalId: String(req.query.journalId) } : {}),
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(req.query.accountId ? { lines: { some: { accountId: String(req.query.accountId) } } } : {}),
      },
      include: { journal: true, lines: { include: { account: true } } },
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      take,
    });
    res.json(entries);
  } catch (error) {
    console.error('Failed to load journal entries:', error);
    res.status(500).json({ error: 'تعذر تحميل القيود اليومية' });
  }
});

router.get('/ledger/:accountId', async (req, res) => {
  try {
    const account = await prisma.account.findUnique({ where: { id: req.params.accountId } });
    if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });
    const lines = await prisma.journalEntryLine.findMany({
      where: { accountId: account.id, entry: { status: 'POSTED' } },
      include: { entry: { include: { journal: true } } },
      orderBy: [{ entry: { date: 'asc' } }, { createdAt: 'asc' }],
      take: 1000,
    });
    let balance = 0;
    const ledger = lines.map((line) => {
      balance += line.debit - line.credit;
      return { ...line, balance: Math.round(balance * 100) / 100 };
    });
    res.json({ account, lines: ledger });
  } catch (error) {
    console.error('Failed to load account ledger:', error);
    res.status(500).json({ error: 'تعذر تحميل كشف الحساب' });
  }
});

router.get('/trial-balance', async (req, res) => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to, true);
    if (from === null || to === null) return res.status(400).json({ error: 'نطاق التاريخ غير صالح' });

    const accounts = await prisma.account.findMany({ orderBy: { code: 'asc' } });
    const lines = await prisma.journalEntryLine.findMany({
      where: {
        entry: {
          status: 'POSTED',
          ...(to ? { date: { lte: to } } : {}),
        },
      },
      select: { accountId: true, debit: true, credit: true, entry: { select: { date: true } } },
    });
    const balances = new Map<string, { opening: number; debit: number; credit: number }>();
    for (const line of lines) {
      const balance = balances.get(line.accountId) || { opening: 0, debit: 0, credit: 0 };
      const isOpening = from ? line.entry.date < from : false;
      if (isOpening) {
        balance.opening += line.debit - line.credit;
      } else {
        balance.debit += line.debit;
        balance.credit += line.credit;
      }
      balances.set(line.accountId, balance);
    }

    const rows = accounts.map((account) => {
      const balance = balances.get(account.id) || { opening: 0, debit: 0, credit: 0 };
      const closing = balance.opening + balance.debit - balance.credit;
      return {
        account,
        openingDebit: Math.max(balance.opening, 0),
        openingCredit: Math.max(-balance.opening, 0),
        debit: balance.debit,
        credit: balance.credit,
        closingDebit: Math.max(closing, 0),
        closingCredit: Math.max(-closing, 0),
      };
    });
    res.json({
      rows,
      totals: rows.reduce((totals, row) => ({
        debit: totals.debit + row.debit,
        credit: totals.credit + row.credit,
        closingDebit: totals.closingDebit + row.closingDebit,
        closingCredit: totals.closingCredit + row.closingCredit,
      }), { debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 }),
    });
  } catch (error) {
    console.error('Failed to calculate trial balance:', error);
    res.status(500).json({ error: 'تعذر إعداد ميزان المراجعة' });
  }
});

router.post('/entries', async (req: AuthenticatedRequest, res) => {
  try {
    const { journalCode, memo, date, branchId, lines } = req.body || {};
    if (
      typeof journalCode !== 'string' || typeof memo !== 'string'
      || !Array.isArray(lines) || lines.some((line) => !line || typeof line.accountCode !== 'string')
      || (branchId !== undefined && branchId !== null && typeof branchId !== 'string')
    ) {
      return res.status(400).json({ error: 'بيانات القيد غير مكتملة أو غير صالحة' });
    }
    const entryDate = date === undefined ? new Date() : new Date(date);
    if (!Number.isFinite(entryDate.getTime())) return res.status(400).json({ error: 'تاريخ القيد غير صالح' });
    const entry = await prisma.$transaction((tx) => postJournalEntry(tx, {
      journalCode,
      memo,
      date: entryDate,
      branchId: branchId || null,
      createdById: req.user?.id || null,
      lines,
    }));
    await logAudit({ action: 'POST', entity: 'JournalEntry', entityId: entry.id, details: `ترحيل القيد ${entry.number}` });
    res.status(201).json(entry);
  } catch (error: any) {
    console.error('Failed to post manual journal entry:', error);
    res.status(400).json({ error: error.message || 'تعذر ترحيل القيد' });
  }
});

router.post('/entries/:id/reverse', async (req: AuthenticatedRequest, res) => {
  try {
    const original = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: { journal: true, lines: { include: { account: true } } },
    });
    if (!original || original.status !== 'POSTED') return res.status(404).json({ error: 'القيد المرحل غير موجود' });

    const reversal = await prisma.$transaction((tx) => postJournalEntry(tx, {
      journalCode: original.journal.code,
      memo: `عكس القيد ${original.number}`,
      referenceType: 'REVERSAL',
      referenceId: original.id,
      branchId: original.branchId,
      createdById: req.user?.id || null,
      lines: original.lines.map((line) => ({
        accountCode: line.account.code,
        debit: line.credit,
        credit: line.debit,
        label: `عكس: ${line.label || original.memo}`,
        partnerType: line.partnerType || undefined,
        partnerId: line.partnerId || undefined,
      })),
    }));
    await logAudit({ action: 'REVERSE', entity: 'JournalEntry', entityId: original.id, details: `إنشاء قيد عكسي ${reversal.number} للقيد ${original.number}` });
    res.status(201).json(reversal);
  } catch (error: any) {
    console.error('Failed to reverse journal entry:', error);
    res.status(400).json({ error: error.message || 'تعذر إنشاء القيد العكسي' });
  }
});

export default router;
