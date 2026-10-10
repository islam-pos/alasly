import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { PERMISSIONS } from '../lib/permissions';
import { AuthenticatedRequest } from '../middleware/auth';
import { getIntegrationStatus, saveIntegrationSettings, testIntegration, type NotificationChannel } from '../services/notifications';
import { disconnectWhatsappQr, getWhatsappQrStatus, startWhatsappQrPairing } from '../services/whatsappQr';
import {
  disconnectTelegramQr,
  getTelegramQrStatus,
  startTelegramQrPairing,
  submitTelegramQrPassword,
} from '../services/telegramQr';

const router = Router();

const requireAdmin = async (req: AuthenticatedRequest, res: import('express').Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً' });
    return false;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { active: true, role: { select: { name: true } } },
    });
    if (user?.active && user.role.name === 'admin') return true;
    res.status(403).json({ error: 'إدارة ربط التنبيهات متاحة لمدير النظام فقط' });
    return false;
  } catch (error) {
    console.error('Failed to authorize notification settings access:', error);
    res.status(500).json({ error: 'تعذر التحقق من صلاحية إدارة التنبيهات' });
    return false;
  }
};

router.get('/integrations', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json(await getIntegrationStatus());
  } catch (error) {
    console.error('Failed to load notification integrations:', error);
    res.status(500).json({ error: 'تعذر تحميل إعدادات التنبيهات' });
  }
});

router.put('/integrations', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json(await saveIntegrationSettings(req.body || {}));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر حفظ إعدادات التنبيهات';
    res.status(400).json({ error: message });
  }
});

router.get('/integrations/whatsapp/qr', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json(await getWhatsappQrStatus());
  } catch (error) {
    console.error('Failed to load WhatsApp QR status:', error);
    res.status(500).json({ error: 'تعذر تحميل حالة ربط WhatsApp' });
  }
});

router.post('/integrations/whatsapp/connect', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json(await startWhatsappQrPairing());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر بدء ربط WhatsApp';
    res.status(400).json({ error: message });
  }
});

router.delete('/integrations/whatsapp/connect', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json(await disconnectWhatsappQr());
  } catch (error) {
    console.error('Failed to disconnect WhatsApp QR session:', error);
    res.status(500).json({ error: 'تعذر فصل حساب WhatsApp' });
  }
});

router.get('/integrations/telegram/qr', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json(await getTelegramQrStatus());
  } catch (error) {
    console.error('Failed to load Telegram QR status:', error);
    res.status(500).json({ error: 'تعذر تحميل حالة ربط Telegram' });
  }
});

router.post('/integrations/telegram/connect', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json(await startTelegramQrPairing());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر بدء ربط Telegram';
    res.status(400).json({ error: message });
  }
});

router.post('/integrations/telegram/password', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json(await submitTelegramQrPassword(String(req.body?.password || '')));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر التحقق من كلمة مرور Telegram';
    res.status(400).json({ error: message });
  }
});

router.delete('/integrations/telegram/connect', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json(await disconnectTelegramQr());
  } catch (error) {
    console.error('Failed to disconnect Telegram QR session:', error);
    res.status(500).json({ error: 'تعذر فصل حساب Telegram' });
  }
});

router.post('/integrations/test/:channel', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  const channel = req.params.channel;
  if (channel !== 'whatsapp' && channel !== 'telegram') {
    res.status(400).json({ error: 'قناة التنبيه غير معروفة' });
    return;
  }
  try {
    res.json(await testIntegration(channel as NotificationChannel, req.body || {}));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'فشل اختبار الاتصال';
    res.status(502).json({ error: message });
  }
});

router.get('/audit-logs', async (req, res) => {
  try {
    const { action, entity, limit = 50 } = req.query;
    let whereClause: any = {};
    if (action) whereClause.action = String(action);
    if (entity) whereClause.entity = String(entity);

    const logs = await prisma.auditLog.findMany({
      where: whereClause,
      include: { user: { select: { username: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(String(limit)),
    });

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/permissions', (req, res) => {
  res.json(PERMISSIONS);
});

export default router;
