import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/suggestions', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ suggestions: [] });

    const [customers, suppliers, employees, vehicles, items, categories, units, warehouses, jobCards, salesInvoices, purchaseInvoices, cashTransactions] =
      await Promise.all([
        prisma.customer.findMany({
          where: { OR: [{ name: { contains: q } }, { code: { contains: q } }, { phone: { contains: q } }, { mobile: { contains: q } }, { email: { contains: q } }, { address: { contains: q } }, { taxNumber: { contains: q } }, { notes: { contains: q } }] },
          take: 8,
        }),
        prisma.supplier.findMany({
          where: { OR: [{ name: { contains: q } }, { company: { contains: q } }, { code: { contains: q } }, { phone: { contains: q } }, { mobile: { contains: q } }, { email: { contains: q } }, { address: { contains: q } }, { taxNumber: { contains: q } }, { notes: { contains: q } }] },
          take: 8,
        }),
        prisma.employee.findMany({
          where: { OR: [{ name: { contains: q } }, { code: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }, { department: { contains: q } }] },
          include: { job: true },
          take: 8,
        }),
        prisma.vehicle.findMany({
          where: { OR: [{ plateNumber: { contains: q } }, { vin: { contains: q } }, { make: { contains: q } }, { model: { contains: q } }, { color: { contains: q } }, { engineType: { contains: q } }, { engineNumber: { contains: q } }, { notes: { contains: q } }] },
          include: { customer: true },
          take: 8,
        }),
        prisma.item.findMany({
          where: { OR: [{ nameAr: { contains: q } }, { nameEn: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }, { partNumber: { contains: q } }, { manufacturer: { contains: q } }, { countryOfOrigin: { contains: q } }, { defaultLocation: { contains: q } }] },
          take: 8,
        }),
        prisma.itemCategory.findMany({
          where: { OR: [{ name: { contains: q } }, { description: { contains: q } }] },
          take: 8,
        }),
        prisma.unit.findMany({ where: { OR: [{ name: { contains: q } }, { symbol: { contains: q } }] }, take: 8 }),
        prisma.warehouse.findMany({
          where: { OR: [{ code: { contains: q } }, { name: { contains: q } }, { location: { contains: q } }] },
          take: 8,
        }),
        prisma.repairOrder.findMany({
          where: { OR: [{ orderNumber: { contains: q } }, { customerComplaint: { contains: q } }, { intakeNotes: { contains: q } }, { notes: { contains: q } }] },
          take: 8,
        }),
        prisma.salesInvoice.findMany({
          where: { OR: [{ invoiceNumber: { contains: q } }, { notes: { contains: q } }, { status: { contains: q } }] },
          take: 8,
        }),
        prisma.purchaseInvoice.findMany({
          where: { OR: [{ invoiceNumber: { contains: q } }, { supplierInvoiceNumber: { contains: q } }, { notes: { contains: q } }, { status: { contains: q } }] },
          take: 8,
        }),
        prisma.cashTransaction.findMany({
          where: { OR: [{ partyName: { contains: q } }, { description: { contains: q } }, { referenceId: { contains: q } }, { referenceType: { contains: q } }] },
          take: 8,
        }),
      ]);

    const matches = (value: unknown) => typeof value === 'string' && value.toLocaleLowerCase().includes(q.toLocaleLowerCase());
    const suggestions: { value: string; label: string }[] = [];
    const add = (label: string, values: unknown[]) => {
      values.forEach((value) => {
        if (matches(value)) suggestions.push({ value: String(value).trim(), label });
      });
    };

    customers.forEach((row) => add(`عميل: ${row.name}`, [row.name, row.code, row.phone, row.mobile, row.email, row.address, row.taxNumber, row.notes]));
    suppliers.forEach((row) => add(`مورد: ${row.name}`, [row.name, row.company, row.code, row.phone, row.mobile, row.email, row.address, row.taxNumber, row.notes]));
    employees.forEach((row) => add(`موظف: ${row.name}`, [row.name, row.code, row.phone, row.email, row.department, row.job.name]));
    vehicles.forEach((row) => add(`سيارة: ${row.plateNumber} · ${row.make} ${row.model}`, [row.plateNumber, row.vin, row.make, row.model, String(row.year), row.color, row.engineType, row.engineNumber, row.notes]));
    items.forEach((row) => add(`صنف: ${row.nameAr}`, [row.nameAr, row.nameEn, row.sku, row.barcode, row.partNumber, row.manufacturer, row.countryOfOrigin, row.defaultLocation]));
    categories.forEach((row) => add(`تصنيف: ${row.name}`, [row.name, row.description]));
    units.forEach((row) => add(`وحدة: ${row.name}`, [row.name, row.symbol]));
    warehouses.forEach((row) => add(`مخزن: ${row.name}`, [row.code, row.name, row.location]));
    jobCards.forEach((row) => add(`أمر إصلاح: ${row.orderNumber}`, [row.orderNumber, row.customerComplaint, row.intakeNotes, row.notes]));
    salesInvoices.forEach((row) => add(`فاتورة مبيعات: ${row.invoiceNumber}`, [row.invoiceNumber, row.notes, row.status]));
    purchaseInvoices.forEach((row) => add(`فاتورة مشتريات: ${row.invoiceNumber}`, [row.invoiceNumber, row.supplierInvoiceNumber, row.notes, row.status]));
    cashTransactions.forEach((row) => add(`سند: ${row.partyName || row.referenceId || row.id}`, [row.partyName, row.description, row.referenceId, row.referenceType]));

    const seen = new Set<string>();
    const unique = suggestions.filter((suggestion) => {
      const key = suggestion.value.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ suggestions: unique.slice(0, 40) });
  } catch (error) {
    console.error('Failed to load smart search suggestions:', error);
    res.status(500).json({ error: 'تعذر تحميل اقتراحات البحث' });
  }
});

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.json({
        vehicles: [],
        customers: [],
        items: [],
        jobCards: [],
        invoices: [],
        suppliers: [],
      });
    }

    const [vehicles, customers, items, jobCards, invoices, suppliers] = await Promise.all([
      prisma.vehicle.findMany({
        where: {
          OR: [
            { plateNumber: { contains: q } },
            { vin: { contains: q } },
            { make: { contains: q } },
            { model: { contains: q } },
            { color: { contains: q } },
            { engineNumber: { contains: q } },
            { notes: { contains: q } },
          ],
        },
        include: {
          customer: true,
          repairOrders: { take: 3, orderBy: { createdAt: 'desc' } },
          salesInvoices: { take: 3, orderBy: { date: 'desc' } },
        },
        take: 5,
      }),
      prisma.customer.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { mobile: { contains: q } },
            { code: { contains: q } },
            { email: { contains: q } },
            { address: { contains: q } },
            { taxNumber: { contains: q } },
          ],
        },
        include: { vehicles: true },
        take: 5,
      }),
      prisma.item.findMany({
        where: {
          OR: [
            { nameAr: { contains: q } },
            { nameEn: { contains: q } },
            { sku: { contains: q } },
            { barcode: { contains: q } },
            { partNumber: { contains: q } },
            { manufacturer: { contains: q } },
            { countryOfOrigin: { contains: q } },
            { defaultLocation: { contains: q } },
          ],
        },
        include: { stockBalances: { include: { warehouse: true } } },
        take: 5,
      }),
      prisma.repairOrder.findMany({
        where: {
          OR: [
            { orderNumber: { contains: q } },
            { customerComplaint: { contains: q } },
            { notes: { contains: q } },
            { intakeNotes: { contains: q } },
          ],
        },
        include: { customer: true, vehicle: true },
        take: 5,
      }),
      prisma.salesInvoice.findMany({
        where: { OR: [{ invoiceNumber: { contains: q } }, { notes: { contains: q } }, { status: { contains: q } }] },
        include: { customer: true, vehicle: true },
        take: 5,
      }),
      prisma.supplier.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { company: { contains: q } },
            { code: { contains: q } },
            { phone: { contains: q } },
            { mobile: { contains: q } },
            { email: { contains: q } },
            { address: { contains: q } },
            { taxNumber: { contains: q } },
          ],
        },
        take: 5,
      }),
    ]);

    res.json({
      vehicles,
      customers,
      items: items.map((item) => ({
        ...item,
        totalQuantity: item.stockBalances.reduce((sum, balance) => sum + balance.quantity, 0),
      })),
      jobCards,
      invoices,
      suppliers,
    });
  } catch (error) {
    console.error('Failed to search records:', error);
    res.status(500).json({ error: 'تعذر تنفيذ البحث' });
  }
});

export default router;
