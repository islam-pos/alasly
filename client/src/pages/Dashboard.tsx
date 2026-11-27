import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  TrendingUp,
  Wrench,
  Package,
  CreditCard,
  Car,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Building2,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  AlertCircle,
  FileText,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { api } from '../services/api';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getDashboardStats(), api.getDashboardCharts(), api.getDashboardAlerts()])
      .then(([statsRes, chartsRes, alertsRes]) => {
        setStats(statsRes);
        setCharts(chartsRes);
        setAlerts(alertsRes);
      })
      .catch((err) => console.error('Dashboard load error:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-sm font-medium">جاري تحميل بيانات لوحة التحكم والمؤشرات الحية...</div>
      </div>
    );
  }

  const COLORS = ['#0e8ce8', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Page Header & Quick Welcome */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-l from-slate-950 via-[#12335a] to-brand-800 p-6 shadow-xl shadow-slate-900/10">
        <div className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -left-2 -top-8 h-32 w-32 rounded-full border border-white/10" />
        <div>
          <h1 className="relative flex items-center gap-2 text-xl font-black text-white">
            <span>لوحة التحكم الرئيسية والمؤشرات الحية</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs font-bold text-emerald-100">
              مباشر • Live
            </span>
          </h1>
          <p className="relative mt-2 text-xs text-blue-100">
            نظرة شاملة ومترابطة على المبيعات، صيانة الورشة، حركة المخزون، والسيولة النقدية.
          </p>
        </div>

        <div className="relative flex flex-wrap items-center gap-2">
          <Link
            to="/workshop/job-cards?action=new"
            className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-brand-900 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-blue-50"
          >
            <Wrench className="w-4 h-4" />
            <span>فتح أمر إصلاح جديد</span>
          </Link>
          <Link
            to="/pos"
            className="flex items-center gap-1.5 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-black text-emerald-950 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-emerald-300"
          >
            <DollarSign className="w-4 h-4" />
            <span>كاشير بيع سريع POS</span>
          </Link>
        </div>
      </div>

      {/* 2. Top Smart Alerts Bar (Section 3) */}
      {alerts && alerts.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>تنبيهات النظام الاستباقية ({alerts.length})</span>
            </div>
            <span className="text-xs text-amber-700 font-medium">تتطلب اتخاذ إجراء</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {alerts.slice(0, 6).map((alt) => (
              <Link
                key={alt.id}
                to={alt.link || '#'}
                className="p-3 bg-white rounded-xl border border-amber-100 hover:border-amber-300 shadow-2xs hover:shadow-sm transition-all flex items-start justify-between group"
              >
                <div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-amber-800">
                    {alt.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{alt.message}</div>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-300 group-hover:text-amber-600 group-hover:-translate-x-1 transition-all flex-shrink-0 mr-1 mt-0.5" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 3. The 12 Main Stat Cards (Section 3) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3 sm:gap-4">
        {/* Card 1: Sales Today */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">مبيعات اليوم</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats?.salesToday?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">عدد الفواتير اليوم: {stats?.todayInvoicesCount || 0}</div>
        </div>

        {/* Card 2: Sales Month */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">مبيعات الشهر</span>
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats?.salesMonth?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">شامل القطع والصيانة</div>
        </div>

        {/* Card 3: Maintenance Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">إيرادات الصيانة</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats?.maintenanceRevenue?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">فواتير أوامر الإصلاح</div>
        </div>

        {/* Card 4: Spare Parts Cost */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">تكلفة قطع الغيار</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats?.sparePartsCost?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">تكلفة البضاعة المباعة COGS</div>
        </div>

        {/* Card 5: Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">المصروفات الشهرية</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats?.expensesMonth?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">تشغيلية، إيجار وكهرباء</div>
        </div>

        {/* Card 6: Net Profit */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">صافي الأرباح</span>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-600">
            {stats?.netProfit?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-teal-600 font-semibold mt-1">صافي بعد التكاليف والمصروفات</div>
        </div>

        {/* Card 7: Vehicles in Workshop */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">سيارات داخل الورشة</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats?.vehiclesInWorkshop || 0} <span className="text-xs font-normal text-slate-500">سيارة</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">على الرافعات وقيد العمل</div>
        </div>

        {/* Card 8: Open Job Cards */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">أوامر إصلاح مفتوحة</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats?.openJobCards || 0} <span className="text-xs font-normal text-slate-500">أمر</span>
          </div>
          <div className="text-[11px] text-amber-700 font-medium mt-1">بانتظار فحص أو تسليم</div>
        </div>

        {/* Card 9: Today Invoices */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">فواتير اليوم</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats?.todayInvoicesCount || 0} <span className="text-xs font-normal text-slate-500">فاتورة</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">مبيعات وصيانة صادرة</div>
        </div>

        {/* Card 10: Customer Receivables */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">مستحقات على العملاء</span>
            <div className="p-2 rounded-xl bg-orange-50 text-orange-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats?.customerReceivables?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-orange-700 font-medium mt-1">ذمم مدينة (AR)</div>
        </div>

        {/* Card 11: Supplier Payables */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">مستحقات للموردين</span>
            <div className="p-2 rounded-xl bg-red-50 text-red-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {stats?.supplierPayables?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-red-700 font-medium mt-1">ذمم دائنة (AP)</div>
        </div>

        {/* Card 12: Current Inventory Value */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-500">قيمة المخزون الحالي</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {Math.round(stats?.inventoryValue || 0).toLocaleString()} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">بالتكلفة في الـ 3 مستودعات</div>
        </div>
      </div>

      {/* 4. Interactive Charts Section (Section 3) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Sales Last 7 Days */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">المبيعات خلال آخر 7 أيام</h2>
              <p className="text-xs text-slate-400">مقارنة مبيعات قطع الغيار مقابل إيرادات الصيانة</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-lg text-slate-600">
              تحديث تلقائي
            </span>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.last7Days || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: any) => [`${value} ج.م`, '']}
                  contentStyle={{ backgroundColor: '#1e293b', borderRadius: '12px', color: '#fff', border: 'none' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="parts" name="قطع الغيار" fill="#0e8ce8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="maintenance" name="خدمات الصيانة" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Top Selling Spare Parts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">أكثر 5 أصناف قطع غيار مبيعًا</h2>
              <p className="text-xs text-slate-400">حسب إجمالي الكميات المباعة</p>
            </div>
            <Link to="/items" className="text-xs font-bold text-brand-600 hover:text-brand-700">
              عرض الأصناف ←
            </Link>
          </div>

          <div className="space-y-3 pt-2">
            {charts?.topItems?.map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center">
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 line-clamp-1">{item.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</div>
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-900">{item.quantity} قطعة</div>
                  <div className="text-[10px] text-emerald-600 font-semibold">{item.total.toLocaleString()} ج.م</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 3: Top Executed Services */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">أكثر خدمات الصيانة المنفذة في الورشة</h2>
              <p className="text-xs text-slate-400">حسب عدد مرات التنفيذ وأجور اليد</p>
            </div>
            <Link to="/workshop/job-cards" className="text-xs font-bold text-brand-600 hover:text-brand-700">
              سجل الورشة ←
            </Link>
          </div>

          <div className="space-y-3 pt-2">
            {charts?.topServices?.map((srv: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                    {i + 1}
                  </div>
                  <div className="text-xs font-bold text-slate-800 line-clamp-1">{srv.name}</div>
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-900">{srv.count} سيارة</div>
                  <div className="text-[10px] text-brand-600 font-semibold">{srv.revenue.toLocaleString()} ج.م</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 4: Technician Productivity */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">إنتاجية الفنيين في الورشة</h2>
              <p className="text-xs text-slate-400">ساعات العمل وأجور الخدمات المنفذة</p>
            </div>
            <Link to="/employees?tab=commissions" className="text-xs font-bold text-brand-600 hover:text-brand-700">
              العمولات ←
            </Link>
          </div>

          <div className="space-y-3 pt-2">
            {charts?.techProductivity?.map((tech: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 font-bold text-xs flex items-center justify-center text-slate-700">
                    {tech.name[0]}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">{tech.name}</div>
                    <div className="text-[10px] text-slate-400">{tech.jobsCount} أعمال صيانة • {tech.hours} ساعة</div>
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-900">{tech.revenue.toLocaleString()} ج.م</div>
                  <div className="text-[10px] text-emerald-600 font-semibold">إجمالي أجور اليد</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
