import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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

export const generateToken = (payload: { id: string; username: string; role: string; branchId?: string }) => {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
};
