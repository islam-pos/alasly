import crypto from 'crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

const nextSequence = async (key: string, prefix: string) => {
  const sequence = await prisma.numberSequence.upsert({
    where: { key },
    update: { lastValue: { increment: 1 } },
    create: { key, lastValue: 1 },
  });
  return `${prefix}-${String(sequence.lastValue).padStart(5, '0')}`;
};

router.get('/appointments', async (req, res) => {
  try {
    const { from, to, status } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (from || to) {
      where.startsAt = {};
      if (from) where.startsAt.gte = new Date(String(from));
      if (to) where.startsAt.lte = new Date(String(to));
    }
    const appointments = await prisma.appointment.findMany({
      where,
      include: { customer: true, vehicle: true, branch: true },
      orderBy: { startsAt: 'asc' },
    });
    res.json(appointments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/appointments', async (req, res) => {
  try {
    const { customerId, vehicleId, branchId, startsAt, endsAt, serviceName, notes } = req.body;
    if (!customerId || !vehicleId || !startsAt || !endsAt || !String(serviceName || '').trim()) {
      return res.status(400).json({ error: 'بيانات الموعد ناقصة' });
    }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!(start < end)) return res.status(400).json({ error: 'وقت الموعد غير صحيح' });
    const conflict = await prisma.appointment.findFirst({
      where: {
        branchId: branchId || undefined,
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
        AND: [{ startsAt: { lt: end } }, { endsAt: { gt: start } }],
      },
    });
    if (conflict) return res.status(409).json({ error: 'يوجد موعد متعارض في نفس الفترة' });
    const appointment = await prisma.appointment.create({
      data: {
        appointmentNumber: await nextSequence('appointment', 'APT'),
        customerId,
        vehicleId,
        branchId: branchId || null,
        startsAt: start,
        endsAt: end,
        serviceName: String(serviceName).trim(),
        notes: notes ? String(notes).trim() : null,
      },
      include: { customer: true, vehicle: true, branch: true },
    });
    res.status(201).json(appointment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/appointments/:id', async (req, res) => {
  try {
    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        status: req.body.status,
        notes: req.body.notes,
        reminderSentAt: req.body.reminderSentAt ? new Date(req.body.reminderSentAt) : undefined,
      },
      include: { customer: true, vehicle: true, branch: true },
    });
    res.json(appointment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/appointments/:id/create-repair', async (req, res) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { customer: true, vehicle: true },
    });
    if (!appointment) return res.status(404).json({ error: 'الموعد غير موجود' });
    if (appointment.repairOrderId) return res.json({ repairOrderId: appointment.repairOrderId });
    const repair = await prisma.repairOrder.create({
      data: {
        orderNumber: await nextSequence('repair_order', 'RO'),
        customerId: appointment.customerId,
        vehicleId: appointment.vehicleId,
        branchId: appointment.branchId,
        currentOdometer: appointment.vehicle.currentOdometer,
        customerComplaint: appointment.serviceName,
        intakeNotes: appointment.notes || 'تم تحويله من موعد مجدول',
        status: 'NEW',
      },
    });
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { repairOrderId: repair.id, status: 'COMPLETED' },
    });
    res.status(201).json(repair);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/leads', async (_req, res) => {
  res.json(await prisma.lead.findMany({ orderBy: [{ nextFollowUp: 'asc' }, { createdAt: 'desc' }] }));
});

router.post('/leads', async (req, res) => {
  const lead = await prisma.lead.create({
    data: {
      name: String(req.body.name || '').trim(),
      phone: String(req.body.phone || '').trim(),
      source: req.body.source || 'MANUAL',
      status: req.body.status || 'NEW',
      interest: req.body.interest ? String(req.body.interest).trim() : null,
      notes: req.body.notes ? String(req.body.notes).trim() : null,
      nextFollowUp: req.body.nextFollowUp ? new Date(req.body.nextFollowUp) : null,
    },
  });
  res.status(201).json(lead);
});

router.patch('/leads/:id', async (req, res) => {
  const lead = await prisma.lead.update({
    where: { id: req.params.id },
    data: {
      status: req.body.status,
      notes: req.body.notes,
      interest: req.body.interest,
      nextFollowUp: req.body.nextFollowUp ? new Date(req.body.nextFollowUp) : null,
    },
  });
  res.json(lead);
});

router.get('/campaigns', async (_req, res) => {
  res.json(await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } }));
});

router.post('/campaigns', async (req, res) => {
  const campaign = await prisma.campaign.create({
    data: {
      name: String(req.body.name || '').trim(),
      channel: req.body.channel || 'WHATSAPP',
      segment: req.body.segment || 'ALL',
      message: String(req.body.message || '').trim(),
      status: req.body.status || 'DRAFT',
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
    },
  });
  res.status(201).json(campaign);
});

router.post('/campaigns/:id/send', async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'الحملة غير موجودة' });
  const customers = await prisma.customer.findMany({
    where: campaign.segment === 'ALL'
      ? { active: true }
      : campaign.segment === 'WHATSAPP'
        ? { active: true, whatsappOptIn: true }
        : { active: true },
  });
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'QUEUED', sentCount: customers.length },
  });
  res.json({
    queued: customers.length,
    message: 'تمت جدولة الحملة؛ تستخدم منصة WhatsApp رسائل واتساب المعتمدة الخاصة بالنظام.',
  });
});

router.get('/assets', async (_req, res) => {
  res.json(await prisma.fixedAsset.findMany({ orderBy: { purchaseDate: 'desc' } }));
});

router.post('/assets', async (req, res) => {
  const asset = await prisma.fixedAsset.create({
    data: {
      assetCode: String(req.body.assetCode || '').trim(),
      name: String(req.body.name || '').trim(),
      category: String(req.body.category || '').trim(),
      purchaseDate: new Date(req.body.purchaseDate),
      purchaseCost: Number(req.body.purchaseCost),
      salvageValue: Number(req.body.salvageValue || 0),
      usefulLifeMonths: Number(req.body.usefulLifeMonths),
      location: req.body.location ? String(req.body.location).trim() : null,
      serialNumber: req.body.serialNumber ? String(req.body.serialNumber).trim() : null,
      status: req.body.status || 'ACTIVE',
      notes: req.body.notes ? String(req.body.notes).trim() : null,
    },
  });
  res.status(201).json(asset);
});

router.patch('/assets/:id', async (req, res) => {
  const asset = await prisma.fixedAsset.update({
    where: { id: req.params.id },
    data: {
      location: req.body.location,
      status: req.body.status,
      notes: req.body.notes,
    },
  });
  res.json(asset);
});

router.post('/assets/depreciate', async (req, res) => {
  const assets = await prisma.fixedAsset.findMany({ where: { status: 'ACTIVE' } });
  let processed = 0;
  for (const asset of assets) {
    const depreciable = Math.max(0, asset.purchaseCost - asset.salvageValue);
    if (!depreciable || !asset.usefulLifeMonths) continue;
    const monthly = depreciable / asset.usefulLifeMonths;
    if (asset.accumulatedDepreciation + monthly > depreciable) continue;
    await prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        accumulatedDepreciation: asset.accumulatedDepreciation + monthly,
        lastDepreciationAt: new Date(),
      },
    });
    processed += 1;
  }
  res.json({ processed });
});

router.get('/tax', async (_req, res) => {
  const setting = await prisma.taxSetting.findUnique({ where: { id: 1 } });
  res.json({
    enabled: setting?.enabled || false,
    provider: setting?.provider || 'ETA',
    environment: setting?.environment || 'SANDBOX',
    taxpayerRin: setting?.taxpayerRin || null,
    activityCode: setting?.activityCode || null,
    branchId: setting?.branchId || null,
    configured: Boolean(setting?.clientId && setting?.clientSecret),
  });
});

router.put('/tax', async (req, res) => {
  const setting = await prisma.taxSetting.upsert({
    where: { id: 1 },
    update: {
      enabled: Boolean(req.body.enabled),
      provider: 'ETA',
      environment: req.body.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX',
      taxpayerRin: req.body.taxpayerRin || null,
      activityCode: req.body.activityCode || null,
      branchId: req.body.branchId || null,
    },
    create: {
      enabled: Boolean(req.body.enabled),
      provider: 'ETA',
      environment: req.body.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX',
      taxpayerRin: req.body.taxpayerRin || null,
      activityCode: req.body.activityCode || null,
      branchId: req.body.branchId || null,
    },
  });
  res.json({ enabled: setting.enabled, environment: setting.environment });
});

router.post('/tax/submit/:documentType/:documentId', async (req, res) => {
  const setting = await prisma.taxSetting.findUnique({ where: { id: 1 } });
  if (!setting?.enabled) return res.status(409).json({ error: 'تكامل ETA اختياري وغير مفعل حاليًا' });
  if (!setting.clientId || !setting.clientSecret) {
    return res.status(422).json({ error: 'بيانات اعتماد ETA غير مكتملة' });
  }
  return res.status(501).json({
    error: 'تم تفعيل الوحدة لكن اعتماد الهيئة لم يُسجل بعد؛ لا يتم إرسال المستند للهيئة.',
  });
});

router.post('/portal-links', async (req, res) => {
  const customerId = String(req.body.customerId || '');
  if (!customerId) return res.status(400).json({ error: 'العميل مطلوب' });
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.customerPortalLink.create({ data: { customerId, tokenHash, expiresAt } });
  res.status(201).json({ token, expiresAt, url: `/customer-portal/${token}` });
});

export default router;
