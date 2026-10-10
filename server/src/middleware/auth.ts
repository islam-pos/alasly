import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes');
  }
  return secret;
};

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
    return res.status(401).json({ error: 'غير مصرح لك بالدخول، يرجى تسجيل الدخول أولاً' });
  }

  try {
    const decoded = jwt.verify(authHeader.slice('Bearer '.length), getJwtSecret());
    if (
      typeof decoded === 'string' ||
      typeof decoded.id !== 'string' ||
      typeof decoded.username !== 'string' ||
      typeof decoded.role !== 'string'
    ) {
      return res.status(401).json({ error: 'رمز الدخول غير صالح أو منتهي الصلاحية' });
    }
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      ...(typeof decoded.branchId === 'string' ? { branchId: decoded.branchId } : {}),
    };
    return next();
  } catch {
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
    req.rolePermissions = JSON.parse(user.permissionOverrides ?? user.role.permissions) as string[];
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
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
};
