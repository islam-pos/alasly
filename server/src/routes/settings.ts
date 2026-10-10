import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { PERMISSIONS } from '../lib/permissions';

const router = Router();

router.get('/audit-logs', async (req, res) => {
  try {
    const { action, entity, limit = 50 } = req.query;
    let whereClause: any = {};
    if (action) whereClause.action = String(action);
    if (entity) whereClause.entity = String(entity);

    const logs = await prisma.auditLog.findMany({
      where: whereClause,
      include: { user: { select: { username: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(String(limit)),
    });

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/permissions', (req, res) => {
  res.json(PERMISSIONS);
});

export default router;
