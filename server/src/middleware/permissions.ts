import { NextFunction, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from './auth';

const getRequiredPermissions = (path: string, method: string): string[] | null => {
  if (path.startsWith('/dashboard')) return ['view_dashboard'];
  if (path.startsWith('/items')) {
    return method === 'GET' ? ['manage_items', 'manage_sales', 'manage_purchases', 'pos_access', 'issue_parts'] : ['manage_items'];
  }
  if (path.startsWith('/purchases')) return ['manage_purchases'];
  if (path.startsWith('/sales/pos')) return ['pos_access', 'manage_sales'];
  if (path.startsWith('/sales')) return ['manage_sales'];
  if (path.startsWith('/workshop/job-cards') && path.includes('/parts/issue')) return ['issue_parts'];
  if (path.startsWith('/workshop/job-cards') && path.includes('/estimate/') && path.endsWith('/approve')) return ['approve_estimate'];
  if (path.startsWith('/workshop')) return ['manage_workshop', 'manage_jobcards'];
  if (path.startsWith('/inventory')) return ['manage_inventory'];
  if (path.startsWith('/reports')) return ['view_reports'];
  if (path.startsWith('/profits')) return ['view_profits'];
  if (path.startsWith('/hr/payroll') || path.startsWith('/hr/settings')) return ['manage_payroll'];
  if (path.startsWith('/hr/commissions')) return ['manage_payroll', 'manage_employees'];
  if (path.startsWith('/hr/')) return ['manage_employees'];
  if (path.startsWith('/master/company')) return method === 'GET' ? null : ['manage_settings'];
  if (path.startsWith('/master/branches')) return method === 'GET' ? ['manage_settings', 'manage_employees'] : ['manage_settings'];
  if (path.startsWith('/master/categories') || path.startsWith('/master/units')) {
    return method === 'GET' ? ['manage_items', 'manage_inventory', 'view_reports'] : ['manage_items', 'manage_settings'];
  }
  if (path.startsWith('/master/warehouses')) {
    return method === 'GET'
      ? ['manage_inventory', 'manage_purchases', 'issue_parts', 'view_reports']
      : ['manage_inventory', 'manage_settings'];
  }
  if (path.startsWith('/master/suppliers')) return ['manage_purchases', 'manage_expenses'];
  if (path.startsWith('/master/customers')) return ['manage_sales', 'manage_workshop', 'manage_purchases'];
  if (path.startsWith('/master/vehicles')) return ['manage_workshop', 'manage_sales'];
  if (path.startsWith('/master/employees')) return ['manage_employees'];
  if (path.startsWith('/master/jobs')) return ['manage_employees', 'manage_workshop'];
  if (path.startsWith('/master/roles')) return ['manage_settings'];
  if (path.startsWith('/financials/banks')) return ['manage_banks'];
  if (path.startsWith('/financials/cash') || path.startsWith('/financials/shifts') || path.startsWith('/financials/cashboxes')) return ['manage_cashbox'];
  if (path.startsWith('/financials/expenses') || path.startsWith('/financials/revenues') || path.startsWith('/financials/expense-categories')) return ['manage_expenses'];
  if (path.startsWith('/accounting')) return ['manage_accounting'];
  if (path.startsWith('/settings/audit-logs')) return ['view_audit_logs'];
  if (path.startsWith('/settings')) return ['manage_settings'];
  return null;
};

export const authorizeApiPermission = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const requiredPermissions = getRequiredPermissions(req.path, req.method);
  if (!requiredPermissions) return next();
  if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        active: true,
        permissionOverrides: true,
        role: { select: { name: true, permissions: true } },
      },
    });
    if (!user?.active) return res.status(401).json({ error: 'المستخدم غير موجود أو الحساب معطل' });
    if (user.role.name === 'admin') return next();

    const permissionSource = user.permissionOverrides ?? user.role.permissions;
    let permissions: unknown;
    try {
      permissions = JSON.parse(permissionSource || '[]');
    } catch (error) {
      console.error(`Invalid permissions data for user ${req.user.id}:`, error);
      return res.status(403).json({ error: 'تعذر التحقق من صلاحيات المستخدم' });
    }
    if (!Array.isArray(permissions) || !permissions.every((permission) => typeof permission === 'string')) {
      console.error(`Invalid permissions format for user ${req.user.id}`);
      return res.status(403).json({ error: 'تعذر التحقق من صلاحيات المستخدم' });
    }
    if (!requiredPermissions.some((permission) => permissions.includes(permission))) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذه العملية' });
    }
    return next();
  } catch (error) {
    console.error('Failed to authorize API request:', error);
    return res.status(500).json({ error: 'تعذر التحقق من صلاحية تنفيذ العملية' });
  }
};
