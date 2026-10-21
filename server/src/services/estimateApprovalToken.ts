import { createHash, randomBytes } from 'crypto';

export const createEstimateApprovalToken = () => randomBytes(32).toString('hex');

export const hashEstimateApprovalToken = (token: string) => createHash('sha256').update(token).digest('hex');