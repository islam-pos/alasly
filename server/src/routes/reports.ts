import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { branchWhere } from '../services/branchScope';

const router = Router();

// --- Sales Reports ---
router.get('/sales', async (req: AuthenticatedRequest, res) => {
  try {
    const { fromDate, toDate, customerId, paymentMethod, type } = req.query;
    let whereClause: any = {
      ...branchWhere(req),
      status: { not: 'CANCELLED' },
      invoiceType: { not: 'QUOTATION' },
    };

    if (fromDate || toDate) {
      whereClause.date = {};
      if (fromDate) whereClause.date.gte = new Date(`${String(fromDate)}T00:00:00.000Z`);
      if (toDate) {
        const endExclusive = new Date(`${String(toDate)}T00:00:00.000Z`);
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
        whereClause.date.lt = endExclusive;
      }
    }
    if (customerId) whereClause.customerId = String(customerId);
    if (paymentMethod) whereClause.paymentMethod = String(paymentMethod);
    if (type) whereClause.invoiceType = String(type);

    const invoices = await prisma.salesInvoice.findMany({
      where: whereClause,
      include: {
        customer: true,
        vehicle: true,
        items: { include: { item: true } },
      },
      orderBy: { date: 'desc' },
    });

    const totalSales = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
    const totalDiscount = invoices.reduce((sum, inv) => sum + inv.discount, 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    const totalRemaining = invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0);

    res.json({
      invoices,
      summary: {
        count: invoices.length,
        totalSales,
        totalDiscount,
        totalPaid,
        totalRemaining,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Inventory Reports ---
router.get('/inventory', async (req: AuthenticatedRequest, res) => {
  try {
    const { warehouseId } = req.query;

    const items = await prisma.item.findMany({
      where: { active: true },
      include: {
        category: true,
        unit: true,
        stockBalances: {
          include: { warehouse: true },
          where: {
            ...(warehouseId ? { warehouseId: String(warehouseId) } : {}),
            ...(req.authenticatedRole === 'admin' ? {} : { warehouse: branchWhere(req) }),
          },
        },
      },
      orderBy: { nameAr: 'asc' },
    });

    let totalItemsCount = items.length;
    let totalStockQty = 0;
    let totalValuationCost = 0;
    let totalValuationSell = 0;
    let lowStockCount = 0;

    const itemsList = items.map((it) => {
      const qty = it.stockBalances.reduce((sum, b) => sum + b.quantity, 0);
      totalStockQty += qty;
      const costVal = qty * it.avgCost;
      const sellVal = qty * it.sellPrice;
      totalValuationCost += costVal;
      totalValuationSell += sellVal;
      const isLow = qty <= it.minStock;
      if (isLow) lowStockCount += 1;

      return {
        id: it.id,
        sku: it.sku,
        barcode: it.barcode,
        name: it.nameAr,
        category: it.category.name,
        unit: it.unit.name,
        quantity: qty,
        minStock: it.minStock,
        avgCost: it.avgCost,
        sellPrice: it.sellPrice,
        costValue: costVal,
        sellValue: sellVal,
        isLow,
      };
    });

    res.json({
      items: itemsList,
      summary: {
        totalItemsCount,
        totalStockQty,
        totalValuationCost: Math.round(totalValuationCost),
        totalValuationSell: Math.round(totalValuationSell),
        expectedProfit: Math.round(totalValuationSell - totalValuationCost),
        lowStockCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Workshop Reports ---
router.get('/workshop', async (req: AuthenticatedRequest, res) => {
  try {
    const { fromDate, toDate } = req.query;
    let whereClause: any = branchWhere(req);
    if (fromDate || toDate) {
      whereClause.createdAt = {};
      if (fromDate) whereClause.createdAt.gte = new Date(String(fromDate));
      if (toDate) whereClause.createdAt.lte = new Date(String(toDate));
    }

    const jobCards = await prisma.repairOrder.findMany({
      where: whereClause,
      include: {
        customer: true,
        vehicle: true,
        technician: true,
        serviceAdvisor: true,
        labors: true,
        parts: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalOrders = jobCards.length;
    const closedOrders = jobCards.filter((j) => j.status === 'CLOSED').length;
    const inProgressOrders = jobCards.filter((j) => j.status === 'IN_PROGRESS').length;
    const pendingApprovalOrders = jobCards.filter((j) => j.status === 'PENDING_APPROVAL').length;
    const totalRevenue = jobCards.reduce((sum, j) => sum + j.grandTotal, 0);
    const totalLaborRevenue = jobCards.reduce((sum, j) => sum + j.totalLabor, 0);
    const totalPartsRevenue = jobCards.reduce((sum, j) => sum + j.totalParts, 0);
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    res.json({
      jobCards,
      summary: {
        totalOrders,
        closedOrders,
        inProgressOrders,
        pendingApprovalOrders,
        totalRevenue,
        totalLaborRevenue,
        totalPartsRevenue,
        avgOrderValue,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
