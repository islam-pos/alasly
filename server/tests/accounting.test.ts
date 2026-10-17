import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateJournalLines } from '../src/services/accounting';

test('accepts balanced journal lines after rounding to Egyptian piastres', () => {
  assert.deepEqual(validateJournalLines([
    { accountCode: '1000', debit: 10.005 },
    { accountCode: '4000', credit: 10.006 },
  ]), { debitTotal: 1001, creditTotal: 1001 });
});

test('rejects unbalanced, negative, non-finite, and ambiguous journal lines', () => {
  assert.throws(() => validateJournalLines([
    { accountCode: '1000', debit: 10 },
    { accountCode: '4000', credit: 9 },
  ]), /غير متوازن/);
  assert.throws(() => validateJournalLines([
    { accountCode: '1000', debit: -1 },
    { accountCode: '4000', credit: 1 },
  ]), /أرقاماً موجبة/);
  assert.throws(() => validateJournalLines([
    { accountCode: '1000', debit: Number.NaN },
    { accountCode: '4000', credit: 0 },
  ]), /أرقاماً موجبة/);
  assert.throws(() => validateJournalLines([
    { accountCode: '1000', debit: 1, credit: 1 },
    { accountCode: '4000', credit: 2 },
  ]), /مدين أو دائن فقط/);
  assert.throws(() => validateJournalLines([
    { accountCode: '1000' },
    { accountCode: '4000', credit: 1 },
  ]), /مدين أو دائن فقط/);
});

test('requires at least two lines in a posted journal', () => {
  assert.throws(() => validateJournalLines([{ accountCode: '1000', debit: 1 }]), /سطرين/);
});
