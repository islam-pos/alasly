import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSalesReturnSnapshot } from '../src/services/salesReturns';

test('uses original invoice price, tax, discount, and cost for returned quantities', () => {
  const snapshot = buildSalesReturnSnapshot({
    subtotal: 100,
    discount: 10,
    taxAmount: 14,
    items: [
      { itemId: 'part-a', itemType: 'PART', quantity: 2, unitPrice: 40, total: 80, costPrice: 20 },
      { itemId: 'labor', itemType: 'LABOR', quantity: 1, unitPrice: 20, total: 20, costPrice: 0 },
    ],
    existingReturns: [],
    requestedItems: [{ itemId: 'part-a', quantity: 1 }],
  });

  assert.deepEqual(snapshot, {
    items: [{ itemId: 'part-a', quantity: 1, unitPrice: 40, total: 40, costPrice: 20 }],
    subtotal: 40,
    discount: 4,
    taxAmount: 5.6,
    totalAmount: 41.6,
  });
});

test('rejects returns that exceed unreturned original invoice quantities', () => {
  assert.throws(() => buildSalesReturnSnapshot({
    subtotal: 40,
    discount: 0,
    taxAmount: 0,
    items: [{ itemId: 'part-a', itemType: 'PART', quantity: 2, unitPrice: 20, total: 40, costPrice: 10 }],
    existingReturns: [{ itemId: 'part-a', quantity: 1 }],
    requestedItems: [{ itemId: 'part-a', quantity: 2 }],
  }), /تتجاوز الكمية المتبقية/);
});

test('rejects non-positive and non-integer return quantities', () => {
  for (const quantity of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => buildSalesReturnSnapshot({
      subtotal: 20,
      discount: 0,
      taxAmount: 0,
      items: [{ itemId: 'part-a', itemType: 'PART', quantity: 1, unitPrice: 20, total: 20, costPrice: 10 }],
      existingReturns: [],
      requestedItems: [{ itemId: 'part-a', quantity }],
    }), /كمية المرتجع غير صالحة/);
  }
});
