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
  changes?: Record<string, { before: unknown; after: unknown }>;
}) {
  try {
    const changeSummary = params.changes
      ? Object.entries(params.changes)
        .map(([field, change]) => `${field}: ${JSON.stringify(change.before ?? null)} => ${JSON.stringify(change.after ?? null)}`)
        .join(' | ')
      : '';
    const details = [params.details, changeSummary ? `التغييرات: ${changeSummary}` : '']
      .filter(Boolean)
      .join('\n');
    const audit = await prisma.auditLog.create({
      data: {
        userId: params.userId || currentRequestUserId() || null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId || null,
        details: details || null,
        ipAddress: params.ipAddress || null,
      },
    });
    void notifyAuditActivity(audit.id);
  } catch (error) {
    console.error('Audit Log Error:', error);
  }
}
