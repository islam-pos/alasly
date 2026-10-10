import { prisma } from '../lib/prisma';
import { notifyAuditActivity } from '../services/notifications';
import { currentRequestUserId } from './requestContext';

export async function logAudit(params: {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
}) {
  try {
    const audit = await prisma.auditLog.create({
      data: {
        userId: params.userId || currentRequestUserId() || null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId || null,
        details: params.details || null,
        ipAddress: params.ipAddress || null,
      },
    });
    void notifyAuditActivity(audit.id);
  } catch (error) {
    console.error('Audit Log Error:', error);
  }
}
