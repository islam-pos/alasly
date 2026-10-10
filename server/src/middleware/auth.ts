import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'autocare_erp_super_secret_jwt_key_2026';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    branchId?: string;
  };
  authenticatedRole?: string;
  rolePermissions?: string[];
}

export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // If no token provided, we allow default demo user for frictionless demo testing if desired, or require 401
    // Let's verify token if present
    const token = authHeader?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'غير مصرح لك بالدخول، يرجى تسجيل الدخول أولاً' });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول' });
    }
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'رمز الدخول غير صالح أو منتهي الصلاحية' });
  }
};

export const loadUserPermissions = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'غير مصرح لك بالدخول، يرجى تسجيل الدخول أولاً' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { role: true },
    });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'الحساب غير موجود أو غير نشط' });
    }

    req.authenticatedRole = user.role.name;
    req.rolePermissions = JSON.parse(user.role.permissions) as string[];
    next();
  } catch (error) {
    next(error);
  }
};

export const requirePermission = (permission: string) => (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  if (req.authenticatedRole === 'admin' || req.rolePermissions?.includes(permission)) {
    return next();
  }
  return res.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
};

export const generateToken = (payload: { id: string; username: string; role: string; branchId?: string }) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};
