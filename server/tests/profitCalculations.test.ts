import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateProfitTotals } from '../src/services/profitCalculations';

test('calculates net sales, return cost restoration, commissions, and expenses to piastres', () => {
  const totals = calculateProfitTotals({
    invoices: [{
      subtotal: 100,
      discount: 10,
      taxAmount: 14,
      items: [
        { itemType: 'PART', quantity: 1, total: 80, costPrice: 50 },
        { itemType: 'LABOR', quantity: 1, total: 20, costPrice: 0 },
      ],
    }],
    returns: [{
      subtotal: 20,
      discount: 2,
      taxAmount: 2.8,
      profitBasis: 'ORIGINAL_INVOICE',
      items: [{ quantity: 1, costPrice: 10, costPriceIsEstimated: false }],
    }],
    commissions: [{ amount: 3 }],
    expenses: [{ amount: 7 }],
    revenues: [{ amount: 5 }],
  });

  assert.deepEqual(totals, {
    totalIncome: 65.8,
    parts: { sales: 45.6, cost: 40, profit: 5.6, margin: 12.3 },
    workshop: { laborSales: 15.2, technicianCost: 3, profit: 12.2 },
    expenses: 7,
    revenues: 5,
    returnedSales: 15.2,
    returnedPartsCost: 10,
    grossProfit: 22.8,
    netProfit: 15.8,
    profitMargin: 24,
    historicalReturnEstimate: false,
  });
});

test('flags returns without original invoice pricing and cost snapshots as estimates', () => {
  const totals = calculateProfitTotals({
    invoices: [],
    returns: [{
      subtotal: 10,
      discount: 0,
      taxAmount: 0,
      profitBasis: 'LEGACY_ESTIMATE',
      items: [{ quantity: 1, costPrice: 0, costPriceIsEstimated: true }],
    }],
    commissions: [],
    expenses: [],
    revenues: [],
  });
  assert.equal(totals.historicalReturnEstimate, true);
});
