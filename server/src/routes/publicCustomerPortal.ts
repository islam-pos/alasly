import crypto from 'crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/:token', async (req, res) => {
  const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const link = await prisma.customerPortalLink.findUnique({
    where: { tokenHash },
    include: { customer: true },
  });
  if (!link || link.expiresAt <= new Date()) {
    return res.status(404).json({ error: 'رابط البوابة غير صالح أو منتهي' });
  }
  await prisma.customerPortalLink.update({
    where: { id: link.id },
    data: { lastUsedAt: new Date() },
  });
  const [vehicles, appointments, repairOrders, invoices] = await Promise.all([
    prisma.vehicle.findMany({ where: { customerId: link.customerId }, orderBy: { updatedAt: 'desc' } }),
    prisma.appointment.findMany({ where: { customerId: link.customerId }, include: { vehicle: true }, orderBy: { startsAt: 'desc' }, take: 30 }),
    prisma.repairOrder.findMany({ where: { customerId: link.customerId }, include: { vehicle: true, salesInvoice: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.salesInvoice.findMany({ where: { customerId: link.customerId }, include: { items: true }, orderBy: { date: 'desc' }, take: 50 }),
  ]);
  res.json({
    customer: { name: link.customer.name, phone: link.customer.phone, email: link.customer.email },
    vehicles,
    appointments,
    repairOrders,
    invoices,
  });
});

export default router;
