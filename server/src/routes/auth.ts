import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate, generateToken, AuthenticatedRequest } from '../middleware/auth';
import { logAudit } from '../middleware/audit';

const router = Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        role: true,
        branch: true,
        employee: true,
      },
    });

    if (!user || !user.active) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة أو الحساب معطل' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role.name,
      branchId: user.branchId || undefined,
    });

    await logAudit({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      details: `تسجيل دخول ناجح للمستخدم ${user.fullName}`,
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role.name,
        roleNameAr: user.role.nameAr,
        permissions: JSON.parse(user.role.permissions || '[]'),
        branch: user.branch,
        employee: user.employee,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'حدث خطأ في الخادم أثناء تسجيل الدخول' });
  }
});

// Current user
router.get('/me', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { role: true, branch: true, employee: true },
    });

    if (!user || !user.active) return res.status(401).json({ error: 'المستخدم غير موجود أو الحساب معطل' });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role.name,
        roleNameAr: user.role.nameAr,
        permissions: JSON.parse(user.role.permissions || '[]'),
        branch: user.branch,
        employee: user.employee,
      },
    });
  } catch (err) {
    res.status(401).json({ error: 'الجلسة غير صالحة' });
  }
});

// Users list
router.get('/users', authenticate, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'غير مصرح لك بعرض المستخدمين' });
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        active: true,
        role: { select: { name: true, nameAr: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/users/:id/password', authenticate, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'غير مصرح لك بتغيير كلمات المرور' });
  }

  const { password } = req.body;
  const passwordBytes = typeof password === 'string' ? Buffer.byteLength(password) : 0;
  if (passwordBytes < 16 || passwordBytes > 72) {
    return res.status(400).json({ error: 'يجب أن تكون كلمة المرور بين 16 و72 بايت' });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });
    await logAudit({
      userId: req.user.id,
      action: 'PASSWORD_RESET',
      entity: 'User',
      entityId: target.id,
      ipAddress: req.ip,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to reset user password:', error);
    res.status(500).json({ error: 'تعذر تغيير كلمة المرور' });
  }
});

export default router;
