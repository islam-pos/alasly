export const PERMISSIONS = [
  { key: 'view_dashboard', name: 'عرض لوحة التحكم الرئيسية', group: 'عام' },
  { key: 'manage_items', name: 'إدارة بطاقة الأصناف والتسعير', group: 'المخازن' },
  { key: 'manage_item_prices', name: 'عرض وتعديل أسعار الشراء والبيع', group: 'المخازن' },
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
] as const;

const permissionKeys = new Set<string>(PERMISSIONS.map(({ key }) => key));

export const isPermissionKey = (key: string): boolean => permissionKeys.has(key);
