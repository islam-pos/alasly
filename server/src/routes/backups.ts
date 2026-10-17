import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logAudit } from '../middleware/audit';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  createManualBackup,
  ensureLocalBackup,
  isRestorePending,
  listBackups,
  queueBackupRestore,
} from '../services/backups';
import { getOffsiteStatus, verifyOffsiteBackupConfiguration } from '../services/offsiteBackups';

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
    res.status(403).json({ error: 'إدارة النسخ الاحتياطي متاحة لمدير النظام فقط' });
    return false;
  } catch (error) {
    console.error('Failed to authorize backup management:', error);
    res.status(500).json({ error: 'تعذر التحقق من صلاحية إدارة النسخ الاحتياطي' });
    return false;
  }
};

router.get('/', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json({
      backups: await listBackups(),
      restorePending: await isRestorePending(),
      offsite: await getOffsiteStatus(),
    });
  } catch (error) {
    console.error('Failed to list backups:', error);
    res.status(500).json({ error: 'تعذر تحميل النسخ الاحتياطية' });
  }
});

router.post('/', async (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  if (!await requireAdmin(authenticatedReq, res)) return;
  try {
    const backup = await createManualBackup();
    await logAudit({
      userId: authenticatedReq.user?.id,
      action: 'CREATE_BACKUP',
      entity: 'Backup',
      entityId: backup.id,
      details: `إنشاء نسخة احتياطية يدوية؛ الحجم ${backup.sizeBytes} بايت`,
      ipAddress: req.ip,
    });
    res.status(201).json({ backup });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر إنشاء النسخة الاحتياطية';
    res.status(message.includes('الحد اليومي') || message.includes('أخرى قيد التنفيذ') ? 429 : 500)
      .json({ error: message });
  }
});

router.post('/offsite/test', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    res.json({ status: await verifyOffsiteBackupConfiguration() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر الاتصال بمخزن R2';
    res.status(502).json({ error: message });
  }
});

router.get('/:id/download', async (req, res) => {
  if (!await requireAdmin(req as AuthenticatedRequest, res)) return;
  try {
    const archivePath = await ensureLocalBackup(req.params.id);
    res.download(archivePath, req.params.id, (error) => {
      if (error) console.error('Backup download failed:', error);
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'النسخة الاحتياطية غير موجودة' });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'تعذر تنزيل النسخة الاحتياطية' });
  }
});

router.post('/:id/restore', async (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  if (!await requireAdmin(authenticatedReq, res)) return;
  if (req.body?.confirmation !== 'RESTORE') {
    res.status(400).json({ error: 'أكد الاستعادة بإرسال confirmation: RESTORE' });
    return;
  }
  try {
    await ensureLocalBackup(req.params.id);
    await queueBackupRestore(req.params.id, authenticatedReq.user!.id);
    await logAudit({
      userId: authenticatedReq.user?.id,
      action: 'REQUEST_BACKUP_RESTORE',
      entity: 'Backup',
      entityId: req.params.id,
      details: 'تم طلب استعادة نسخة احتياطية؛ يلزم إعادة تشغيل الخدمة لتطبيقها',
      ipAddress: req.ip,
    });
    res.status(202).json({
      restorePending: true,
      message: 'تم تجهيز طلب الاستعادة. أعد تشغيل خدمة Railway لتطبيقه؛ ستدخل واجهات النظام وضع الصيانة حتى اكتمال الاستعادة.',
    });
  } catch (error) {
    console.error('Failed to queue backup restore:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'تعذر تجهيز الاستعادة' });
  }
});

export default router;
