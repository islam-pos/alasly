import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/summary', async (req, res) => {
  try {
    const { period = 'month', branchId } = req.query;
    const now = new Date();
    let startDate: Date;

    if (period === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else {
      // Month default
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    let invoiceWhere: any = {
      date: { gte: startDate },
      status: { not: 'CANCELLED' },
    };
    if (branchId) invoiceWhere.branchId = String(branchId);

    // 1. Sales Invoices
    const salesInvoices = await prisma.salesInvoice.findMany({
      where: invoiceWhere,
      include: {
        items: { include: { item: true } },
      },
    });

    let totalPartsSales = 0;
    let totalPartsCost = 0;
    let totalLaborSales = 0;
    let totalDiscounts = 0;

    for (const inv of salesInvoices) {
      totalDiscounts += inv.discount;
      for (const it of inv.items) {
        if (it.itemType === 'PART') {
          totalPartsSales += it.unitPrice * it.quantity;
          totalPartsCost += it.costPrice * it.quantity;
        } else {
          totalLaborSales += it.unitPrice * it.quantity;
        }
      }
    }

    const grossPartsProfit = totalPartsSales - totalPartsCost;

    // 2. Technician Commissions in period
    const commissions = await prisma.commission.findMany({
      where: { createdAt: { gte: startDate } },
    });
    const totalCommissions = commissions.reduce((sum, c) => sum + c.amount, 0);

    const netLaborProfit = totalLaborSales - totalCommissions;

    // 3. Additional Revenues
    const revenues = await prisma.revenue.findMany({
      where: { date: { gte: startDate } },
    });
    const totalRevenues = revenues.reduce((sum, r) => sum + r.amount, 0);

    // 4. Operating Expenses
    const expenses = await prisma.expense.findMany({
      where: { date: { gte: startDate } },
      include: { category: true },
    });
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Group expenses by category
    const expensesByCategory: Record<string, number> = {};
    for (const exp of expenses) {
      const catName = exp.category?.name || 'مصروفات عامة';
      expensesByCategory[catName] = (expensesByCategory[catName] || 0) + exp.amount;
    }

    // Grand calculations
    const totalIncome = totalPartsSales + totalLaborSales + totalRevenues - totalDiscounts;
    const totalDirectCosts = totalPartsCost + totalCommissions;
    const grossProfit = totalIncome - totalDirectCosts;
    const netProfit = grossProfit - totalExpenses;
    const profitMargin = totalIncome > 0 ? Math.round((netProfit / totalIncome) * 1000) / 10 : 0;

    res.json({
      period,
      startDate,
      endDate: now,
      totalIncome: Math.round(totalIncome),
      parts: {
        sales: Math.round(totalPartsSales),
        cost: Math.round(totalPartsCost),
        profit: Math.round(grossPartsProfit),
        margin: totalPartsSales > 0 ? Math.round((grossPartsProfit / totalPartsSales) * 100) : 0,
      },
      workshop: {
        laborSales: Math.round(totalLaborSales),
        technicianCost: Math.round(totalCommissions),
        profit: Math.round(netLaborProfit),
      },
      expenses: {
        total: Math.round(totalExpenses),
        byCategory: Object.entries(expensesByCategory).map(([name, amount]) => ({ name, amount })),
      },
      revenues: {
        total: Math.round(totalRevenues),
      },
      grossProfit: Math.round(grossProfit),
      netProfit: Math.round(netProfit),
      profitMargin,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
