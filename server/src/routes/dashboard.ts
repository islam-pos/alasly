import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Sales today
    const salesToday = await prisma.salesInvoice.aggregate({
      _sum: { grandTotal: true },
      _count: { id: true },
      where: {
        date: { gte: startOfToday },
        status: { not: 'CANCELLED' },
        invoiceType: { not: 'QUOTATION' },
      },
    });

    // 2. Sales month
    const salesMonth = await prisma.salesInvoice.aggregate({
      _sum: { grandTotal: true },
      where: {
        date: { gte: startOfMonth },
        status: { not: 'CANCELLED' },
        invoiceType: { not: 'QUOTATION' },
      },
    });

    // 3. Maintenance revenue (month)
    const maintenanceRev = await prisma.salesInvoice.aggregate({
      _sum: { grandTotal: true },
      where: {
        date: { gte: startOfMonth },
        invoiceType: 'MAINTENANCE',
        status: { not: 'CANCELLED' },
      },
    });

    // 4. Expenses month
    const expensesMonth = await prisma.expense.aggregate({
      _sum: { totalAmount: true },
      where: {
        date: { gte: startOfMonth },
      },
    });

    // 5. Vehicles in workshop
    const activeRepairStatuses = [
      'NEW', 'PENDING_INSPECTION', 'PENDING_APPROVAL', 'APPROVED',
      'IN_PROGRESS', 'WAITING_PARTS', 'READY_FOR_DELIVERY'
    ];
    const vehiclesInWorkshop = await prisma.repairOrder.count({
      where: { status: { in: activeRepairStatuses } },
    });

    const openJobCards = await prisma.repairOrder.count({
      where: { status: { notIn: ['CLOSED', 'CANCELLED'] } },
    });

    // 6. Receivables & Payables
    const customers = await prisma.customer.findMany({ select: { currentBalance: true } });
    const customerReceivables = customers.reduce((acc, c) => acc + (c.currentBalance > 0 ? c.currentBalance : 0), 0);

    const suppliers = await prisma.supplier.findMany({ select: { currentBalance: true } });
    const supplierPayables = suppliers.reduce((acc, s) => acc + (s.currentBalance > 0 ? s.currentBalance : 0), 0);

    // 7. Inventory Value
    const stockBalances = await prisma.stockBalance.findMany({
      include: { item: { select: { avgCost: true } } },
    });
    const inventoryValue = stockBalances.reduce((acc, sb) => acc + (sb.quantity * sb.item.avgCost), 0);

    // 8. Cost of Goods Sold (month)
    const soldItems = await prisma.salesInvoiceItem.findMany({
      where: {
        invoice: { date: { gte: startOfMonth }, status: { not: 'CANCELLED' } },
        itemType: 'PART',
      },
      select: { quantity: true, costPrice: true },
    });
    const partsCostMonth = soldItems.reduce((acc, it) => acc + (it.quantity * it.costPrice), 0);

    // Net Profit Month = (Sales Total - Parts Cost - Expenses)
    const totalSalesNum = salesMonth._sum.grandTotal || 0;
    const totalExpNum = expensesMonth._sum.totalAmount || 0;
    const netProfit = totalSalesNum - partsCostMonth - totalExpNum;

    res.json({
      salesToday: salesToday._sum.grandTotal || 0,
      todayInvoicesCount: salesToday._count.id || 0,
      salesMonth: totalSalesNum,
      maintenanceRevenue: maintenanceRev._sum.grandTotal || 0,
      sparePartsCost: partsCostMonth,
      expensesMonth: totalExpNum,
      netProfit,
      vehiclesInWorkshop,
      openJobCards,
      customerReceivables,
      supplierPayables,
      inventoryValue,
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/charts', async (req, res) => {
  try {
    const now = new Date();

    // Last 7 days sales
    const last7Days: { date: string; day: string; sales: number; parts: number; maintenance: number }[] = [];
    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

      const dayInvoices = await prisma.salesInvoice.findMany({
        where: {
          date: { gte: start, lte: end },
          status: { not: 'CANCELLED' },
          invoiceType: { not: 'QUOTATION' },
        },
      });

      const dayTotal = dayInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
      const partsTotal = dayInvoices.filter(i => i.invoiceType === 'POS').reduce((acc, i) => acc + i.grandTotal, 0);
      const maintTotal = dayInvoices.filter(i => i.invoiceType === 'MAINTENANCE').reduce((acc, i) => acc + i.grandTotal, 0);

      last7Days.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        day: arabicDays[d.getDay()],
        sales: Math.round(dayTotal),
        parts: Math.round(partsTotal),
        maintenance: Math.round(maintTotal),
      });
    }

    // Top 5 selling items
    const topItemsData = await prisma.salesInvoiceItem.groupBy({
      by: ['itemId'],
      _sum: { quantity: true, total: true },
      where: {
        itemId: { not: null },
        invoice: { status: { not: 'CANCELLED' }, invoiceType: { not: 'QUOTATION' } },
      },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    const topItems = await Promise.all(
      topItemsData.map(async (ti) => {
        const item = await prisma.item.findUnique({ where: { id: ti.itemId! } });
        return {
          name: item?.nameAr || 'صنف غير معروف',
          sku: item?.sku || '',
          quantity: ti._sum.quantity || 0,
          total: Math.round(ti._sum.total || 0),
        };
      })
    );

    // Top services executed
    const topServicesData = await prisma.repairLabor.groupBy({
      by: ['serviceName'],
      _count: { id: true },
      _sum: { total: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const topServices = topServicesData.map(ts => ({
      name: ts.serviceName,
      count: ts._count.id,
      revenue: Math.round(ts._sum.total || 0),
    }));

    // Technician productivity
    const techLabors = await prisma.repairLabor.findMany({
      include: { technician: true },
    });

    const techMap: Record<string, { name: string; hours: number; revenue: number; jobsCount: number }> = {};
    for (const tl of techLabors) {
      if (!tl.technician) continue;
      const tId = tl.technician.id;
      if (!techMap[tId]) {
        techMap[tId] = { name: tl.technician.name, hours: 0, revenue: 0, jobsCount: 0 };
      }
      techMap[tId].hours += tl.hours;
      techMap[tId].revenue += tl.total;
      techMap[tId].jobsCount += 1;
    }

    const techProductivity = Object.values(techMap).sort((a, b) => b.revenue - a.revenue);

    res.json({
      last7Days,
      topItems,
      topServices,
      techProductivity,
    });
  } catch (error: any) {
    console.error('Charts error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const alerts: { id: string; type: string; title: string; message: string; severity: 'warning' | 'danger' | 'info'; link?: string }[] = [];

    // 1. Low stock items
    const allItems = await prisma.item.findMany({
      include: { stockBalances: true },
      where: { active: true },
    });

    for (const it of allItems) {
      const totalQty = it.stockBalances.reduce((acc, sb) => acc + sb.quantity, 0);
      if (totalQty === 0) {
        alerts.push({
          id: `out-of-stock-${it.id}`,
          type: 'OUT_OF_STOCK',
          title: `نفاد مخزون: ${it.nameAr}`,
          message: `الكمية المتوفرة حالياً 0 (الحد الأدنى ${it.minStock})`,
          severity: 'danger',
          link: '/warehouses',
        });
      } else if (totalQty <= it.minStock) {
        alerts.push({
          id: `low-stock-${it.id}`,
          type: 'LOW_STOCK',
          title: `وصل لحد الطلب: ${it.nameAr}`,
          message: `الكمية المتوفرة ${totalQty} تقترب من حد إعادة الطلب (${it.minStock})`,
          severity: 'warning',
          link: '/warehouses',
        });
      }
    }

    // 2. Pending customer approval job cards
    const pendingApprovals = await prisma.repairOrder.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: { customer: true, vehicle: true },
    });

    for (const pa of pendingApprovals) {
      alerts.push({
        id: `pending-app-${pa.id}`,
        type: 'PENDING_APPROVAL',
        title: `أمر إصلاح بانتظار موافقة العميل: ${pa.orderNumber}`,
        message: `العميل ${pa.customer.name} - سيارة ${pa.vehicle.make} ${pa.vehicle.model} (${pa.vehicle.plateNumber})`,
        severity: 'info',
        link: `/workshop/job-cards/${pa.id}`,
      });
    }

    // 3. Overdue unpaid sales invoices
    const unpaidInvoices = await prisma.salesInvoice.findMany({
      where: {
        remainingAmount: { gt: 0 },
        status: { not: 'CANCELLED' },
        invoiceType: { not: 'QUOTATION' },
      },
      include: { customer: true },
      take: 5,
    });

    for (const up of unpaidInvoices) {
      alerts.push({
        id: `unpaid-inv-${up.id}`,
        type: 'UNPAID_INVOICE',
        title: `فاتورة غير مسددة: ${up.invoiceNumber}`,
        message: `العميل ${up.customer?.name || 'نقدي'} - المبلغ المتبقي: ${up.remainingAmount} ج.م`,
        severity: 'warning',
        link: '/sales',
      });
    }

    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
