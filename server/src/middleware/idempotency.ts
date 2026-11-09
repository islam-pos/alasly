import { createHash } from 'crypto';
import { NextFunction, Response } from 'express';
import type { OfflineMutationReceipt } from '../lib/prisma-client';
import { AuthenticatedRequest } from './auth';
import { prisma } from '../lib/prisma';

const isUniqueConstraintError = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');

interface ReceiptStore {
  findByKey: (userId: string, key: string) => Promise<OfflineMutationReceipt | null>;
  create: (data: { userId: string; key: string; requestHash: string; status: string }) => Promise<unknown>;
  update: (
    userId: string,
    key: string,
    data: { status: string; responseStatus: number; responseBody: string | null },
  ) => Promise<unknown>;
}

const sendExistingReceipt = (
  req: AuthenticatedRequest,
  res: Response,
  receipt: {
    requestHash: string;
    status: string;
    responseStatus: number | null;
    responseBody: string | null;
  },
  requestHash: string,
) => {
  if (receipt.requestHash !== requestHash) {
    return res.status(409).json({ error: 'مفتاح العملية مستخدم مسبقاً لبيانات مختلفة.' });
  }
  if (receipt.status !== 'COMPLETED' || receipt.responseStatus === null) {
    return res.status(409).json({
      error: 'تعذر التحقق من نتيجة محاولة سابقة؛ راجع السجل قبل إعادة العملية لتجنب التكرار.',
      code: 'OFFLINE_OPERATION_REQUIRES_REVIEW',
    });
  }

  res.setHeader('Idempotency-Replayed', 'true');
  if (receipt.responseStatus === 204) return res.status(204).end();
  return res
    .status(receipt.responseStatus)
    .type('application/json')
    .send(receipt.responseBody ?? 'null');
};

export const createIdempotencyMiddleware = (receipts: ReceiptStore) => async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
  const key = req.header('Idempotency-Key');
  if (!key) return next();

  if (!req.user?.id || !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
    return res.status(400).json({ error: 'مفتاح العملية غير صالح.' });
  }

  const requestHash = createHash('sha256')
    .update(JSON.stringify({ method: req.method, url: req.originalUrl, body: req.body }))
    .digest('hex');

  try {
    const existing = await receipts.findByKey(req.user.id, key);
    if (existing) return sendExistingReceipt(req, res, existing, requestHash);

    if (
      req.header('X-AutoCare-Offline') === '1'
      && ['PUT', 'PATCH', 'DELETE'].includes(req.method)
      && req.header('X-AutoCare-Manual-Review') !== '1'
    ) {
      return res.status(409).json({
        error: 'تتطلب هذه العملية مراجعة يدوية قبل إرسالها من طابور العمل دون اتصال.',
        code: 'OFFLINE_OPERATION_REQUIRES_REVIEW',
      });
    }

    try {
      await receipts.create({ userId: req.user.id, key, requestHash, status: 'PROCESSING' });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const racedReceipt = await receipts.findByKey(req.user.id, key);
      if (racedReceipt) return sendExistingReceipt(req, res, racedReceipt, requestHash);
      throw error;
    }

    let responseBody: string | null = null;
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      responseBody = body === undefined ? null : JSON.stringify(body);
      return originalJson(body);
    }) as typeof res.json;

    res.once('finish', () => {
      if (res.statusCode >= 500) return;
      void receipts.update(req.user!.id, key, {
          status: 'COMPLETED',
          responseStatus: res.statusCode,
          responseBody,
      }).catch((error: unknown) => {
        console.error('Could not persist an idempotency response; the operation remains locked for review:', error);
      });
    });

    return next();
  } catch (error) {
    return next(error);
  }
};

const prismaReceiptStore: ReceiptStore = {
  findByKey: (userId, key) => prisma.offlineMutationReceipt.findUnique({
    where: { userId_key: { userId, key } },
  }),
  create: (data) => prisma.offlineMutationReceipt.create({ data }),
  update: (userId, key, data) => prisma.offlineMutationReceipt.update({
    where: { userId_key: { userId, key } },
    data,
  }),
};

export const idempotencyMiddleware = createIdempotencyMiddleware(prismaReceiptStore);
