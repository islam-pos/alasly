import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findUniqueBankTransactionMatch,
  parseBankStatementCsv,
} from '../src/services/bankReconciliation';

test('parses English and Arabic debit/credit CSV headers and Arabic numerals', () => {
  const lines = parseBankStatementCsv([
    'Date,Description,Reference,Debit,Credit',
    '2026-10-15,POS settlement,REF-1,,١٬٢٣٤٫٥٠',
    '16/10/2026,Bank fee,REF-2,15.25,',
  ].join('\n'));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].amount, 1234.5);
  assert.equal(lines[0].direction, 'CREDIT');
  assert.equal(lines[0].referenceNumber, 'REF-1');
  assert.equal(lines[1].amount, 15.25);
  assert.equal(lines[1].direction, 'DEBIT');
});

test('rejects malformed dates, zero transactions, and ambiguous debit/credit rows', () => {
  assert.throws(() => parseBankStatementCsv('Date,Amount\n2026-02-30,4'), /تاريخ غير صالح/);
  assert.throws(() => parseBankStatementCsv('Date,Amount\n2026-10-15,0'), /أكبر من صفر/);
  assert.throws(() => parseBankStatementCsv('Date,Debit,Credit\n2026-10-15,3,4'), /مدين ودائن/);
  assert.throws(() => parseBankStatementCsv('Description,Amount\nfee,3'), /التاريخ والمبلغ/);
});

test('auto-matches only one exact amount, direction, date, and compatible reference candidate', () => {
  const statementLine = {
    transactionDate: new Date('2026-10-15T12:00:00.000Z'),
    amount: 250,
    direction: 'CREDIT' as const,
    referenceNumber: 'POS-12',
    description: 'POS settlement',
  };
  const transactions = [{
    id: 'bank-tx-1',
    type: 'CARD_SETTLEMENT',
    amount: 250,
    date: new Date('2026-10-16T12:00:00.000Z'),
    referenceNumber: 'POS-12',
  }];
  assert.equal(findUniqueBankTransactionMatch(statementLine, transactions)?.id, 'bank-tx-1');
  assert.equal(findUniqueBankTransactionMatch(statementLine, [...transactions, { ...transactions[0], id: 'bank-tx-2' }]), null);
  assert.equal(findUniqueBankTransactionMatch(statementLine, [{ ...transactions[0], referenceNumber: 'OTHER' }]), null);
  assert.equal(findUniqueBankTransactionMatch(statementLine, [{ ...transactions[0], type: 'WITHDRAWAL' }]), null);
});
