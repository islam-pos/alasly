import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Wrench,
  Search,
  ChevronDown,
  Building2,
  ShoppingCart,
  Receipt,
  Warehouse,
  Wallet,
  Users,
  Banknote,
  Landmark,
  BarChart3,
  TrendingUp,
  Settings,
  Bell,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  CheckCircle2,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GlobalSearchModal } from './GlobalSearchModal';

export const Navbar: React.FC = () => {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // The 11 Mega Menu Categories in the EXACT requested order:
  const menuCategories = [
    {
      id: 'master',
      title: 'البيانات الأساسية',
      icon: Building2,
      items: [
        { label: 'بيانات المركز والشركة', to: '/settings?tab=company', desc: 'الشعار، السجل، الرقم الضريبي' },
        { label: 'تعريف الأصناف وقطع الغيار', to: '/items', desc: 'كارت الصنف، الباركود، الأسعار' },
        { label: 'التصنيفات الرئيسية والفرعية', to: '/items?tab=categories', desc: 'فلاتر، فرامل، محرك، زيوت...' },
        { label: 'تعريف الوحدات', to: '/items?tab=units', desc: 'حبة، طقم، لتر، كرتون...' },
        { label: 'تعريف المخازن والأرفف', to: '/warehouses', desc: 'المستودع الرئيسي، مخزن الورشة' },
        { label: 'تعريف الموردين', to: '/suppliers', desc: 'بيانات الموردين والأرصدة' },
        { label: 'تعريف العملاء', to: '/customers', desc: 'أفراد، شركات، وأرصدة' },
        { label: 'تعريف السيارات والأسطول', to: '/vehicles', desc: 'اللوحات، VIN، وسجل الصيانة' },
        { label: 'تعريف الموظفين والفنيين', to: '/employees', desc: 'الميكانيكيين، الكهربائيين...' },
        { label: 'المستخدمين والصلاحيات', to: '/settings?tab=users', desc: 'الأدوار وتحديد الوصول' },
      ],
    },
    {
      id: 'purchases',
      title: 'المشتريات',
      icon: ShoppingCart,
      items: [
        { label: 'طلبات الشراء (PO)', to: '/purchases?tab=requests', desc: 'أوامر التوريد والاعتماد' },
        { label: 'فواتير المشتريات', to: '/purchases', desc: 'استلام الشحنات وتحديث المخزون' },
        { label: 'مرتجع المشتريات', to: '/purchases?tab=returns', desc: 'إرجاع قطع للموردين' },
        { label: 'كشف حسابات الموردين', to: '/suppliers', desc: 'المديونية والمستحقات والمدفوعات' },
      ],
    },
    {
      id: 'sales',
      title: 'المبيعات والورشة',
      icon: Receipt,
      items: [
        { label: 'شاشة كاشير قطع الغيار (POS)', to: '/pos', desc: 'نقاط البيع السريعة والباركود' },
        { label: 'الحجوزات والعمليات المتقدمة', to: '/operations', desc: 'المواعيد، CRM، الحملات، الأصول والضريبة' },
        { label: 'فتح أمر إصلاح (Job Card)', to: '/workshop/job-cards', desc: 'استقبال سيارة وتحديد المشكلة' },
        { label: 'تقديرات الورشة', to: '/workshop/job-cards', desc: 'تسعير الإصلاح وموافقة العميل' },
        { label: 'طلب وصرف قطع الورشة', to: '/workshop/parts', desc: 'طلب القطع ومتابعة صرفها لأوامر الإصلاح' },
        { label: 'فاتورة الصيانة النهائية', to: '/sales?type=MAINTENANCE', desc: 'القطع المستهلكة وأجور اليد' },
        { label: 'فواتير المبيعات العامة', to: '/sales', desc: 'سجل فواتير البيع المعتمدة' },
        { label: 'عروض الأسعار العامة', to: '/sales?type=QUOTATION', desc: 'إنشاء العروض وتحويلها إلى فواتير' },
        { label: 'مرتجع المبيعات', to: '/sales?tab=returns', desc: 'إرجاع واسترداد القطع' },
      ],
    },
    {
      id: 'warehouses',
      title: 'المخازن',
      icon: Warehouse,
      items: [
        { label: 'أرصدة الأصناف الحالية', to: '/warehouses', desc: 'الكميات المتوفرة والمحجوزة' },
        { label: 'إذن صرف داخلي للورشة', to: '/warehouses?tab=issue', desc: 'صرف قطع غيار لأمر إصلاح' },
        { label: 'التحويل بين المخازن', to: '/warehouses?tab=transfers', desc: 'نقل من المستودع لصالة الورشة' },
        { label: 'الجرد والتسويات المخزنية', to: '/warehouses?tab=counts', desc: 'المطابقة الفعلية والفروقات' },
      ],
    },
    {
      id: 'expenses',
      title: 'المصروفات',
      icon: Wallet,
      items: [
        { label: 'المحاسبة العامة والقيود اليومية', to: '/accounting', desc: 'دليل الحسابات، الأستاذ العام وميزان المراجعة' },
        { label: 'سندات المصروفات', to: '/financials?tab=expenses', desc: 'إيجار، كهرباء، أدوات ورشة...' },
        { label: 'سندات الإيرادات المتنوعة', to: '/financials?tab=revenues', desc: 'إيراد خردة، استشارات فحص' },
        { label: 'تصنيفات وبنود المصروفات', to: '/financials?tab=categories', desc: 'هيكلة بنود التكاليف' },
      ],
    },
    {
      id: 'employees',
      title: 'الموظفين',
      icon: Users,
      items: [
        { label: 'الحضور والانصراف اليومي', to: '/employees?tab=attendance', desc: 'تسجيل الدخول وساعات العمل' },
        { label: 'عمولات الفنيين', to: '/employees?tab=commissions', desc: 'حساب النسبة من أجور اليد' },
        { label: 'مسير الرواتب والسلف', to: '/employees?tab=payroll', desc: 'المسير الشهري والاستحقاقات' },
      ],
    },
    {
      id: 'cashbox',
      title: 'الخزنة',
      icon: Banknote,
      items: [
        { label: 'سند قبض مالي', to: '/financials?tab=cash', desc: 'تحصيل نقد من عميل' },
        { label: 'سند صرف مالي', to: '/financials?tab=cash', desc: 'صرف نقد لمورد أو مصروف' },
        { label: 'تسوية وإغلاق الورديات', to: '/financials?tab=shifts', desc: 'مطابقة العجز والفائض وتسليم العهدة' },
      ],
    },
    {
      id: 'banks',
      title: 'البنوك',
      icon: Landmark,
      items: [
        { label: 'الحسابات البنكية', to: '/financials?tab=banks', desc: 'أرصدة البنوك والـ IBAN' },
        { label: 'حركات الإيداع والسحب', to: '/financials?tab=banks', desc: 'التحويلات وتسويات الشبكة مدى' },
      ],
    },
    {
      id: 'reports',
      title: 'التقارير',
      icon: BarChart3,
      items: [
        { label: 'تقارير المبيعات اليومية والشهرية', to: '/reports?tab=sales', desc: 'المبيعات حسب الموظف والصنف' },
        { label: 'تقارير حركة وتقييم المخزون', to: '/reports?tab=inventory', desc: 'الأصناف الراكدة والناقصة' },
        { label: 'تقارير الورشة وإنتاجية الفنيين', to: '/reports?tab=workshop', desc: 'السيارات الحالية وأوقات الإنجاز' },
        { label: 'سجل العميل وتاريخ صيانة السيارة', to: '/reports?tab=customers', desc: 'القطع المستبدلة والإنفاق' },
        { label: 'تقارير الموردين والمديونيات', to: '/reports?tab=suppliers', desc: 'كشوف الحسابات والمشتريات' },
      ],
    },
    {
      id: 'profits',
      title: 'الأرباح',
      icon: TrendingUp,
      items: [
        { label: 'قائمة الأرباح والخسائر (P&L)', to: '/profits', desc: 'صافي الربح اليومي والشهري' },
        { label: 'ربحية قطع الغيار المباعة', to: '/profits?tab=parts', desc: 'الهامش وتكلفة البضاعة COGS' },
        { label: 'ربحية خدمات الصيانة والورشة', to: '/profits?tab=workshop', desc: 'أجور اليد مقابل عمولات الفنيين' },
      ],
    },
    {
      id: 'settings',
      title: 'الإعدادات',
      icon: Settings,
      items: [
        { label: 'إعدادات المنشأة', to: '/settings?tab=company', desc: 'بيانات المركز وتصميم المستندات' },
        { label: 'الصلاحيات ومصفوفة الأدوار (RBAC)', to: '/settings?tab=roles', desc: 'صلاحيات المستخدمين والوظائف' },
        { label: 'سجل العمليات والرقابة (Audit Log)', to: '/settings?tab=audit', desc: 'تتبع كافة التعديلات والمستندات' },
        { label: 'النسخ الاحتياطي والاستعادة', to: '/settings?tab=backups', desc: 'نسخ قاعدة البيانات ومرفقات الورشة واستعادتها' },
      ],
    },
  ];

  const visibleMenuCategories = menuCategories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const [path, query = ''] = item.to.split('?');
        const params = new URLSearchParams(query);
        if (path === '/items') return hasPermission('manage_items');
        if (path === '/customers') return ['manage_sales', 'manage_workshop', 'manage_purchases'].some(hasPermission);
        if (path === '/vehicles') return hasPermission('manage_workshop') || hasPermission('manage_sales');
        if (path === '/suppliers') return hasPermission('manage_purchases') || hasPermission('manage_expenses');
        if (path === '/purchases') return hasPermission('manage_purchases');
        if (path === '/sales') return hasPermission('manage_sales');
        if (path === '/pos') return hasPermission('pos_access');
        if (path === '/workshop/parts') {
          return ['manage_workshop', 'manage_jobcards', 'issue_parts', 'manage_inventory'].some(hasPermission);
        }
        if (path.startsWith('/workshop')) return hasPermission('manage_workshop');
        if (path === '/warehouses') return hasPermission('manage_inventory');
        if (path === '/employees') {
          return params.get('tab') === 'payroll'
            ? hasPermission('manage_payroll')
            : hasPermission('manage_employees');
        }
        if (path === '/financials') {
          const tab = params.get('tab');
          if (tab === 'banks') return hasPermission('manage_banks');
          if (tab === 'cash' || tab === 'shifts') return hasPermission('manage_cashbox');
          return hasPermission('manage_expenses');
        }
        if (path === '/accounting') return hasPermission('manage_accounting');
        if (path === '/reports') return hasPermission('view_reports');
        if (path === '/profits') return hasPermission('view_profits');
        if (path === '/settings') {
          if (params.get('tab') === 'users' || params.get('tab') === 'integrations' || params.get('tab') === 'backups') return user?.role === 'admin';
          if (params.get('tab') === 'audit') return hasPermission('view_audit_logs');
          return hasPermission('manage_settings');
        }
        return true;
      }),
    }))
    .filter((category) => category.items.length > 0);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm" ref={navRef}>
      {/* 1. Top Bar: Brand, Search, Branch, User */}
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo & Brand Name */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-black text-slate-900 tracking-tight block leading-tight">
                المحترف <span className="text-brand-600 font-bold text-sm">AutoCare</span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium block">نظام إدارة صيانة السيارات المتكامل</span>
            </div>
          </Link>
        </div>

        {/* Global Search Bar (Trigger) */}
        <div className="hidden sm:flex flex-1 max-w-md mx-4">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-2 bg-slate-100/80 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-400 hover:text-slate-600 transition-all shadow-inner"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <span>بحث عام: لوحة، شاسيه، عميل، صنف، فاتورة...</span>
            </div>
            <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-[10px] font-mono font-bold text-slate-500">
              Ctrl+K
            </span>
          </button>
        </div>

        {/* Right tools: Branch badge, Alerts, User Profile */}
        <div className="flex items-center gap-3">
          {/* Branch Selector */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
            <Building2 className="w-3.5 h-3.5 text-brand-600" />
            <span>{user?.branch?.name || 'الفرع غير محدد'}</span>
          </div>

          {/* User & Role Badge */}
          <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs">
              {user?.fullName ? user.fullName[0] : 'م'}
            </div>
            <div className="hidden lg:block text-right">
              <div className="text-xs font-bold text-slate-800 leading-tight">{user?.fullName || 'المدير العام'}</div>
              <div className="text-[10px] text-brand-600 font-medium">{user?.roleNameAr || 'مدير النظام'}</div>
            </div>
            <button
              onClick={() => logout()}
              title="تسجيل الخروج"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Mega Menu Bar (Exact 11 Items Order) */}
      <nav className="bg-slate-900 text-slate-200 border-t border-slate-800 hidden lg:block select-none">
        <div className="max-w-[1700px] mx-auto px-4 flex items-center">
          {visibleMenuCategories.map((cat, idx) => {
            const Icon = cat.icon;
            const isOpen = activeMenu === cat.id;

            return (
              <div key={cat.id} className="relative">
                <button
                  onClick={() => setActiveMenu(isOpen ? null : cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                    isOpen
                      ? 'text-white border-brand-500 bg-slate-800/80'
                      : 'text-slate-300 border-transparent hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 text-brand-400" />
                  <span>{cat.title}</span>
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu Panel */}
                {isOpen && (
                  <div className="absolute top-full right-0 mt-0.5 w-80 bg-white text-slate-800 rounded-b-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in-50 duration-150">
                    <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                      <Icon className="w-4 h-4 text-brand-600" />
                      <span className="text-xs font-bold text-slate-900">{cat.title}</span>
                    </div>
                    <div className="py-1 max-h-[70vh] overflow-y-auto">
                      {cat.items.map((item, i) => (
                        <Link
                          key={i}
                          to={item.to}
                          onClick={() => setActiveMenu(null)}
                          className="block px-4 py-2.5 hover:bg-brand-50/60 transition-colors group"
                        >
                          <div className="text-xs font-bold text-slate-800 group-hover:text-brand-700">
                            {item.label}
                          </div>
                          {item.desc && (
                            <div className="text-[11px] text-slate-400 group-hover:text-slate-500 mt-0.5">
                              {item.desc}
                            </div>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-slate-900 text-white border-t border-slate-800 max-h-[80vh] overflow-y-auto p-4 space-y-4">
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              setIsSearchOpen(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-xl text-sm text-slate-300"
          >
            <Search className="w-4 h-4" />
            <span>بحث عام سريع...</span>
          </button>
          {visibleMenuCategories.map((cat) => (
            <div key={cat.id} className="border-b border-slate-800 pb-2">
              <div className="font-bold text-xs text-brand-400 mb-2">{cat.title}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {cat.items.map((it, i) => (
                  <Link
                    key={i}
                    to={it.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 bg-slate-800/60 rounded-lg hover:bg-slate-800 text-slate-300"
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </header>
  );
};
