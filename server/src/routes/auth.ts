import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { generateToken, AuthenticatedRequest } from '../middleware/auth';
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
router.get('/me', async (req: AuthenticatedRequest, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      // Default to admin user for smooth preview if not logged in
      const defaultUser = await prisma.user.findFirst({
        where: { username: 'admin' },
        include: { role: true, branch: true, employee: true },
      });
      if (!defaultUser) return res.status(401).json({ error: 'غير مسجل' });
      return res.json({
        user: {
          id: defaultUser.id,
          username: defaultUser.username,
          fullName: defaultUser.fullName,
          email: defaultUser.email,
          role: defaultUser.role.name,
          roleNameAr: defaultUser.role.nameAr,
          permissions: JSON.parse(defaultUser.role.permissions || '[]'),
          branch: defaultUser.branch,
          employee: defaultUser.employee,
        },
      });
    }

    // Verify token
    const token = authHeader.split(' ')[1];
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'autocare_erp_super_secret_jwt_key_2026') as any;

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { role: true, branch: true, employee: true },
    });

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

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
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { role: true, branch: true, employee: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
