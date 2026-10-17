import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { calculateProfitTotals } from '../services/profitCalculations';

const router = Router();

router.get('/summary', async (req, res) => {
  try {
    const requestedPeriod = typeof req.query.period === 'string' ? req.query.period : 'month';
    const period = ['day', 'week', 'month', 'year'].includes(requestedPeriod) ? requestedPeriod : 'month';
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const endDate = new Date();
    let startDate: Date;

    if (period === 'day') {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    } else if (period === 'week') {
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 7);
    } else if (period === 'year') {
      startDate = new Date(endDate.getFullYear(), 0, 1);
    } else {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    }

    const dateRange = { gte: startDate, lte: endDate };
    const salesInvoices = await prisma.salesInvoice.findMany({
      where: {
        date: dateRange,
        status: { in: ['PAID', 'PARTIALLY_PAID', 'POSTED', 'RETURNED'] },
        invoiceType: { not: 'QUOTATION' },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        items: {
          select: { itemType: true, quantity: true, total: true, costPrice: true },
        },
      },
    });
    const [salesReturns, commissions, revenues, expenses] = await Promise.all([
      prisma.salesReturn.findMany({
        where: {
          date: dateRange,
          status: 'POSTED',
          ...(branchId ? { salesInvoice: { branchId } } : {}),
        },
        include: {
          items: { select: { quantity: true, costPrice: true, costPriceIsEstimated: true } },
        },
      }),
      prisma.commission.findMany({
        where: {
          createdAt: dateRange,
          ...(branchId ? { repairOrder: { branchId } } : {}),
        },
        select: { amount: true },
      }),
      prisma.revenue.findMany({ where: { date: dateRange }, select: { amount: true } }),
      prisma.expense.findMany({
        where: { date: dateRange },
        include: { category: true },
      }),
    ]);

    const totals = calculateProfitTotals({ invoices: salesInvoices, returns: salesReturns, commissions, expenses, revenues });
    const expensesByCategory: Record<string, number> = {};
    for (const expense of expenses) {
      const category = expense.category?.name || 'مصروفات عامة';
      expensesByCategory[category] = (expensesByCategory[category] || 0) + expense.amount;
    }
    const warnings: string[] = [];
    if (totals.historicalReturnEstimate) {
      warnings.push('تتضمن الفترة مرتجعات قديمة لا تحفظ تكلفة البيع أو الخصم والضريبة الأصلية؛ عولجت كتقديرات.');
    }
    if (branchId) {
      warnings.push('المصروفات والإيرادات الإضافية غير موزعة حسب الفرع في البيانات الحالية، لذلك تشمل إجمالي الفروع.');
    }

    res.json({
      period,
      startDate,
      endDate,
      totalIncome: totals.totalIncome,
      parts: totals.parts,
      workshop: totals.workshop,
      expenses: {
        total: totals.expenses,
        byCategory: Object.entries(expensesByCategory).map(([name, amount]) => ({ name, amount })),
      },
      revenues: { total: totals.revenues },
      salesReturns: {
        salesDeducted: totals.returnedSales,
        costRestored: totals.returnedPartsCost,
      },
      grossProfit: totals.grossProfit,
      netProfit: totals.netProfit,
      profitMargin: totals.profitMargin,
      warnings,
    });
  } catch (error) {
    console.error('Failed to calculate profit and loss summary:', error);
    res.status(500).json({ error: 'تعذر حساب تقرير الأرباح والخسائر' });
  }
});

export default router;
