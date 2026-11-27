import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidPosLine, isValidPosLines } from './posLineValidation';

test('accepts a stock item line with a positive integer quantity and non-negative price', () => {
  assert.equal(isValidPosLine({ itemId: 'item-1', quantity: 2, unitPrice: 12.5 }), true);
});

test('accepts a described non-stock free line', () => {
  assert.equal(isValidPosLine({
    itemId: null,
    itemType: 'LABOR',
    description: 'خدمة تركيب',
    quantity: 1,
    unitPrice: 50,
  }), true);
});

test('rejects malformed free lines and accepts harmless extra metadata', () => {
  assert.equal(isValidPosLine({ itemId: null, itemType: 'PART', description: 'صنف', quantity: 1, unitPrice: 10 }), false);
  assert.equal(isValidPosLine({ itemId: null, itemType: 'LABOR', description: '  ', quantity: 1, unitPrice: 10 }), false);
  assert.equal(isValidPosLine({ itemId: null, itemType: 'LABOR', description: 'خدمة', quantity: 1, unitPrice: 10, extra: true }), true);
});

test('rejects invalid quantities, prices, missing inventory ids, and oversized carts', () => {
  assert.equal(isValidPosLine({ itemId: 'item-1', quantity: 0, unitPrice: 10 }), false);
  assert.equal(isValidPosLine({ itemId: 'item-1', quantity: 1.5, unitPrice: 10 }), false);
  assert.equal(isValidPosLine({ itemId: 'item-1', quantity: 1, unitPrice: -1 }), false);
  assert.equal(isValidPosLine({ itemId: '', quantity: 1, unitPrice: 10 }), false);
  assert.equal(isValidPosLines([]), false);
  assert.equal(isValidPosLines(Array.from({ length: 501 }, () => ({ itemId: 'item', quantity: 1, unitPrice: 1 }))), false);
});
