import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { AuthenticatedRequest, authenticate, loadUserPermissions, requirePermission } from '../middleware/auth';
import { isPermissionKey } from '../lib/permissions';

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
    let company = await prisma.companySetting.findFirst();
    if (!company) {
      company = await prisma.companySetting.create({ data: req.body });
    } else {
      company = await prisma.companySetting.update({
        where: { id: company.id },
        data: req.body,
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
    const count = await prisma.supplier.count();
    const code = req.body.code || `SUP-${String(count + 1).padStart(2, '0')}`;
    const supplier = await prisma.supplier.create({
      data: { ...req.body, code },
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
    const count = await prisma.customer.count();
    const code = req.body.code || `CUS-${String(count + 1).padStart(3, '0')}`;
    const customer = await prisma.customer.create({
      data: { ...req.body, code },
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

router.put(
  '/roles/:id/permissions',
  authenticate,
  loadUserPermissions,
  requirePermission('manage_settings'),
  async (req, res) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { permissions } = req.body;
      if (
        !Array.isArray(permissions) ||
        permissions.some((permission) => typeof permission !== 'string' || !isPermissionKey(permission))
      ) {
        return res.status(400).json({ error: 'قائمة الصلاحيات غير صالحة' });
      }

      const role = await prisma.role.findUnique({ where: { id: req.params.id } });
      if (!role) return res.status(404).json({ error: 'الدور غير موجود' });
      if (role.name === 'admin') {
        return res.status(400).json({ error: 'لا يمكن تعديل صلاحيات مدير النظام' });
      }

      const uniquePermissions = [...new Set(permissions)];
      const updatedRole = await prisma.role.update({
        where: { id: role.id },
        data: { permissions: JSON.stringify(uniquePermissions) },
      });

      await logAudit({
        userId: authenticatedReq.user?.id,
        action: 'UPDATE',
        entity: 'RolePermissions',
        entityId: role.id,
        details: `تحديث صلاحيات الدور ${role.nameAr}`,
        ipAddress: req.ip,
      });

      res.json(updatedRole);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

export default router;
