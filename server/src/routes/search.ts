import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({
        vehicles: [],
        customers: [],
        items: [],
        jobCards: [],
        invoices: [],
        suppliers: [],
      });
    }

    // 1. Search Vehicles (by plate, VIN, make, model)
    const vehicles = await prisma.vehicle.findMany({
      where: {
        OR: [
          { plateNumber: { contains: q } },
          { vin: { contains: q } },
          { make: { contains: q } },
          { model: { contains: q } },
        ],
      },
      include: {
        customer: true,
        repairOrders: { take: 3, orderBy: { createdAt: 'desc' } },
        salesInvoices: { take: 3, orderBy: { date: 'desc' } },
      },
      take: 5,
    });

    // 2. Search Customers (by name, phone, taxNumber)
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { mobile: { contains: q } },
          { code: { contains: q } },
        ],
      },
      include: { vehicles: true },
      take: 5,
    });

    // 3. Search Items (by SKU, barcode, partNumber, nameAr)
    const items = await prisma.item.findMany({
      where: {
        OR: [
          { nameAr: { contains: q } },
          { sku: { contains: q } },
          { barcode: { contains: q } },
          { partNumber: { contains: q } },
        ],
      },
      include: { stockBalances: { include: { warehouse: true } } },
      take: 5,
    });

    // 4. Search Job Cards (by orderNumber, customerComplaint)
    const jobCards = await prisma.repairOrder.findMany({
      where: {
        OR: [
          { orderNumber: { contains: q } },
          { customerComplaint: { contains: q } },
        ],
      },
      include: { customer: true, vehicle: true },
      take: 5,
    });

    // 5. Search Sales Invoices (by invoiceNumber)
    const invoices = await prisma.salesInvoice.findMany({
      where: {
        OR: [
          { invoiceNumber: { contains: q } },
        ],
      },
      include: { customer: true, vehicle: true },
      take: 5,
    });

    // 6. Search Suppliers (by name, company, phone)
    const suppliers = await prisma.supplier.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { company: { contains: q } },
          { phone: { contains: q } },
        ],
      },
      take: 5,
    });

    res.json({
      vehicles,
      customers,
      items: items.map((it) => ({
        ...it,
        totalQuantity: it.stockBalances.reduce((sum, b) => sum + b.quantity, 0),
      })),
      jobCards,
      invoices,
      suppliers,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
