import type { Prisma, PrismaClient } from '@prisma/client';

export type AccountingTransaction = Prisma.TransactionClient | PrismaClient;

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  label?: string;
  partnerType?: string;
  partnerId?: string;
}

interface PostJournalEntryInput {
  journalCode: string;
  memo: string;
  date?: Date;
  referenceType?: string;
  referenceId?: string;
  branchId?: string | null;
  createdById?: string | null;
  lines: JournalLineInput[];
}

const roundToPiastres = (amount: number) => Math.round((amount + Number.EPSILON) * 100);

export const validateJournalLines = (lines: JournalLineInput[]) => {
  if (lines.length < 2) throw new Error('يجب أن يحتوي القيد على سطرين محاسبيين على الأقل');

  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;
    if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0) {
      throw new Error('قيم المدين والدائن يجب أن تكون أرقاماً موجبة أو صفراً');
    }
    if ((debit > 0) === (credit > 0)) {
      throw new Error('كل سطر يجب أن يحتوي على مدين أو دائن فقط');
    }
    debitTotal += roundToPiastres(debit);
    creditTotal += roundToPiastres(credit);
  }
  if (debitTotal !== creditTotal) {
    throw new Error('القيد غير متوازن: إجمالي المدين يجب أن يساوي إجمالي الدائن');
  }
  return { debitTotal, creditTotal };
};

const nextEntryNumber = async (
  tx: AccountingTransaction,
  journalCode: string,
  year: number,
) => {
  const key = `JE-${journalCode}-${year}`;
  const prefix = `${journalCode}-${year}-`;
  const suffixStart = prefix.length + 1;
  await tx.$executeRaw`
    INSERT INTO "NumberSequence" ("key", "lastValue")
    VALUES (
      ${key},
      COALESCE((
        SELECT MAX(CAST(substr("number", ${suffixStart}) AS INTEGER))
        FROM "JournalEntry"
        WHERE "number" LIKE ${`${prefix}%`}
      ), 0) + 1
    )
    ON CONFLICT("key") DO UPDATE SET "lastValue" = "NumberSequence"."lastValue" + 1
  `;
  const sequence = await tx.numberSequence.findUniqueOrThrow({ where: { key } });
  return `${prefix}${String(sequence.lastValue).padStart(5, '0')}`;
};

export const postJournalEntry = async (
  tx: AccountingTransaction,
  input: PostJournalEntryInput,
) => {
  if (!input.memo.trim()) throw new Error('وصف القيد مطلوب');
  if ((input.referenceType && !input.referenceId) || (!input.referenceType && input.referenceId)) {
    throw new Error('نوع ورقم مرجع القيد يجب إدخالهما معاً');
  }

  if (input.referenceType && input.referenceId) {
    const existing = await tx.journalEntry.findFirst({
      where: { referenceType: input.referenceType, referenceId: input.referenceId },
      include: { lines: { include: { account: true } }, journal: true },
    });
    if (existing) return existing;
  }

  validateJournalLines(input.lines);

  const journal = await tx.accountingJournal.findUnique({ where: { code: input.journalCode } });
  if (!journal || !journal.active) throw new Error(`دفتر اليومية ${input.journalCode} غير موجود أو غير نشط`);

  const accounts = new Map(
    (await tx.account.findMany({
      where: { code: { in: [...new Set(input.lines.map((line) => line.accountCode))] }, active: true },
    })).map((account) => [account.code, account]),
  );
  if (accounts.size !== new Set(input.lines.map((line) => line.accountCode)).size) {
    throw new Error('أحد الحسابات المستخدمة في القيد غير موجود أو غير نشط');
  }

  const date = input.date ?? new Date();
  if (!Number.isFinite(date.getTime())) throw new Error('تاريخ القيد غير صالح');
  const number = await nextEntryNumber(tx, journal.code, date.getFullYear());

  return tx.journalEntry.create({
    data: {
      number,
      journalId: journal.id,
      date,
      memo: input.memo.trim(),
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      branchId: input.branchId ?? null,
      createdById: input.createdById ?? null,
      status: 'POSTED',
      lines: {
        create: input.lines.map((line) => ({
          accountId: accounts.get(line.accountCode)!.id,
          label: line.label ?? null,
          debit: line.debit ?? 0,
          credit: line.credit ?? 0,
          partnerType: line.partnerType ?? null,
          partnerId: line.partnerId ?? null,
        })),
      },
    },
    include: { lines: { include: { account: true } }, journal: true },
  });
};
