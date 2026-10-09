import { AsyncLocalStorage } from 'async_hooks';
import { NextFunction, Request, Response } from 'express';

const requestContext = new AsyncLocalStorage<{ userId: string }>();

export const withRequestContext = (req: Request, _res: Response, next: NextFunction) => {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) return next();
  requestContext.run({ userId }, next);
};

export const currentRequestUserId = () => requestContext.getStore()?.userId;
