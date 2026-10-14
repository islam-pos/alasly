import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { AuthenticatedRequest, authenticate, loadUserPermissions, requirePermission } from '../middleware/auth';
import { isPermissionKey } from '../lib/permissions';
import { parseOdometerReading } from '../services/vehicleValidation';

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

    data.currency = 'EGP';
    data.currencySymbol = 'ج.م';

    if (input.commercialRegister === undefined && typeof input.crNumber === 'string') {
      data.commercialRegister = input.crNumber;
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
    await logAudit({ action: 'UPDATE', entity: 'CompanySetting', entityId: company.id, details: 'تحديث بيانات المنشأة' });
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
    const data = { ...req.body };
    const odometer = parseOdometerReading(data.currentOdometer);
    if (odometer === null) delete data.currentOdometer;
    else data.currentOdometer = odometer;

    const vehicle = await prisma.vehicle.create({
      data,
      include: { customer: true },
    });
    res.status(201).json(vehicle);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/vehicles/:id', async (req, res) => {
  try {
    const currentVehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      select: { id: true, currentOdometer: true },
    });
    if (!currentVehicle) return res.status(404).json({ error: 'السيارة غير موجودة' });

    const data = { ...req.body };
    const odometer = parseOdometerReading(data.currentOdometer);
    if (odometer === null) delete data.currentOdometer;
    else if (odometer < currentVehicle.currentOdometer) {
      return res.status(400).json({ error: 'قراءة العداد لا يمكن أن تقل عن آخر قراءة مسجلة' });
    } else data.currentOdometer = odometer;

    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.id },
      data,
    });
    res.json(vehicle);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/vehicles/:id/reminders', async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!vehicle) return res.status(404).json({ error: 'السيارة غير موجودة' });

    const reminders = await prisma.maintenanceReminder.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { dueOdometer: 'asc' }],
    });
    res.json(reminders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/vehicles/:id/reminders', async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      select: { id: true, currentOdometer: true },
    });
    if (!vehicle) return res.status(404).json({ error: 'السيارة غير موجودة' });

    const serviceName = typeof req.body.serviceName === 'string' ? req.body.serviceName.trim() : '';
    if (!serviceName) return res.status(400).json({ error: 'اسم الصيانة مطلوب' });

    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({ error: 'تاريخ التذكير غير صالح' });
    }

    const dueOdometer = parseOdometerReading(req.body.dueOdometer);
    if (!dueDate && dueOdometer === null) {
      return res.status(400).json({ error: 'حدد تاريخ الاستحقاق أو قراءة العداد' });
    }
    if (dueOdometer !== null && dueOdometer < vehicle.currentOdometer) {
      return res.status(400).json({ error: 'قراءة الاستحقاق أقل من العداد الحالي للسيارة' });
    }

    const reminder = await prisma.maintenanceReminder.create({
      data: {
        vehicleId: vehicle.id,
        serviceName,
        dueDate,
        dueOdometer,
        notes: typeof req.body.notes === 'string' ? req.body.notes.trim() || null : null,
      },
    });
    await logAudit({
      action: 'CREATE',
      entity: 'MaintenanceReminder',
      entityId: reminder.id,
      details: `إنشاء تذكير صيانة للسيارة ${vehicle.id}`,
    });
    res.status(201).json(reminder);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/vehicles/:id/reminders/:reminderId', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['PENDING', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'حالة التذكير غير صالحة' });
    }

    const result = await prisma.maintenanceReminder.updateMany({
      where: { id: req.params.reminderId, vehicleId: req.params.id },
      data: {
        status,
        ...(status === 'PENDING' ? { sentAt: null, lastAttemptAt: null } : {}),
      },
    });
    if (!result.count) return res.status(404).json({ error: 'تذكير الصيانة غير موجود' });

    const reminder = await prisma.maintenanceReminder.findUnique({ where: { id: req.params.reminderId } });
    res.json(reminder);
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

router.post('/employees', async (req: AuthenticatedRequest, res) => {
  try {
    const { name, phone, email, nationalId, jobId, department, hireDate, salary, commissionRate, branchId, active } = req.body || {};
    if (
      typeof name !== 'string' || !name.trim() ||
      typeof phone !== 'string' || !phone.trim() ||
      typeof jobId !== 'string' || !jobId ||
      !Number.isFinite(Number(salary)) || Number(salary) < 0 ||
      (commissionRate !== undefined && (!Number.isFinite(Number(commissionRate)) || Number(commissionRate) < 0 || Number(commissionRate) > 100)) ||
      (email !== undefined && email !== null && typeof email !== 'string') ||
      (nationalId !== undefined && nationalId !== null && typeof nationalId !== 'string') ||
      (branchId !== undefined && branchId !== null && typeof branchId !== 'string') ||
      (active !== undefined && typeof active !== 'boolean') ||
      (hireDate !== undefined && Number.isNaN(new Date(hireDate).getTime()))
    ) {
      return res.status(400).json({ error: 'بيانات الموظف غير صالحة' });
    }
    const count = await prisma.employee.count();
    const code = req.body.code || `EMP-${String(count + 101)}`;
    const employee = await prisma.employee.create({
      data: {
        code,
        name: name.trim(),
        phone: phone.trim(),
        email: typeof email === 'string' && email.trim() ? email.trim() : null,
        nationalId: typeof nationalId === 'string' && nationalId.trim() ? nationalId.trim() : null,
        jobId,
        department: typeof department === 'string' && department.trim() ? department.trim() : 'الورشة',
        hireDate: hireDate ? new Date(hireDate) : new Date(),
        salary: Number(salary),
        commissionRate: Number(commissionRate || 0),
        branchId: typeof branchId === 'string' && branchId ? branchId : null,
        active: active ?? true,
      },
      include: { job: true, branch: true },
    });
    await logAudit({ userId: req.user?.id, action: 'CREATE', entity: 'Employee', entityId: employee.id, details: `إضافة الموظف ${employee.name}`, ipAddress: req.ip });
    res.status(201).json(employee);
  } catch (err: any) {
    console.error('Failed to create employee:', err);
    if (err.code === 'P2002') return res.status(409).json({ error: 'رقم الهوية أو كود الموظف مستخدم بالفعل' });
    res.status(400).json({ error: err.message });
  }
});

router.patch('/employees/:id', async (req: AuthenticatedRequest, res) => {
  const body = req.body || {};
  const allowedFields = ['name', 'phone', 'email', 'nationalId', 'jobId', 'department', 'hireDate', 'salary', 'commissionRate', 'branchId', 'active'];
  if (!Object.keys(body).length || Object.keys(body).some((key) => !allowedFields.includes(key))) {
    return res.status(400).json({ error: 'بيانات تعديل الموظف غير صالحة' });
  }
  if (
    (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) ||
    (body.phone !== undefined && (typeof body.phone !== 'string' || !body.phone.trim())) ||
    (body.email !== undefined && body.email !== null && typeof body.email !== 'string') ||
    (body.nationalId !== undefined && body.nationalId !== null && typeof body.nationalId !== 'string') ||
    (body.jobId !== undefined && (typeof body.jobId !== 'string' || !body.jobId)) ||
    (body.department !== undefined && typeof body.department !== 'string') ||
    (body.branchId !== undefined && body.branchId !== null && typeof body.branchId !== 'string') ||
    (body.hireDate !== undefined && Number.isNaN(new Date(body.hireDate).getTime())) ||
    (body.salary !== undefined && (!Number.isFinite(Number(body.salary)) || Number(body.salary) < 0)) ||
    (body.commissionRate !== undefined && (!Number.isFinite(Number(body.commissionRate)) || Number(body.commissionRate) < 0 || Number(body.commissionRate) > 100)) ||
    (body.active !== undefined && typeof body.active !== 'boolean')
  ) {
    return res.status(400).json({ error: 'بيانات تعديل الموظف غير صالحة' });
  }

  const data = {
    ...(body.name !== undefined ? { name: body.name.trim() } : {}),
    ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
    ...(body.email !== undefined ? { email: typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null } : {}),
    ...(body.nationalId !== undefined ? { nationalId: typeof body.nationalId === 'string' && body.nationalId.trim() ? body.nationalId.trim() : null } : {}),
    ...(body.jobId !== undefined ? { jobId: body.jobId } : {}),
    ...(body.department !== undefined ? { department: body.department.trim() } : {}),
    ...(body.hireDate !== undefined ? { hireDate: new Date(body.hireDate) } : {}),
    ...(body.salary !== undefined ? { salary: Number(body.salary) } : {}),
    ...(body.commissionRate !== undefined ? { commissionRate: Number(body.commissionRate) } : {}),
    ...(body.branchId !== undefined ? { branchId: body.branchId || null } : {}),
    ...(body.active !== undefined ? { active: body.active } : {}),
  };

  try {
    const employee = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.employee.update({
        where: { id: req.params.id },
        data,
        include: { job: true, branch: true },
      });
      if (body.active === false) {
        await transaction.user.updateMany({ where: { employeeId: updated.id }, data: { active: false } });
      }
      return updated;
    });
    await logAudit({ userId: req.user?.id, action: 'UPDATE', entity: 'Employee', entityId: employee.id, details: `تعديل الموظف ${employee.name}`, ipAddress: req.ip });
    res.json(employee);
  } catch (err: any) {
    console.error('Failed to update employee:', err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'الموظف غير موجود' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'رقم الهوية مستخدم بالفعل' });
    res.status(400).json({ error: 'تعذر تعديل بيانات الموظف' });
  }
});

router.delete('/employees/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const employee = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.employee.update({
        where: { id: req.params.id },
        data: { active: false },
      });
      await transaction.user.updateMany({ where: { employeeId: updated.id }, data: { active: false } });
      return updated;
    });
    await logAudit({ userId: req.user?.id, action: 'DELETE', entity: 'Employee', entityId: employee.id, details: `إيقاف الموظف ${employee.name}`, ipAddress: req.ip });
    res.json({ success: true, employee });
  } catch (err: any) {
    console.error('Failed to deactivate employee:', err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'الموظف غير موجود' });
    res.status(400).json({ error: 'تعذر إيقاف الموظف' });
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
