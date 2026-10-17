import { Router } from 'express';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { nextInvoiceNumber, withInvoiceTransaction } from '../services/documentNumbers';
import { postJournalEntry } from '../services/accounting';
import { AuthenticatedRequest } from '../middleware/auth';
import { branchWhere } from '../services/branchScope';
import { parseOdometerReading } from '../services/vehicleValidation';
import { approveRepairEstimate } from '../services/repairEstimates';

const router = Router();
const attachmentDirectory = path.join(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : path.resolve(process.cwd(), 'data')),
  'repair-attachments',
);

router.get('/labor-services', async (req: AuthenticatedRequest, res) => {
  try {
    const services = await prisma.repairLabor.groupBy({
      by: ['serviceName'],
      where: {
        serviceName: { not: '' },
        repairOrder: { is: branchWhere(req) },
      },
      _count: { id: true },
      _avg: { rate: true },
      orderBy: { _count: { id: 'desc' } },
      take: 500,
    });
    res.json({
      services: services.map((service) => ({
        name: service.serviceName,
        rate: service._avg.rate || 0,
      })),
    });
  } catch (error) {
    console.error('Workshop labor services load failed:', error);
    res.status(500).json({ error: 'تعذر تحميل قائمة خدمات وأجور الورشة' });
  }
});

router.get('/parts/requests', async (req: AuthenticatedRequest, res) => {
  try {
    const parts = await prisma.repairPart.findMany({
      where: { repairOrder: branchWhere(req) },
      select: {
        id: true,
        repairOrderId: true,
        itemId: true,
        warehouseId: true,
        requestedQty: true,
        issuedQty: true,
        usedQty: true,
        returnedQty: true,
        status: true,
        requestedById: true,
        createdAt: true,
        item: { select: { id: true, nameAr: true, sku: true, barcode: true } },
        warehouse: { select: { id: true, name: true } },
        repairOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            customer: { select: { name: true } },
            vehicle: { select: { plateNumber: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const requesterIds = [...new Set(parts.map((part) => part.requestedById).filter((id): id is string => Boolean(id)))];
    const requesters = requesterIds.length
      ? await prisma.user.findMany({
        where: { id: { in: requesterIds } },
        select: { id: true, fullName: true },
      })
      : [];
    const requesterNames = new Map(requesters.map((user) => [user.id, user.fullName]));
    res.json({
      requests: parts.map((part) => ({
        ...part,
        requestedByName: part.requestedById ? requesterNames.get(part.requestedById) || 'مستخدم سابق' : 'طلب من عرض سعر معتمد',
        remainingQty: Math.max(0, part.requestedQty - part.issuedQty),
      })),
    });
  } catch (error) {
    console.error('Workshop part requests load failed:', error);
    res.status(500).json({ error: 'تعذر تحميل طلبات قطع الورشة' });
  }
});

router.post('/parts/requests', async (req: AuthenticatedRequest, res) => {
  const repairOrderId = req.body?.repairOrderId;
  const requestedItems = req.body?.items;
  if (typeof repairOrderId !== 'string' || !repairOrderId.trim()
    || !Array.isArray(requestedItems) || requestedItems.length === 0 || requestedItems.length > 100) {
    return res.status(400).json({ error: 'حدد أمر الإصلاح وقطعة واحدة على الأقل للطلب' });
  }
  if (requestedItems.some((entry: any) => !entry || typeof entry.itemId !== 'string'
    || !Number.isInteger(Number(entry.quantity)) || Number(entry.quantity) < 1 || Number(entry.quantity) > 10000)) {
    return res.status(400).json({ error: 'تحقق من الأصناف والكميات المطلوبة؛ الكمية يجب أن تكون عددًا صحيحًا من 1 إلى 10000' });
  }
  const requestedItemIds = requestedItems.map((entry: any) => entry.itemId);
  if (new Set(requestedItemIds).size !== requestedItemIds.length) {
    return res.status(400).json({ error: 'لا تكرر الصنف نفسه في الطلب؛ اجمع الكمية في سطر واحد' });
  }

  try {
    const repairOrder = await prisma.repairOrder.findFirst({
      where: { id: repairOrderId, ...branchWhere(req) },
      select: { id: true, orderNumber: true, status: true },
    });
    if (!repairOrder) return res.status(404).json({ error: 'أمر الإصلاح غير موجود أو خارج فرعك' });
    if (repairOrder.status === 'CLOSED' || repairOrder.status === 'CANCELLED') {
      return res.status(400).json({ error: 'لا يمكن طلب قطع لأمر إصلاح مغلق أو ملغى' });
    }

    const items = await prisma.item.findMany({
      where: { id: { in: requestedItemIds }, active: true },
      select: { id: true, sellPrice: true, avgCost: true },
    });
    if (items.length !== requestedItemIds.length) {
      return res.status(400).json({ error: 'يوجد صنف غير موجود أو مؤرشف ضمن الطلب' });
    }
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const createdParts = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const entry of requestedItems as { itemId: string; quantity: number }[]) {
        const item = itemsById.get(entry.itemId)!;
        created.push(await tx.repairPart.create({
          data: {
            repairOrderId,
            itemId: item.id,
            requestedQty: Number(entry.quantity),
            unitPrice: item.sellPrice,
            costPrice: item.avgCost,
            total: item.sellPrice * Number(entry.quantity),
            status: 'REQUESTED',
            requestedById: req.user?.id,
          },
          select: {
            id: true,
            repairOrderId: true,
            itemId: true,
            requestedQty: true,
            issuedQty: true,
            status: true,
            requestedById: true,
            createdAt: true,
            item: { select: { id: true, nameAr: true, sku: true } },
          },
        }));
      }
      return created;
    });

    await logAudit({
      userId: req.user?.id,
      action: 'REQUEST_WORKSHOP_PARTS',
      entity: 'RepairOrder',
      entityId: repairOrder.id,
      details: `طلب ${createdParts.length} صنف للورشة لأمر الإصلاح ${repairOrder.orderNumber}`,
    });
    res.status(201).json({ requests: createdParts });
  } catch (error) {
    console.error('Workshop parts request creation failed:', error);
    res.status(500).json({ error: 'تعذر إنشاء طلب قطع الورشة' });
  }
});

// --- List Job Cards with filters ---
router.get('/job-cards', async (req: AuthenticatedRequest, res) => {
  try {
    const { status, customerId, vehicleId, technicianId, q } = req.query;
    let whereClause: any = branchWhere(req);

    if (status) {
      whereClause.status = String(status);
    }
    if (customerId) whereClause.customerId = String(customerId);
    if (vehicleId) whereClause.vehicleId = String(vehicleId);
    if (technicianId) whereClause.technicianId = String(technicianId);

    if (q) {
      const searchStr = String(q).trim();
      whereClause.OR = [
        { orderNumber: { contains: searchStr } },
        { customerComplaint: { contains: searchStr } },
        { customer: { name: { contains: searchStr } } },
        { customer: { phone: { contains: searchStr } } },
        { vehicle: { plateNumber: { contains: searchStr } } },
        { vehicle: { vin: { contains: searchStr } } },
      ];
    }

    const jobCards = await prisma.repairOrder.findMany({
      where: whereClause,
      include: {
        customer: true,
        vehicle: true,
        technician: true,
        serviceAdvisor: true,
        branch: true,
        _count: { select: { parts: true, labors: true, estimates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(jobCards);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Get Single Job Card with ALL Relations (Section 23: Complete 10-tab screen) ---
router.get('/job-cards/:id', async (req, res) => {
  try {
    const jobCard = await prisma.repairOrder.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        vehicle: true,
        technician: true,
        serviceAdvisor: true,
        branch: true,
        inspections: { orderBy: { createdAt: 'desc' } },
        estimates: {
          include: {
            items: { include: { item: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        parts: {
          include: {
            item: true,
            warehouse: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        labors: {
          include: { technician: true },
          orderBy: { createdAt: 'asc' },
        },
        commissions: {
          include: { employee: true },
        },
        salesInvoice: {
          include: {
            items: true,
            payments: { orderBy: { createdAt: 'asc' }, include: { cashbox: true } },
          },
        },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!jobCard) return res.status(404).json({ error: 'أمر الإصلاح غير موجود' });

    // Fetch related audit logs for this job card
    const auditLogs = await prisma.auditLog.findMany({
      where: { entity: 'RepairOrder', entityId: jobCard.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      jobCard,
      auditLogs,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/job-cards/:id/attachments', async (req, res) => {
  const { fileName, dataUrl } = req.body || {};
  if (typeof fileName !== 'string' || typeof dataUrl !== 'string' || fileName.length > 180) {
    return res.status(400).json({ error: 'بيانات الصورة غير صحيحة' });
  }
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return res.status(400).json({ error: 'ارفع صورة بصيغة JPG أو PNG أو WebP' });
  const mimeType = match[1];
  const content = Buffer.from(match[2], 'base64');
  if (!content.length || content.length > 3 * 1024 * 1024) {
    return res.status(413).json({ error: 'يجب ألا يتجاوز حجم الصورة 3 ميجابايت' });
  }

  try {
    const repairOrder = await prisma.repairOrder.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!repairOrder) return res.status(404).json({ error: 'أمر الإصلاح غير موجود' });
    await mkdir(attachmentDirectory, { recursive: true });
    const extension = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/png' ? '.png' : '.webp';
    const storageName = `${randomUUID()}${extension}`;
    const storagePath = path.join(attachmentDirectory, storageName);
    await writeFile(storagePath, content, { flag: 'wx' });
    try {
      const attachment = await prisma.repairAttachment.create({
        data: {
          repairOrderId: repairOrder.id,
          storageName,
          fileName: path.basename(fileName).slice(0, 180),
          mimeType,
          byteSize: content.length,
        },
      });
      await logAudit({
        action: 'UPLOAD_ATTACHMENT',
        entity: 'RepairOrder',
        entityId: repairOrder.id,
        details: `إرفاق صورة بأمر الإصلاح ${repairOrder.id}`,
      });
      res.status(201).json(attachment);
    } catch (error) {
      await unlink(storagePath).catch(() => undefined);
      throw error;
    }
  } catch (error: any) {
    console.error('Repair attachment upload failed:', error);
    res.status(500).json({ error: 'تعذر حفظ الصورة المرفقة' });
  }
});

router.get('/job-cards/:id/attachments/:attachmentId/file', async (req, res) => {
  try {
    const attachment = await prisma.repairAttachment.findFirst({
      where: { id: req.params.attachmentId, repairOrderId: req.params.id },
    });
    if (!attachment) return res.status(404).json({ error: 'الصورة غير موجودة' });
    const content = await readFile(path.join(attachmentDirectory, attachment.storageName));
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(attachment.mimeType).send(content);
  } catch (error: any) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'ملف الصورة غير موجود على وحدة التخزين' });
    console.error('Repair attachment retrieval failed:', error);
    res.status(500).json({ error: 'تعذر تحميل الصورة المرفقة' });
  }
});

router.post('/job-cards/:id/estimate/:estimateId/approval-link', async (req, res) => {
  try {
    const estimate = await prisma.repairEstimate.findFirst({
      where: { id: req.params.estimateId, repairOrderId: req.params.id },
      select: { id: true, status: true },
    });
    if (!estimate) return res.status(404).json({ error: 'عرض السعر غير موجود في أمر الإصلاح المحدد' });
    if (estimate.status !== 'PENDING') return res.status(409).json({ error: 'لا يمكن إصدار رابط لعرض سعر تم الرد عليه' });

    const token = randomBytes(32).toString('base64url');
    await prisma.repairEstimate.update({
      where: { id: estimate.id },
      data: {
        approvalTokenHash: createHash('sha256').update(token).digest('hex'),
        approvalTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });
    await logAudit({
      action: 'CREATE_ESTIMATE_APPROVAL_LINK',
      entity: 'RepairOrder',
      entityId: req.params.id,
      details: `إنشاء رابط موافقة صالح لمدة 48 ساعة لعرض السعر ${estimate.id}`,
    });
    res.json({ path: `/api/public/repair-approvals/${token}`, expiresInHours: 48 });
  } catch (error) {
    console.error('Repair estimate approval link creation failed:', error);
    res.status(500).json({ error: 'تعذر إنشاء رابط موافقة العميل' });
  }
});

// --- Open New Job Card ---
router.post('/job-cards', async (req, res) => {
  try {
    const {
      customerId,
      vehicleId,
      currentOdometer,
      fuelLevel = '50%',
      technicianId,
      serviceAdvisorId,
      branchId,
      customerComplaint,
      intakeNotes,
      estimatedCompletion,
    } = req.body;

    if (!customerId || !vehicleId || !customerComplaint) {
      return res.status(400).json({ error: 'العميل والسيارة وشكوى العميل حقول إلزامية' });
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, customerId: true, currentOdometer: true },
    });
    if (!vehicle) return res.status(404).json({ error: 'السيارة غير موجودة' });
    if (vehicle.customerId !== customerId) {
      return res.status(400).json({ error: 'السيارة غير مسجلة على العميل المحدد' });
    }

    const odometer = parseOdometerReading(currentOdometer) ?? vehicle.currentOdometer;
    if (odometer < vehicle.currentOdometer) {
      return res.status(400).json({ error: 'قراءة العداد لا يمكن أن تقل عن آخر قراءة مسجلة' });
    }

    const count = await prisma.repairOrder.count();
    const orderNumber = `JC-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const jobCard = await prisma.repairOrder.create({
      data: {
        orderNumber,
        customerId,
        vehicleId,
        currentOdometer: odometer,
        fuelLevel,
        technicianId: technicianId || null,
        serviceAdvisorId: serviceAdvisorId || null,
        branchId: branchId || null,
        customerComplaint,
        intakeNotes: intakeNotes || null,
        estimatedCompletion: estimatedCompletion ? new Date(estimatedCompletion) : null,
        status: 'NEW',
      },
      include: { customer: true, vehicle: true, technician: true, serviceAdvisor: true },
    });

    // Update vehicle's current odometer and last service date
    if (odometer !== vehicle.currentOdometer) {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          currentOdometer: odometer,
          lastServiceDate: new Date(),
        },
      });
    }

    await logAudit({
      action: 'CREATE',
      entity: 'RepairOrder',
      entityId: jobCard.id,
      details: `فتح أمر إصلاح جديد رقم ${orderNumber} للسيارة ${jobCard.vehicle.plateNumber}`,
    });

    res.status(201).json(jobCard);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Update Job Card Status ---
router.patch('/job-cards/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;

    const validStatuses = new Set([
      'NEW', 'PENDING_INSPECTION', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS',
      'WAITING_PARTS', 'COMPLETED', 'READY_FOR_DELIVERY', 'CLOSED', 'CANCELLED',
    ]);
    if (!validStatuses.has(status)) {
      return res.status(400).json({ error: 'حالة أمر الإصلاح غير صالحة' });
    }

    const currentOrder = await prisma.repairOrder.findUnique({
      where: { id: req.params.id },
      include: { estimates: true },
    });

    if (!currentOrder) return res.status(404).json({ error: 'أمر الإصلاح غير موجود' });

    if (status === 'IN_PROGRESS' && !currentOrder.technicianId) {
      return res.status(400).json({ error: 'يجب تعيين فني قبل بدء الإصلاح' });
    }

    // Business Rule Section 19: Cannot approve job card without customer approval on estimate!
    if (status === 'APPROVED') {
      const hasApprovedEstimate = currentOrder.estimates.some((e) => e.isApprovedByCustomer);
      if (!hasApprovedEstimate) {
        return res.status(400).json({
          error: 'لا يمكن اعتماد أمر الإصلاح ونقله للعمل إلا بعد تسجيل موافقة العميل على عرض السعر (Estimate)!',
        });
      }
    }

    const updated = await prisma.repairOrder.update({
      where: { id: req.params.id },
      data: {
        status,
        notes: notes || currentOrder.notes,
        actualCompletion: status === 'COMPLETED' ? new Date() : currentOrder.actualCompletion,
      },
    });

    await logAudit({
      action: 'UPDATE_STATUS',
      entity: 'RepairOrder',
      entityId: updated.id,
      details: `تحديث حالة أمر الإصلاح ${updated.orderNumber} من ${currentOrder.status} إلى ${status}`,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Save / Update 10-Point Technical Inspection Checklist (Section 6) ---
router.post('/job-cards/:id/inspection', async (req, res) => {
  try {
    const repairOrderId = req.params.id;
    const {
      engineCheck,
      oilsCheck,
      brakesCheck,
      tiresCheck,
      batteryCheck,
      electricalCheck,
      acCheck,
      suspensionCheck,
      coolingCheck,
      computerScanCheck,
      inspectorNotes,
      inspectionResults,
      imagesJson,
    } = req.body;

    const inspection = await prisma.repairInspection.create({
      data: {
        repairOrderId,
        engineCheck: engineCheck || 'GOOD',
        oilsCheck: oilsCheck || 'GOOD',
        brakesCheck: brakesCheck || 'GOOD',
        tiresCheck: tiresCheck || 'GOOD',
        batteryCheck: batteryCheck || 'GOOD',
        electricalCheck: electricalCheck || 'GOOD',
        acCheck: acCheck || 'GOOD',
        suspensionCheck: suspensionCheck || 'GOOD',
        coolingCheck: coolingCheck || 'GOOD',
        computerScanCheck: computerScanCheck || 'GOOD',
        inspectorNotes: inspectorNotes || null,
        inspectionResults: typeof inspectionResults === 'object' ? JSON.stringify(inspectionResults) : inspectionResults,
        imagesJson: typeof imagesJson === 'object' ? JSON.stringify(imagesJson) : imagesJson,
      },
    });

    // Update job card status to PENDING_APPROVAL or PENDING_INSPECTION
    await prisma.repairOrder.update({
      where: { id: repairOrderId },
      data: { status: 'PENDING_APPROVAL' },
    });

    await logAudit({
      action: 'INSPECTION',
      entity: 'RepairOrder',
      entityId: repairOrderId,
      details: 'تسجيل نتائج الفحص الفني الشامل للسيارة',
    });

    res.status(201).json(inspection);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Create Estimate / Quotation (Section 6) ---
router.post('/job-cards/:id/estimate', async (req, res) => {
  try {
    const repairOrderId = req.params.id;
    const { items, discount = 0, customerNotes } = req.body;

    const count = await prisma.repairEstimate.count();
    const estimateNumber = `EST-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    let subtotalParts = 0;
    let subtotalLabor = 0;

    items.forEach((it: any) => {
      const lineTotal = parseFloat(it.unitPrice) * parseInt(it.quantity || 1);
      if (it.type === 'PART') subtotalParts += lineTotal;
      else subtotalLabor += lineTotal;
    });

    const disc = parseFloat(discount) || 0;
    const subtotal = subtotalParts + subtotalLabor;
    const taxable = Math.max(0, subtotal - disc);
    const taxAmount = 0;
    const grandTotal = taxable;

    const estimate = await prisma.repairEstimate.create({
      data: {
        estimateNumber,
        repairOrderId,
        subtotalParts,
        subtotalLabor,
        discount: disc,
        taxAmount,
        grandTotal,
        customerNotes: customerNotes || null,
        status: 'PENDING',
        items: {
          create: items.map((it: any) => ({
            type: it.type || 'PART',
            itemId: it.itemId || null,
            description: it.description,
            quantity: parseInt(it.quantity || 1),
            unitPrice: parseFloat(it.unitPrice || 0),
            total: parseFloat(it.unitPrice || 0) * parseInt(it.quantity || 1),
          })),
        },
      },
      include: { items: true },
    });

    await prisma.repairOrder.update({
      where: { id: repairOrderId },
      data: {
        status: 'PENDING_APPROVAL',
        totalParts: subtotalParts,
        totalLabor: subtotalLabor,
        discount: disc,
        taxAmount,
        grandTotal,
      },
    });

    await logAudit({
      action: 'CREATE_ESTIMATE',
      entity: 'RepairOrder',
      entityId: repairOrderId,
      details: `إنشاء عرض سعر مبدئي رقم ${estimateNumber} بإجمالي ${grandTotal} ج.م`,
    });

    res.status(201).json(estimate);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Record Customer Approval on Estimate (Rule: Unlocks Status to APPROVED / IN_PROGRESS) ---
router.post('/job-cards/:id/estimate/:estimateId/approve', async (req, res) => {
  try {
    if (typeof req.body?.approved !== 'boolean') {
      return res.status(400).json({ error: 'يرجى تحديد الموافقة أو الرفض' });
    }
    const estimate = await prisma.$transaction((tx) => approveRepairEstimate(
      tx,
      req.params.id,
      req.params.estimateId,
      req.body.approved,
      typeof req.body.customerNotes === 'string' ? req.body.customerNotes.slice(0, 1000) : undefined,
    ));

    await logAudit({
      action: req.body.approved ? 'APPROVE_ESTIMATE' : 'REJECT_ESTIMATE',
      entity: 'RepairOrder',
      entityId: req.params.id,
      details: req.body.approved ? 'تسجيل موافقة العميل الرسمية على عرض السعر' : 'تسجيل رفض العميل لعرض السعر',
    });

    res.json(estimate);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Request / Issue Parts to Workshop for Job Card (Section 9: إذن صرف داخلي) ---
router.post('/job-cards/:id/parts/issue', async (req: AuthenticatedRequest, res) => {
  try {
    const repairOrderId = req.params.id;
    const { partId, warehouseId, quantity } = req.body;

    const qty = Number(quantity);
    if (typeof partId !== 'string' || !Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: 'حدد القطعة وكمية صحيحة أكبر من صفر' });
    }

    const part = await prisma.repairPart.findFirst({
      where: {
        id: partId,
        repairOrderId,
        repairOrder: branchWhere(req),
      },
      include: { item: true },
    });

    if (!part) return res.status(404).json({ error: 'طلب القطعة غير موجود في أمر الإصلاح أو خارج فرعك' });
    if (part.issuedQty + qty > part.requestedQty) {
      return res.status(400).json({ error: 'الكمية تتجاوز الكمية المطلوبة غير المصروفة' });
    }

    const requestingUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { allowedWarehouseId: true },
    });
    if (requestingUser?.allowedWarehouseId && warehouseId && warehouseId !== requestingUser.allowedWarehouseId) {
      return res.status(403).json({ error: 'لا يمكنك الصرف من مستودع غير المستودع المحدد لحسابك' });
    }
    const whId = requestingUser?.allowedWarehouseId || warehouseId || part.warehouseId
      || (await prisma.warehouse.findFirst({ where: { code: 'WH-SHOP' } }))?.id;
    if (!whId) return res.status(400).json({ error: 'لم يتم تحديد مستودع للصرف' });

    // Check stock
    const balance = await prisma.stockBalance.findUnique({
      where: {
        itemId_warehouseId: { itemId: part.itemId, warehouseId: whId! },
      },
    });

    if (!balance || balance.quantity - balance.reservedQty < qty) {
      return res.status(400).json({
        error: `رصيد القطعة (${part.item.nameAr}) في المخزن غير كافٍ للصرف! المتاح: ${balance ? balance.quantity - balance.reservedQty : 0}`,
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Deduct stock from workshop warehouse
      const stockUpdate = await tx.stockBalance.updateMany({
        where: {
          id: balance.id,
          quantity: { gte: qty },
          reservedQty: { lte: balance.quantity - qty },
        },
        data: { quantity: { decrement: qty } },
      });
      if (stockUpdate.count !== 1) throw new Error('تغير رصيد المخزون؛ أعد محاولة الصرف');

      // 2. Record StockTransaction
      await tx.stockTransaction.create({
        data: {
          itemId: part.itemId,
          warehouseId: whId!,
          type: 'WORKSHOP_ISSUE',
          quantity: -qty,
          unitCost: part.item.avgCost,
          totalCost: -(qty * part.item.avgCost),
          referenceType: 'RepairOrder',
          referenceId: repairOrderId,
          notes: `صرف داخلي للورشة لأمر إصلاح رقم ${repairOrderId}`,
        },
      });

      // 3. Update RepairPart record
      const partUpdate = await tx.repairPart.updateMany({
        where: {
          id: partId,
          issuedQty: { lte: part.requestedQty - qty },
          usedQty: part.usedQty,
          returnedQty: part.returnedQty,
        },
        data: {
          warehouseId: whId,
          issuedQty: { increment: qty },
          status: 'ISSUED',
          issuedAt: new Date(),
        },
      });
      if (partUpdate.count !== 1) throw new Error('تغيرت كمية القطعة المطلوبة؛ أعد محاولة الصرف');
    });

    await logAudit({
      action: 'ISSUE_PART',
      entity: 'RepairOrder',
      entityId: repairOrderId,
      details: `صرف عدد ${qty} من القطعة ${part.item.nameAr} للورشة`,
    });

    res.json({ success: true, message: 'تم صرف القطعة للورشة وخصمها من المخزون بنجاح' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/job-cards/:id/parts/:partId/use', async (req, res) => {
  try {
    const quantity = Number(req.body?.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'أدخل كمية استخدام صحيحة' });
    const part = await prisma.repairPart.findFirst({
      where: { id: req.params.partId, repairOrderId: req.params.id },
    });
    if (!part) return res.status(404).json({ error: 'طلب القطعة غير موجود في أمر الإصلاح' });
    if (quantity > part.issuedQty - part.usedQty - part.returnedQty) {
      return res.status(400).json({ error: 'الكمية تتجاوز القطع المصروفة والمتاحة للاستخدام' });
    }
    const updated = await prisma.repairPart.updateMany({
      where: {
        id: part.id,
        issuedQty: part.issuedQty,
        returnedQty: part.returnedQty,
        usedQty: { lte: part.issuedQty - part.returnedQty - quantity },
      },
      data: {
        usedQty: { increment: quantity },
        status: part.usedQty + quantity + part.returnedQty >= part.issuedQty ? 'USED' : 'ISSUED',
      },
    });
    if (updated.count !== 1) throw new Error('تعذر تحديث استخدام القطعة');
    await logAudit({
      action: 'USE_PART',
      entity: 'RepairOrder',
      entityId: req.params.id,
      details: `تسجيل استخدام ${quantity} من القطعة في أمر الإصلاح ${req.params.id}`,
    });
    res.json(updated);
  } catch (error: any) {
    console.error('Repair part usage update failed:', error);
    res.status(400).json({ error: error.message || 'تعذر تسجيل استخدام القطعة' });
  }
});

router.post('/job-cards/:id/parts/:partId/return', async (req, res) => {
  try {
    const quantity = Number(req.body?.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'أدخل كمية إرجاع صحيحة' });
    const part = await prisma.repairPart.findFirst({
      where: { id: req.params.partId, repairOrderId: req.params.id },
      include: { item: true },
    });
    if (!part) return res.status(404).json({ error: 'طلب القطعة غير موجود في أمر الإصلاح' });
    const availableToReturn = part.issuedQty - part.usedQty - part.returnedQty;
    if (quantity > availableToReturn) return res.status(400).json({ error: 'يمكن إرجاع القطع المصروفة وغير المستخدمة فقط' });
    const warehouseId = part.warehouseId;
    if (!warehouseId) return res.status(400).json({ error: 'لا يوجد مستودع مسجل لعملية الصرف' });

    await prisma.$transaction(async (tx) => {
      const partUpdate = await tx.repairPart.updateMany({
        where: {
          id: part.id,
          issuedQty: part.issuedQty,
          usedQty: part.usedQty,
          returnedQty: { lte: part.issuedQty - part.usedQty - quantity },
        },
        data: {
          returnedQty: { increment: quantity },
          status: part.usedQty + part.returnedQty + quantity >= part.issuedQty ? 'RETURNED' : 'ISSUED',
        },
      });
      if (partUpdate.count !== 1) throw new Error('تغير رصيد القطع المصروفة؛ أعد محاولة الإرجاع');
      await tx.stockBalance.upsert({
        where: { itemId_warehouseId: { itemId: part.itemId, warehouseId } },
        create: { itemId: part.itemId, warehouseId, quantity },
        update: { quantity: { increment: quantity } },
      });
      await tx.stockTransaction.create({
        data: {
          itemId: part.itemId,
          warehouseId,
          type: 'WORKSHOP_RETURN',
          quantity,
          unitCost: part.costPrice,
          totalCost: quantity * part.costPrice,
          referenceType: 'RepairOrder',
          referenceId: req.params.id,
          notes: `إرجاع ${quantity} قطعة غير مستخدمة من أمر الإصلاح ${req.params.id}`,
        },
      });
    });
    await logAudit({
      action: 'RETURN_PART',
      entity: 'RepairOrder',
      entityId: req.params.id,
      details: `إرجاع ${quantity} من القطعة ${part.item.nameAr} إلى المخزون`,
    });
    res.json({ success: true, returnedQty: part.returnedQty + quantity });
  } catch (error: any) {
    console.error('Repair part return failed:', error);
    res.status(400).json({ error: error.message || 'تعذر إرجاع القطعة إلى المخزون' });
  }
});

router.post('/job-cards/:id/labor/:laborId/timer', async (req, res) => {
  try {
    const action = req.body?.action;
    if (!['START', 'PAUSE', 'COMPLETE'].includes(action)) {
      return res.status(400).json({ error: 'إجراء مؤقت العمل غير صالح' });
    }
    const labor = await prisma.repairLabor.findFirst({
      where: { id: req.params.laborId, repairOrderId: req.params.id },
    });
    if (!labor) return res.status(404).json({ error: 'خدمة العمل غير موجودة في أمر الإصلاح' });
    if (action === 'START' && labor.status === 'COMPLETED') {
      return res.status(409).json({ error: 'تم إنهاء تسجيل وقت هذه الخدمة' });
    }
    if (action === 'START' && labor.timerStartedAt) {
      return res.status(409).json({ error: 'مؤقت هذه الخدمة يعمل بالفعل' });
    }
    if (action !== 'START' && !labor.timerStartedAt) {
      return res.status(409).json({ error: 'لا يوجد مؤقت يعمل لهذه الخدمة' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (action === 'START') {
        const started = await tx.repairLabor.updateMany({
          where: { id: labor.id, timerStartedAt: null, status: { not: 'COMPLETED' } },
          data: { timerStartedAt: new Date(), status: 'IN_PROGRESS' },
        });
        if (started.count !== 1) throw new Error('تغيرت حالة مؤقت العمل؛ أعد المحاولة');
      } else {
        const elapsed = Math.max(0, Math.ceil((Date.now() - labor.timerStartedAt!.getTime()) / 60000));
        const stopped = await tx.repairLabor.updateMany({
          where: { id: labor.id, timerStartedAt: labor.timerStartedAt },
          data: {
            timerStartedAt: null,
            trackedMinutes: { increment: elapsed },
            status: action === 'COMPLETE' ? 'COMPLETED' : 'PENDING',
            completedAt: action === 'COMPLETE' ? new Date() : null,
          },
        });
        if (stopped.count !== 1) throw new Error('تغيرت حالة مؤقت العمل؛ أعد المحاولة');
      }
      return tx.repairLabor.findUniqueOrThrow({ where: { id: labor.id } });
    });
    await logAudit({
      action: `LABOR_TIMER_${action}`,
      entity: 'RepairOrder',
      entityId: req.params.id,
      details: `${action === 'START' ? 'بدء' : action === 'PAUSE' ? 'إيقاف مؤقت' : 'إنهاء'} تسجيل وقت خدمة ${labor.serviceName}`,
    });
    res.json(updated);
  } catch (error: any) {
    console.error('Repair labor timer update failed:', error);
    res.status(error.message?.includes('تغيرت') ? 409 : 400).json({ error: error.message || 'تعذر تحديث مؤقت العمل' });
  }
});

router.post('/job-cards/:id/payments', async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const paymentMethod = req.body?.paymentMethod;
    if (!Number.isFinite(amount) || amount <= 0 || !['CASH', 'CARD'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'أدخل مبلغًا صحيحًا وطريقة دفع نقدية أو بطاقة' });
    }
    const jobCard = await prisma.repairOrder.findUnique({
      where: { id: req.params.id },
      include: { customer: true, salesInvoice: true },
    });
    const invoice = jobCard?.salesInvoice;
    if (!jobCard || !invoice) return res.status(404).json({ error: 'لا توجد فاتورة مسجلة لأمر الإصلاح' });
    if (amount > invoice.remainingAmount) return res.status(400).json({ error: 'مبلغ التحصيل يتجاوز الرصيد المتبقي على الفاتورة' });

    const payment = await prisma.$transaction(async (tx) => {
      const cashbox = paymentMethod === 'CASH' ? await tx.cashbox.findFirst() : null;
      if (paymentMethod === 'CASH' && !cashbox) throw new Error('لا يوجد صندوق نقدية متاح لتسجيل التحصيل');
      const nextRemaining = invoice.remainingAmount - amount;
      const invoiceUpdate = await tx.salesInvoice.updateMany({
        where: { id: invoice.id, remainingAmount: { gte: amount }, status: { notIn: ['CANCELLED', 'RETURNED'] } },
        data: {
          paidAmount: { increment: amount },
          remainingAmount: { decrement: amount },
          status: nextRemaining === 0 ? 'PAID' : 'PARTIALLY_PAID',
          cashPaid: paymentMethod === 'CASH' ? { increment: amount } : undefined,
          cardPaid: paymentMethod === 'CARD' ? { increment: amount } : undefined,
        },
      });
      if (invoiceUpdate.count !== 1) throw new Error('تغير الرصيد المتبقي؛ حدّث الصفحة وحاول مجددًا');
      await tx.customer.update({
        where: { id: invoice.customerId! },
        data: { currentBalance: { decrement: amount } },
      });

      if (cashbox) {
        await tx.cashbox.update({
          where: { id: cashbox.id },
          data: { balance: { increment: amount } },
        });
        await tx.cashTransaction.create({
          data: {
            cashboxId: cashbox.id,
            type: 'RECEIPT',
            amount,
            referenceType: 'SALES',
            referenceId: invoice.id,
            partyType: 'CUSTOMER',
            partyName: jobCard.customer.name,
            customerId: invoice.customerId,
            description: `تحصيل دفعة فاتورة صيانة ${invoice.invoiceNumber}`,
          },
        });
      }
      const createdPayment = await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          amount,
          paymentMethod,
          cashboxId: cashbox?.id,
        },
      });
      await tx.repairOrder.update({
        where: { id: jobCard.id },
        data: {
          paidAmount: { increment: amount },
          remainingAmount: { decrement: amount },
        },
      });
      return createdPayment;
    });

    await logAudit({
      action: 'REPAIR_INVOICE_PAYMENT',
      entity: 'RepairOrder',
      entityId: jobCard.id,
      details: `تحصيل دفعة بقيمة ${amount} ج.م للفاتورة ${invoice.invoiceNumber}`,
    });
    res.status(201).json(payment);
  } catch (error: any) {
    console.error('Repair invoice payment failed:', error);
    res.status(error.message?.includes('تغير') ? 409 : 400).json({ error: error.message || 'تعذر تسجيل الدفعة' });
  }
});

router.post('/job-cards/:id/handover', async (req, res) => {
  try {
    const { customerName, deliveryOdometer, checklist, signatureData, warrantyMonths, warrantyTerms } = req.body || {};
    const odometer = Number(deliveryOdometer);
    const months = Number(warrantyMonths);
    if (typeof customerName !== 'string' || !customerName.trim() || customerName.trim().length > 120) {
      return res.status(400).json({ error: 'اسم مستلم السيارة مطلوب' });
    }
    if (!Number.isInteger(odometer) || !Number.isInteger(months) || months < 0 || months > 36) {
      return res.status(400).json({ error: 'قراءة العداد أو مدة الضمان غير صحيحة' });
    }
    if (!checklist || typeof checklist !== 'object' ||
        ['keysReturned', 'vehicleInspected', 'documentsReturned', 'customerReceived'].some((key) => checklist[key] !== true)) {
      return res.status(400).json({ error: 'أكمل قائمة التحقق من التسليم قبل الإغلاق' });
    }
    if (typeof signatureData !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(signatureData) ||
        signatureData.length > 700_000) {
      return res.status(400).json({ error: 'توقيع العميل مطلوب وصيغته غير صالحة' });
    }
    if (typeof warrantyTerms === 'string' && warrantyTerms.length > 1200) {
      return res.status(400).json({ error: 'شروط الضمان تتجاوز الحد المسموح' });
    }
    const jobCard = await prisma.repairOrder.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, currentOdometer: true, salesInvoice: { select: { id: true } } },
    });
    if (!jobCard) return res.status(404).json({ error: 'أمر الإصلاح غير موجود' });
    if (!jobCard.salesInvoice) return res.status(409).json({ error: 'أصدر فاتورة الصيانة قبل تسجيل التسليم' });
    if (jobCard.status !== 'READY_FOR_DELIVERY') return res.status(409).json({ error: 'أمر الإصلاح ليس بانتظار التسليم' });
    if (odometer < jobCard.currentOdometer) return res.status(400).json({ error: 'قراءة عداد التسليم لا يمكن أن تقل عن قراءة الاستقبال' });

    const updated = await prisma.repairOrder.updateMany({
      where: { id: jobCard.id, status: 'READY_FOR_DELIVERY', deliveredAt: null },
      data: {
        status: 'CLOSED',
        deliveryOdometer: odometer,
        deliveredAt: new Date(),
        handoverCustomerName: customerName.trim(),
        handoverSignatureData: signatureData,
        handoverChecklist: JSON.stringify(checklist),
        warrantyMonths: months,
        warrantyTerms: typeof warrantyTerms === 'string' ? warrantyTerms.trim() || null : null,
      },
    });
    if (updated.count !== 1) return res.status(409).json({ error: 'تم تسجيل التسليم بالفعل أو تغيرت حالة الأمر' });
    await logAudit({
      action: 'REPAIR_HANDOVER',
      entity: 'RepairOrder',
      entityId: jobCard.id,
      details: `تسليم السيارة إلى ${customerName.trim()} وإغلاق أمر الإصلاح`,
    });
    res.json({ success: true, deliveredAt: new Date(), status: 'CLOSED' });
  } catch (error: any) {
    console.error('Repair handover failed:', error);
    res.status(500).json({ error: 'تعذر حفظ محضر التسليم' });
  }
});

// --- Final Maintenance Invoice Creation (Section 7: فاتورة الصيانة النهائية) ---
router.post('/job-cards/:id/invoice', async (req, res) => {
  try {
    const repairOrderId = req.params.id;
    const { paymentMethod = 'CASH' } = req.body;

    const jobCard = await prisma.repairOrder.findUnique({
      where: { id: repairOrderId },
      include: {
        customer: true,
        vehicle: true,
        parts: { include: { item: true } },
        labors: { include: { technician: true } },
      },
    });

    if (!jobCard) return res.status(404).json({ error: 'أمر الإصلاح غير موجود' });
    if (jobCard.status !== 'READY_FOR_DELIVERY') return res.status(409).json({ error: 'يجب إكمال الإصلاح أولاً قبل إصدار الفاتورة النهائية' });
    if (await prisma.salesInvoice.findUnique({ where: { repairOrderId }, select: { id: true } })) {
      return res.status(409).json({ error: 'صدرت فاتورة لهذا الأمر بالفعل' });
    }

    const partsTotal = jobCard.parts.reduce((sum, part) => sum + part.unitPrice * part.usedQty, 0);
    const laborTotal = jobCard.labors.reduce((sum, l) => sum + l.total, 0);
    const disc = req.body.discount === undefined ? jobCard.discount : Number(req.body.discount);
    if (!Number.isFinite(disc) || disc < 0 || disc > partsTotal + laborTotal) {
      return res.status(400).json({ error: 'قيمة الخصم غير صحيحة' });
    }
    const subtotal = partsTotal + laborTotal;
    const taxable = subtotal - disc;
    const company = await prisma.companySetting.findFirst({ select: { taxRate: true } });
    const taxRate = company?.taxRate ?? 0;
    const taxAmount = (taxable * taxRate) / 100;
    const grandTotal = taxable + taxAmount;

    if (!['CASH', 'CARD', 'SPLIT', 'CREDIT'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'طريقة الدفع غير صالحة' });
    }
    const submittedCash = Number(req.body.cashPaid ?? 0);
    const submittedCard = Number(req.body.cardPaid ?? 0);
    if (![submittedCash, submittedCard].every((value) => Number.isFinite(value) && value >= 0)) {
      return res.status(400).json({ error: 'مبالغ الدفع غير صحيحة' });
    }
    const cash = paymentMethod === 'CASH' ? grandTotal : paymentMethod === 'SPLIT' ? submittedCash : 0;
    const card = paymentMethod === 'CARD' ? grandTotal : paymentMethod === 'SPLIT' ? submittedCard : 0;
    const paid = cash + card;
    if (paid > grandTotal) return res.status(400).json({ error: 'إجمالي الدفعة يتجاوز قيمة الفاتورة' });

    const remainingAmount = grandTotal - paid;

    const invoice = await withInvoiceTransaction(prisma, async (tx) => {
      const activeOrder = await tx.repairOrder.findFirst({
        where: { id: repairOrderId, status: 'READY_FOR_DELIVERY', salesInvoice: { is: null } },
        select: { id: true },
      });
      if (!activeOrder) throw new Error('تغيرت حالة أمر الإصلاح أو صدرت فاتورته بالفعل');
      const cashbox = cash > 0 ? await tx.cashbox.findFirst() : null;
      if (cash > 0 && !cashbox) throw new Error('لا يوجد صندوق نقدية متاح لتسجيل التحصيل');
      const invoiceNumber = await nextInvoiceNumber(tx, 'MINV');
      // 1. Create Final Sales Invoice
      const inv = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          customerId: jobCard.customerId,
          vehicleId: jobCard.vehicleId,
          repairOrderId: jobCard.id,
          branchId: jobCard.branchId,
          invoiceType: 'MAINTENANCE',
          subtotal,
          discount: disc,
          taxAmount,
          grandTotal,
          paidAmount: paid,
          remainingAmount,
          paymentMethod,
          cashPaid: cash,
          cardPaid: card,
          status: remainingAmount === 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'POSTED',
          notes: `فاتورة صيانة شاملة لأمر الإصلاح رقم ${jobCard.orderNumber}`,
          items: {
            create: [
              ...jobCard.parts.filter((part) => part.usedQty > 0).map((p) => ({
                itemId: p.itemId,
                description: p.item.nameAr,
                quantity: p.usedQty,
                unitPrice: p.unitPrice,
                costPrice: p.costPrice,
                discount: 0,
                taxRate,
                taxAmount: (p.unitPrice * p.usedQty * taxRate) / 100,
                total: p.unitPrice * p.usedQty * (1 + taxRate / 100),
                itemType: 'PART',
              })),
              ...jobCard.labors.map((l) => ({
                description: l.serviceName,
                quantity: 1,
                unitPrice: l.total,
                costPrice: 0,
                discount: 0,
                taxRate,
                taxAmount: (l.total * taxRate) / 100,
                total: l.total * (1 + taxRate / 100),
                itemType: 'LABOR',
                technicianId: l.technicianId,
              })),
            ],
          },
        },
        include: { items: true, customer: true, vehicle: true },
      });

      if (cash > 0 && cashbox) {
        await tx.cashbox.update({
          where: { id: cashbox.id },
          data: { balance: { increment: cash } },
        });
        await tx.cashTransaction.create({
          data: {
            cashboxId: cashbox.id,
            type: 'RECEIPT',
            amount: cash,
            referenceType: 'SALES',
            referenceId: inv.id,
            partyType: 'CUSTOMER',
            partyName: jobCard.customer.name,
            customerId: jobCard.customerId,
            description: `تحصيل فاتورة صيانة أمر إصلاح ${jobCard.orderNumber}`,
          },
        });
      }
      if (cash > 0) {
        await tx.invoicePayment.create({
          data: { invoiceId: inv.id, amount: cash, paymentMethod: 'CASH', cashboxId: cashbox!.id },
        });
      }
      if (card > 0) {
        await tx.invoicePayment.create({
          data: { invoiceId: inv.id, amount: card, paymentMethod: 'CARD' },
        });
      }

      // Invoice creation leaves the order open until a signed handover is recorded.
      const updatedOrder = await tx.repairOrder.updateMany({
        where: { id: jobCard.id, status: 'READY_FOR_DELIVERY' },
        data: {
          status: 'READY_FOR_DELIVERY',
          totalParts: partsTotal,
          totalLabor: laborTotal,
          discount: disc,
          taxAmount,
          grandTotal,
          paidAmount: paid,
          remainingAmount,
          actualCompletion: jobCard.actualCompletion || new Date(),
        },
      });
      if (updatedOrder.count !== 1) throw new Error('تغيرت حالة أمر الإصلاح؛ أعد المحاولة');

      // 3. Record technician commissions
      for (const l of jobCard.labors) {
        if (l.technicianId && l.commissionAmount > 0) {
          await tx.commission.create({
            data: {
              employeeId: l.technicianId,
              repairOrderId: jobCard.id,
              amount: l.commissionAmount,
              rate: l.commissionRate,
              calculatedOn: l.total,
              status: 'PENDING',
              notes: `عمولة خدمة ${l.serviceName} لأمر إصلاح ${jobCard.orderNumber}`,
            },
          });
        }
      }

      // 4. Update customer balance if remaining amount exists
      if (remainingAmount > 0) {
        await tx.customer.update({
          where: { id: jobCard.customerId },
          data: { currentBalance: { increment: remainingAmount } },
        });
      }

      const discountRatio = subtotal > 0 ? taxable / subtotal : 0;
      const partsCost = jobCard.parts.reduce(
        (sum, part) => sum + part.costPrice * part.usedQty,
        0,
      );
      const accountingLines = [
        ...(cash > 0 ? [{ accountCode: '1000', debit: cash, label: 'تحصيل نقدي' }] : []),
        ...(card > 0 ? [{ accountCode: '1010', debit: card, label: 'تحصيل بالبطاقة' }] : []),
        ...(remainingAmount > 0 ? [{
          accountCode: '1100',
          debit: remainingAmount,
          label: 'ذمم العميل',
          partnerType: 'CUSTOMER',
          partnerId: jobCard.customerId,
        }] : []),
        ...(partsTotal * discountRatio > 0 ? [{ accountCode: '4000', credit: partsTotal * discountRatio, label: 'إيرادات قطع الغيار' }] : []),
        ...(laborTotal * discountRatio > 0 ? [{ accountCode: '4100', credit: laborTotal * discountRatio, label: 'إيرادات خدمات الصيانة' }] : []),
        ...(taxAmount > 0 ? [{ accountCode: '2100', credit: taxAmount, label: 'ضريبة قيمة مضافة - مخرجات' }] : []),
        ...(partsCost > 0 ? [
          { accountCode: '5000', debit: partsCost, label: 'تكلفة قطع الغيار المستخدمة' },
          { accountCode: '1200', credit: partsCost, label: 'تخفيض مخزون قطع الغيار' },
        ] : []),
      ];
      await postJournalEntry(tx, {
        journalCode: 'SAL',
        memo: `فاتورة صيانة ${invoice.invoiceNumber}`,
        referenceType: 'SalesInvoice',
        referenceId: inv.id,
        branchId: jobCard.branchId || null,
        lines: accountingLines,
      });
      return inv;
    });

    await logAudit({
      action: 'INVOICE_JOB_CARD',
      entity: 'RepairOrder',
      entityId: jobCard.id,
      details: `إصدار فاتورة الصيانة النهائية ${invoice.invoiceNumber} لأمر الإصلاح ${jobCard.orderNumber} بانتظار محضر التسليم`,
    });

    res.status(201).json(invoice);
  } catch (err: any) {
    console.error('Job Card Invoicing error:', err);
    res.status(400).json({ error: err.message });
  }
});

export default router;
