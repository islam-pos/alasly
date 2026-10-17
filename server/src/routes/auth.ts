import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate, generateToken, AuthenticatedRequest } from '../middleware/auth';
import { logAudit } from '../middleware/audit';
import { availablePermissions } from '../services/permissions';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  verifyMfaCode,
} from '../services/mfa';

const router = Router();
const permissionKeys = new Set<string>(availablePermissions.map(({ key }) => key));

const getEffectivePermissions = (rolePermissions: string, permissionOverrides: string | null) => {
  const permissions = permissionOverrides ?? rolePermissions;
  const parsed: unknown = JSON.parse(permissions || '[]');
  if (!Array.isArray(parsed) || parsed.some((permission) => typeof permission !== 'string')) {
    throw new Error('قائمة الصلاحيات غير صالحة');
  }
  return parsed as string[];
};

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
    res.status(403).json({ error: 'هذه العملية متاحة لمدير النظام فقط' });
    return false;
  } catch (error) {
    console.error('Failed to authorize user management access:', error);
    res.status(500).json({ error: 'تعذر التحقق من صلاحية مدير النظام' });
    return false;
  }
};

const validPermissionOverrides = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((permission) => typeof permission === 'string' && permissionKeys.has(permission));

const registerFailedLogin = async (userId: string) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
  });
  if (user.failedLoginAttempts < 5) return;
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      loginLockedUntil: new Date(Date.now() + 15 * 60 * 1000),
    },
  });
};

const loginResponse = (user: any) => ({
  token: generateToken({
    id: user.id,
    username: user.username,
    role: user.role.name,
    branchId: user.branchId || undefined,
  }),
  user: {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role.name,
    roleNameAr: user.role.nameAr,
    permissions: getEffectivePermissions(user.role.permissions, user.permissionOverrides),
    allowedWarehouseId: user.allowedWarehouseId,
    branch: user.branch,
    employee: user.employee,
  },
});

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

    if (user.loginLockedUntil && user.loginLockedUntil.getTime() > Date.now()) {
      return res.status(429).json({
        error: `تم إيقاف تسجيل الدخول مؤقتاً بسبب محاولات فاشلة؛ حاول بعد ${Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 60_000)} دقيقة`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await registerFailedLogin(user.id);
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    if (user.role.name === 'admin' && user.mfaEnabled) {
      if (typeof req.body?.mfaCode !== 'string') return res.json({ mfaRequired: true });
      if (!user.mfaSecret || !verifyMfaCode(decryptMfaSecret(user.mfaSecret), req.body.mfaCode)) {
        await registerFailedLogin(user.id);
        return res.status(401).json({ mfaRequired: true, error: 'رمز المصادقة الثنائية غير صحيح' });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, loginLockedUntil: null },
    });

    await logAudit({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      details: `تسجيل دخول ناجح للمستخدم ${user.fullName}`,
      ipAddress: req.ip,
    });

    res.json(loginResponse(user));
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'حدث خطأ في الخادم أثناء تسجيل الدخول' });
  }
});

router.get('/permissions/review', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const review = await prisma.auditLog.findFirst({
      where: { entity: 'PermissionReview', action: 'PERMISSIONS_REVIEW' },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        user: { select: { id: true, fullName: true } },
      },
    });
    res.json({ reviewedAt: review?.createdAt || null, reviewer: review?.user || null });
  } catch (error) {
    console.error('Failed to load permission review status:', error);
    res.status(500).json({ error: 'تعذر تحميل حالة مراجعة الصلاحيات' });
  }
});

router.post('/permissions/review', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const [activeUsers, reviewer] = await Promise.all([
      prisma.user.count({ where: { active: true } }),
      prisma.user.findUnique({ where: { id: req.user!.id }, select: { fullName: true } }),
    ]);
    if (!reviewer) return res.status(404).json({ error: 'المستخدم المراجع غير موجود' });
    await logAudit({
      userId: req.user!.id,
      action: 'PERMISSIONS_REVIEW',
      entity: 'PermissionReview',
      details: `مراجعة صلاحيات الأدوار والمستخدمين النشطين (${activeUsers} حساباً)`,
      ipAddress: req.ip,
    });
    res.status(201).json({
      reviewedAt: new Date(),
      reviewer: { id: req.user!.id, fullName: reviewer.fullName },
      activeUsers,
    });
  } catch (error) {
    console.error('Failed to record permission review:', error);
    res.status(500).json({ error: 'تعذر تسجيل مراجعة الصلاحيات' });
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
        permissions: getEffectivePermissions(user.role.permissions, user.permissionOverrides),
        allowedWarehouseId: user.allowedWarehouseId,
        branch: user.branch,
        employee: user.employee,
      },
    });
  } catch (err) {
    console.error('Failed to load current user:', err);
    res.status(500).json({ error: 'تعذر تحميل بيانات المستخدم' });
  }
});

// Users list
router.get('/users', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!await requireAdmin(req, res)) return;

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        active: true,
        permissionOverrides: true,
        employee: { select: { id: true, name: true } },
        role: { select: { id: true, name: true, nameAr: true, permissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users.map((user) => ({
      ...user,
      permissions: getEffectivePermissions(user.role.permissions, user.permissionOverrides),
    })));
  } catch (err: any) {
    console.error('Failed to list users:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!await requireAdmin(req, res)) return;

  const { username, fullName, password, roleId, email, phone, employeeId, active, permissionOverrides } = req.body || {};
  if (
    typeof username !== 'string' || !username.trim() ||
    typeof fullName !== 'string' || !fullName.trim() ||
    typeof roleId !== 'string' || !roleId ||
    typeof password !== 'string' ||
    (username.trim().length > 64 || fullName.trim().length > 120) ||
    (email !== undefined && email !== null && typeof email !== 'string') ||
    (phone !== undefined && phone !== null && typeof phone !== 'string') ||
    (employeeId !== undefined && employeeId !== null && typeof employeeId !== 'string') ||
    (active !== undefined && typeof active !== 'boolean') ||
    (permissionOverrides !== undefined && permissionOverrides !== null && !validPermissionOverrides(permissionOverrides))
  ) {
    return res.status(400).json({ error: 'بيانات المستخدم أو الصلاحيات غير صالحة' });
  }
  const passwordBytes = Buffer.byteLength(password);
  if (passwordBytes < 16 || passwordBytes > 72) {
    return res.status(400).json({ error: 'يجب أن تكون كلمة المرور بين 16 و72 بايت' });
  }

  try {
    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!role) return res.status(400).json({ error: 'الدور المحدد غير موجود' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        fullName: fullName.trim(),
        passwordHash,
        roleId,
        active: active ?? true,
        email: typeof email === 'string' && email.trim() ? email.trim() : null,
        phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null,
        employeeId: typeof employeeId === 'string' && employeeId ? employeeId : null,
        permissionOverrides: permissionOverrides == null ? null : JSON.stringify(permissionOverrides),
      },
      select: { id: true, username: true, fullName: true },
    });
    await logAudit({
      userId: req.user!.id,
      action: 'USER_CREATE',
      entity: 'User',
      entityId: user.id,
      details: `تم إنشاء حساب المستخدم ${user.username}`,
      ipAddress: req.ip,
    });
    res.status(201).json(user);
  } catch (error: any) {
    console.error('Failed to create user:', error);
    res.status(400).json({ error: error.code === 'P2002' ? 'اسم المستخدم أو الموظف مرتبط بحساب آخر' : 'تعذر إنشاء المستخدم' });
  }
});

router.patch('/users/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!await requireAdmin(req, res)) return;

  const { username, fullName, email, phone, roleId, employeeId, active, permissionOverrides } = req.body || {};
  if (
    (username !== undefined && (typeof username !== 'string' || !username.trim())) ||
    (fullName !== undefined && (typeof fullName !== 'string' || !fullName.trim())) ||
    (email !== undefined && email !== null && typeof email !== 'string') ||
    (phone !== undefined && phone !== null && typeof phone !== 'string') ||
    (roleId !== undefined && (typeof roleId !== 'string' || !roleId)) ||
    (employeeId !== undefined && employeeId !== null && typeof employeeId !== 'string') ||
    (active !== undefined && typeof active !== 'boolean') ||
    (permissionOverrides !== undefined && permissionOverrides !== null && !validPermissionOverrides(permissionOverrides))
  ) {
    return res.status(400).json({ error: 'بيانات المستخدم أو الصلاحيات غير صالحة' });
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: { select: { name: true } } },
    });
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (target.id === req.user!.id && ((roleId !== undefined && roleId !== target.roleId) || active === false)) {
      return res.status(400).json({ error: 'لا يمكن للمدير تغيير دوره أو تعطيل حسابه بنفسه' });
    }
    if (roleId) {
      const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
      if (!role) return res.status(400).json({ error: 'الدور المحدد غير موجود' });
    }
    if (target.role.name === 'admin' && ((roleId !== undefined && roleId !== target.roleId) || active === false)) {
      const activeAdmins = await prisma.user.count({
        where: { active: true, role: { name: 'admin' } },
      });
      if (activeAdmins <= 1) return res.status(409).json({ error: 'يجب الإبقاء على مدير نظام نشط واحد على الأقل' });
    }

    const user = await prisma.user.update({
      where: { id: target.id },
      data: {
        ...(username !== undefined ? { username: username.trim() } : {}),
        ...(fullName !== undefined ? { fullName: fullName.trim() } : {}),
        ...(email !== undefined ? { email: typeof email === 'string' && email.trim() ? email.trim() : null } : {}),
        ...(phone !== undefined ? { phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null } : {}),
        ...(roleId !== undefined ? { roleId } : {}),
        ...(employeeId !== undefined ? { employeeId: employeeId || null } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(permissionOverrides !== undefined ? { permissionOverrides: permissionOverrides === null ? null : JSON.stringify(permissionOverrides) } : {}),
      },
      select: { id: true, username: true, fullName: true, active: true },
    });
    await logAudit({
      userId: req.user!.id,
      action: 'USER_UPDATE',
      entity: 'User',
      entityId: user.id,
      details: `تم تعديل حساب المستخدم ${user.username}`,
      ipAddress: req.ip,
    });
    res.json(user);
  } catch (error) {
    console.error('Failed to update user:', error);
    res.status(400).json({ error: 'تعذر تعديل المستخدم' });
  }
});

router.delete('/users/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!await requireAdmin(req, res)) return;
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'لا يمكن حذف حساب المدير المستخدم حاليًا' });
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: { select: { name: true } } },
    });
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (target.role.name === 'admin') {
      const activeAdmins = await prisma.user.count({
        where: { active: true, role: { name: 'admin' } },
      });
      if (target.active && activeAdmins <= 1) {
        return res.status(409).json({ error: 'يجب الإبقاء على مدير نظام نشط واحد على الأقل' });
      }
    }

    await prisma.user.delete({ where: { id: target.id } });
    await logAudit({
      userId: req.user!.id,
      action: 'USER_DELETE',
      entity: 'User',
      entityId: target.id,
      details: `تم حذف حساب المستخدم ${target.username}`,
      ipAddress: req.ip,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.status(400).json({ error: 'تعذر حذف المستخدم لارتباطه بسجلات أخرى' });
  }
});

router.patch('/users/:id/password', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!await requireAdmin(req, res)) return;

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
      userId: req.user!.id,
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
