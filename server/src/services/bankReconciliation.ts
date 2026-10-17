import { parse } from 'csv-parse/sync';

export type StatementDirection = 'CREDIT' | 'DEBIT';
export const isStatementDirection = (direction: string): direction is StatementDirection =>
  direction === 'CREDIT' || direction === 'DEBIT';

export type ParsedStatementLine = {
  transactionDate: Date;
  amount: number;
  direction: StatementDirection;
  referenceNumber: string | null;
  description: string | null;
};

const headerAliases = {
  date: ['date', 'transactiondate', 'postingdate', 'valuedate', 'التاريخ', 'تاريخالعملية', 'تاريخالقيد', 'تاريخالترحيل'],
  description: ['description', 'details', 'memo', 'narrative', 'البيان', 'الوصف', 'التفاصيل', 'تفاصيلالعملية'],
  reference: ['reference', 'referencenumber', 'ref', 'refno', 'transactionid', 'رقمالمرجع', 'مرجع', 'رقمالعملية'],
  amount: ['amount', 'transactionamount', 'المبلغ', 'قيمةالعملية'],
  debit: ['debit', 'withdrawal', 'outflow', 'مدين', 'خصم', 'مسحوب'],
  credit: ['credit', 'deposit', 'inflow', 'دائن', 'إيداع', 'ايداع', 'إضافة'],
} as const;

const normalizeHeader = (value: string) =>
  value.toLocaleLowerCase().replace(/[\s_\-().:/\\]+/g, '').replace(/[\u200e\u200f]/g, '');

const findColumn = (headers: string[], aliases: readonly string[]) =>
  headers.findIndex((header) => aliases.includes(normalizeHeader(header)));

const normalizeDigits = (value: string) => value
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
  .replace(/٫/g, '.')
  .replace(/[٬,\s]/g, '');

const parseAmount = (value: string, rowNumber: number) => {
  const normalized = normalizeDigits(value.trim());
  if (!normalized) return 0;
  const parenthesized = /^\(.*\)$/.test(normalized);
  const numeric = Number(normalized.replace(/[()]/g, '').replace(/[^\d.+-]/g, ''));
  if (!Number.isFinite(numeric)) throw new Error(`قيمة مبلغ غير صالحة في السطر ${rowNumber}`);
  return parenthesized ? -Math.abs(numeric) : numeric;
};

const parseTransactionDate = (value: string, rowNumber: number) => {
  const text = value.trim();
  let year: number;
  let month: number;
  let day: number;
  const localDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (localDate) {
    day = Number(localDate[1]);
    month = Number(localDate[2]);
    year = Number(localDate[3]);
  } else if (isoDate) {
    year = Number(isoDate[1]);
    month = Number(isoDate[2]);
    day = Number(isoDate[3]);
  } else {
    throw new Error(`تاريخ غير صالح في السطر ${rowNumber}؛ استخدم YYYY-MM-DD أو DD/MM/YYYY`);
  }
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`تاريخ غير صالح في السطر ${rowNumber}`);
  }
  return date;
};

export const parseBankStatementCsv = (csv: string): ParsedStatementLine[] => {
  if (typeof csv !== 'string' || !csv.trim()) throw new Error('ملف كشف الحساب فارغ');
  if (Buffer.byteLength(csv, 'utf8') > 5 * 1024 * 1024) throw new Error('حجم كشف الحساب يتجاوز الحد المسموح (5 ميجابايت)');

  let rows: string[][];
  try {
    rows = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
    }) as string[][];
  } catch (error) {
    throw new Error(`تعذر قراءة ملف CSV: ${error instanceof Error ? error.message : 'تنسيق الملف غير صالح'}`);
  }
  if (rows.length < 2) throw new Error('يجب أن يحتوي كشف الحساب على عنوان أعمدة وصف معاملة واحد على الأقل');

  const headers = rows[0];
  const dateColumn = findColumn(headers, headerAliases.date);
  const descriptionColumn = findColumn(headers, headerAliases.description);
  const referenceColumn = findColumn(headers, headerAliases.reference);
  const amountColumn = findColumn(headers, headerAliases.amount);
  const debitColumn = findColumn(headers, headerAliases.debit);
  const creditColumn = findColumn(headers, headerAliases.credit);
  if (dateColumn < 0 || (amountColumn < 0 && debitColumn < 0 && creditColumn < 0)) {
    throw new Error('لم يتم العثور على أعمدة التاريخ والمبلغ؛ استخدم Date وAmount أو Date وDebit وCredit');
  }

  const lines = rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    const transactionDate = parseTransactionDate(row[dateColumn] || '', rowNumber);
    let signedAmount: number;
    if (debitColumn >= 0 || creditColumn >= 0) {
      const debit = debitColumn >= 0 ? Math.abs(parseAmount(row[debitColumn] || '', rowNumber)) : 0;
      const credit = creditColumn >= 0 ? Math.abs(parseAmount(row[creditColumn] || '', rowNumber)) : 0;
      if (debit > 0 && credit > 0) throw new Error(`لا يمكن أن يحتوي السطر ${rowNumber} على مدين ودائن معًا`);
      signedAmount = credit - debit;
    } else {
      signedAmount = parseAmount(row[amountColumn] || '', rowNumber);
    }
    if (signedAmount === 0) throw new Error(`مبلغ المعاملة في السطر ${rowNumber} يجب أن يكون أكبر من صفر`);
    return {
      transactionDate,
      amount: Math.round((Math.abs(signedAmount) + Number.EPSILON) * 100) / 100,
      direction: signedAmount > 0 ? 'CREDIT' as const : 'DEBIT' as const,
      referenceNumber: referenceColumn >= 0 ? row[referenceColumn]?.trim() || null : null,
      description: descriptionColumn >= 0 ? row[descriptionColumn]?.trim() || null : null,
    };
  });
  if (lines.length > 10000) throw new Error('كشف الحساب يتجاوز الحد المسموح (10000 معاملة)');
  return lines;
};

export const findUniqueBankTransactionMatch = <
  T extends { id: string; type: string; amount: number; date: Date | string; referenceNumber?: string | null },
>(
  statementLine: ParsedStatementLine,
  transactions: T[],
) => {
  const expectedTypes = statementLine.direction === 'CREDIT'
    ? new Set(['DEPOSIT', 'CARD_SETTLEMENT'])
    : new Set(['WITHDRAWAL']);
  const statementReference = statementLine.referenceNumber?.trim().toLocaleLowerCase();
  const matching = transactions.filter((transaction) => {
    if (!expectedTypes.has(transaction.type) || Math.abs(transaction.amount - statementLine.amount) > 0.01) return false;
    const transactionDate = new Date(transaction.date);
    const daysApart = Math.abs(Date.UTC(
      transactionDate.getUTCFullYear(), transactionDate.getUTCMonth(), transactionDate.getUTCDate(),
    ) - Date.UTC(
      statementLine.transactionDate.getUTCFullYear(),
      statementLine.transactionDate.getUTCMonth(),
      statementLine.transactionDate.getUTCDate(),
    )) / 86400000;
    if (daysApart > 3) return false;
    const transactionReference = transaction.referenceNumber?.trim().toLocaleLowerCase();
    return !statementReference || !transactionReference || statementReference === transactionReference;
  });
  if (matching.length !== 1) return null;
  return matching[0];
};
