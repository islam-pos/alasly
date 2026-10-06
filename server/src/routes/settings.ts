import { Router } from 'express';
import { prisma } from '../lib/prisma';

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
  const permissionsList = [
    { key: 'view_dashboard', name: 'عرض لوحة التحكم الرئيسية', group: 'عام' },
    { key: 'manage_items', name: 'إدارة بطاقة الأصناف والتسعير', group: 'المخازن' },
    { key: 'manage_purchases', name: 'إدارة المشتريات وفواتير الموردين', group: 'المشتريات' },
    { key: 'manage_sales', name: 'إدارة فواتير المبيعات والمرتجعات', group: 'المبيعات' },
    { key: 'pos_access', name: 'استخدام نقطة البيع السريعة POS', group: 'المبيعات' },
    { key: 'manage_workshop', name: 'إدارة الورشة وأوامر الإصلاح', group: 'الورشة' },
    { key: 'manage_jobcards', name: 'فتح وتعديل Job Cards', group: 'الورشة' },
    { key: 'approve_estimate', name: 'اعتماد عروض الأسعار', group: 'الورشة' },
    { key: 'issue_parts', name: 'صرف قطع الغيار للورشة', group: 'المخازن' },
    { key: 'manage_inventory', name: 'الجرد والتحويلات المخزنية', group: 'المخازن' },
    { key: 'manage_expenses', name: 'إدارة المصروفات والإيرادات', group: 'المالية' },
    { key: 'manage_employees', name: 'إدارة الموظفين والوظائف', group: 'الموارد البشرية' },
    { key: 'manage_payroll', name: 'مسير الرواتب والعمولات', group: 'الموارد البشرية' },
    { key: 'manage_cashbox', name: 'سندات الخزينة وإغلاق الورديات', group: 'المالية' },
    { key: 'manage_banks', name: 'إدارة الحسابات والعمليات البنكية', group: 'المالية' },
    { key: 'view_reports', name: 'الاطلاع على التقارير وتصديرها', group: 'التقارير' },
    { key: 'view_profits', name: 'عرض قائمة الأرباح والخسائر', group: 'الأرباح' },
    { key: 'manage_settings', name: 'إدارة إعدادات النظام والضريبة', group: 'الإعدادات' },
    { key: 'view_audit_logs', name: 'عرض سجل العمليات والرقابة', group: 'الإعدادات' },
  ];
  res.json(permissionsList);
});

export default router;
