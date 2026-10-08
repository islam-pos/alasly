import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';

const router = Router();

// --- Company Settings ---
router.get('/company', async (req, res) => {
  try {
    let company = await prisma.companySetting.findFirst();
    if (!company) {
      company = await prisma.companySetting.create({ data: {} });
    }
    res.json(company);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/company', async (req, res) => {
  try {
    const input = req.body as Record<string, unknown>;
    const data: Prisma.CompanySettingCreateInput = {};
    const stringFields = [
      'name', 'nameEn', 'logoUrl', 'taxNumber', 'commercialRegister', 'address',
      'city', 'country', 'phone', 'mobile', 'email', 'website', 'currency',
      'currencySymbol', 'invoiceHeader', 'invoiceFooter', 'termsAndConditions',
      'supportTitle', 'supportDescription', 'supportPhoneLabel', 'supportPhone',
    ] as const;

    for (const field of stringFields) {
      if (typeof input[field] === 'string') {
        Object.assign(data, { [field]: input[field] });
      } else if (
        input[field] === null
        && ['nameEn', 'logoUrl', 'invoiceHeader', 'invoiceFooter', 'termsAndConditions'].includes(field)
      ) {
        Object.assign(data, { [field]: null });
      }
    }

    if (input.commercialRegister === undefined && typeof input.crNumber === 'string') {
      data.commercialRegister = input.crNumber;
    }

    const taxRate = input.taxRate ?? input.vatRate;
    if (typeof taxRate === 'number' && Number.isFinite(taxRate)) {
      data.taxRate = taxRate;
    } else if (taxRate !== undefined) {
      return res.status(400).json({ error: 'نسبة الضريبة يجب أن تكون رقمًا صالحًا' });
    }

    if (typeof input.printSettings === 'string') {
      data.printSettings = input.printSettings;
    } else if (input.printSettings && typeof input.printSettings === 'object') {
      data.printSettings = JSON.stringify(input.printSettings);
    } else if (input.printSettings !== undefined) {
      return res.status(400).json({ error: 'إعدادات الطباعة غير صالحة' });
    }

    let company = await prisma.companySetting.findFirst();
    if (!company) {
      company = await prisma.companySetting.create({ data });
    } else {
      company = await prisma.companySetting.update({
        where: { id: company.id },
        data,
      });
    }
    await logAudit({ action: 'UPDATE', entity: 'CompanySetting', entityId: company.id, details: 'تحديث بيانات المنشأة والضريبة' });
    res.json(company);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Branches ---
router.get('/branches', async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      include: {
        warehouses: true,
        cashboxes: true,
        _count: { select: { employees: true, repairOrders: true, salesInvoices: true } },
      },
    });
    res.json(branches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/branches', async (req, res) => {
  try {
    const branch = await prisma.branch.create({ data: req.body });
    res.status(201).json(branch);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Categories ---
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.itemCategory.findMany({
      include: {
        _count: { select: { items: true } },
        parent: true,
        children: true,
      },
    });
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const cat = await prisma.itemCategory.create({ data: req.body });
    res.status(201).json(cat);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Units ---
router.get('/units', async (req, res) => {
  try {
    const units = await prisma.unit.findMany({
      include: { _count: { select: { items: true } } },
    });
    res.json(units);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/units', async (req, res) => {
  try {
    const unit = await prisma.unit.create({ data: req.body });
    res.status(201).json(unit);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Warehouses ---
router.get('/warehouses', async (req, res) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: {
        branch: true,
        locations: true,
        _count: { select: { stockBalances: true } },
      },
    });
    res.json(warehouses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/warehouses', async (req, res) => {
  try {
    const wh = await prisma.warehouse.create({ data: req.body });
    res.status(201).json(wh);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Suppliers ---
router.get('/suppliers', async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, code: true } },
        _count: { select: { purchaseInvoices: true, purchaseOrders: true } },
      },
    });
    res.json(suppliers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/suppliers', async (req, res) => {
  try {
    const { alsoCustomer = false, ...supplierData } = req.body;
    const count = await prisma.supplier.count();
    const customerCount = alsoCustomer ? await prisma.customer.count() : 0;
    const code = supplierData.code || `SUP-${String(count + 1).padStart(2, '0')}`;
    const supplier = await prisma.$transaction(async (tx) => {
      const createdSupplier = await tx.supplier.create({
        data: {
          ...supplierData,
          code,
          currentBalance: supplierData.currentBalance ?? supplierData.openingBalance ?? 0,
        },
      });
      if (!alsoCustomer) return createdSupplier;

      const customer = await tx.customer.create({
        data: {
          code: `CUS-${String(customerCount + 1).padStart(3, '0')}`,
          name: supplierData.name,
          phone: supplierData.phone,
          whatsappNumber: supplierData.whatsappNumber || null,
          whatsappOptIn: supplierData.whatsappOptIn === true,
          mobile: supplierData.mobile || null,
          email: supplierData.email || null,
          address: supplierData.address || null,
          taxNumber: supplierData.taxNumber || null,
          customerType: supplierData.company ? 'COMPANY' : 'INDIVIDUAL',
          openingBalance: supplierData.openingBalance || 0,
          currentBalance: supplierData.currentBalance ?? supplierData.openingBalance ?? 0,
          creditLimit: supplierData.creditLimit || 0,
          notes: supplierData.notes || null,
        },
      });
      return tx.supplier.update({
        where: { id: createdSupplier.id },
        data: { customerId: customer.id },
        include: { customer: { select: { id: true, code: true } } },
      });
    });
    res.status(201).json(supplier);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/suppliers/:id', async (req, res) => {
  try {
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(supplier);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Customers ---
router.get('/customers', async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { id: true, code: true } },
        vehicles: true,
        _count: { select: { repairOrders: true, salesInvoices: true } },
      },
    });
    res.json(customers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/customers', async (req, res) => {
  try {
    const { alsoSupplier = false, ...customerData } = req.body;
    const count = await prisma.customer.count();
    const supplierCount = alsoSupplier ? await prisma.supplier.count() : 0;
    const code = customerData.code || `CUS-${String(count + 1).padStart(3, '0')}`;
    const customer = await prisma.$transaction(async (tx) => {
      const createdCustomer = await tx.customer.create({
        data: {
          ...customerData,
          code,
          currentBalance: customerData.currentBalance ?? customerData.openingBalance ?? 0,
        },
      });
      if (!alsoSupplier) return createdCustomer;

      const supplier = await tx.supplier.create({
        data: {
          code: `SUP-${String(supplierCount + 1).padStart(2, '0')}`,
          name: customerData.name,
          company: customerData.customerType === 'COMPANY' ? customerData.name : null,
          phone: customerData.phone,
          whatsappNumber: customerData.whatsappNumber || null,
          whatsappOptIn: customerData.whatsappOptIn === true,
          mobile: customerData.mobile || null,
          email: customerData.email || null,
          address: customerData.address || null,
          taxNumber: customerData.taxNumber || null,
          openingBalance: customerData.openingBalance || 0,
          currentBalance: customerData.currentBalance ?? customerData.openingBalance ?? 0,
          creditLimit: customerData.creditLimit || 0,
          notes: customerData.notes || null,
          customerId: createdCustomer.id,
        },
      });
      return tx.customer.findUniqueOrThrow({
        where: { id: createdCustomer.id },
        include: { supplier: { select: { id: true, code: true } } },
      });
    });
    res.status(201).json(customer);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/customers/:id', async (req, res) => {
  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(customer);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Vehicles (Section 22: Vehicle Profile with tabs) ---
router.get('/vehicles', async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      include: {
        customer: true,
        _count: { select: { repairOrders: true, salesInvoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(vehicles);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/vehicles/:id', async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        repairOrders: {
          include: {
            technician: true,
            serviceAdvisor: true,
            inspections: true,
            estimates: { include: { items: true } },
            parts: { include: { item: true } },
            labors: true,
            salesInvoice: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        salesInvoices: {
          include: { items: { include: { item: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!vehicle) return res.status(404).json({ error: 'السيارة غير موجودة' });

    // Aggregate parts replaced over time
    const replacedParts: any[] = [];
    vehicle.repairOrders.forEach((ro) => {
      ro.parts.forEach((p) => {
        if (p.usedQty > 0) {
          replacedParts.push({
            date: ro.createdAt,
            orderNumber: ro.orderNumber,
            partName: p.item.nameAr,
            sku: p.item.sku,
            quantity: p.usedQty,
            unitPrice: p.unitPrice,
            total: p.total,
          });
        }
      });
    });

    // Aggregate services performed over time
    const performedServices: any[] = [];
    vehicle.repairOrders.forEach((ro) => {
      ro.labors.forEach((l) => {
        performedServices.push({
          date: ro.createdAt,
          orderNumber: ro.orderNumber,
          serviceName: l.serviceName,
          technician: l.technicianId,
          hours: l.hours,
          total: l.total,
          status: l.status,
        });
      });
    });

    res.json({
      vehicle,
      replacedParts,
      performedServices,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/vehicles', async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.create({
      data: req.body,
      include: { customer: true },
    });
    res.status(201).json(vehicle);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/vehicles/:id', async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(vehicle);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Employees & Jobs ---
router.get('/employees', async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      include: {
        job: true,
        branch: true,
        _count: { select: { assignedRepairs: true, commissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(employees);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/employees', async (req, res) => {
  try {
    const count = await prisma.employee.count();
    const code = req.body.code || `EMP-${String(count + 101)}`;
    const employee = await prisma.employee.create({
      data: { ...req.body, code },
      include: { job: true },
    });
    res.status(201).json(employee);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const jobs = await prisma.jobTitle.findMany();
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/roles', async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      include: { _count: { select: { users: true } } },
    });
    res.json(roles);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
