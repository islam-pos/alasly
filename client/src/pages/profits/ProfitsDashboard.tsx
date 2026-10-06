import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, DollarSign, Percent, PieChart, 
  ArrowUpRight, ArrowDownRight, Layers, Building2, 
  Wrench, PackageCheck, Calendar, RefreshCw
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const ProfitsDashboard: React.FC = () => {
  const { showToast } = useToast();
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  const loadProfits = async () => {
    try {
      setLoading(true);
      const res = await api.profits.getSummary({ period });
      setSummary(res.data);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تحميل بيانات الأرباح والخسائر', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfits();
  }, [period]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-emerald-600" />
            تحليل الأرباح والخسائر (P&L)
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            تقرير تفصيلي لربحية مبيعات قطع الغيار، أجور صيانة الورشة، ومصروفات التشغيل
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setPeriod('day')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              period === 'day' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            اليوم
          </button>
          <button
            onClick={() => setPeriod('week')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              period === 'week' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            هذا الأسبوع
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              period === 'month' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الشهر الحالي
          </button>
          <button
            onClick={() => setPeriod('year')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              period === 'year' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            السنة المالية
          </button>
        </div>
      </div>

      {loading || !summary ? (
        <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border">
          جاري استخراج وتجميع مؤشرات الأرباح والخسائر...
        </div>
      ) : (
        <>
          {/* Top 4 Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">إجمالي الإيرادات الكلية</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{summary.totalIncome?.toLocaleString()} ر.س</div>
              <div className="text-[11px] text-blue-600 font-medium mt-1">قطع غيار + صيانة + إيرادات أخرى</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">مجمل الربح التجاري (Gross Profit)</span>
              <div className="text-2xl font-black text-blue-700 mt-1">{summary.grossProfit?.toLocaleString()} ر.س</div>
              <div className="text-[11px] text-slate-500 mt-1">بعد خصم تكلفة البضاعة وعمولات الفنيين</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">صافي الربح التشغيلي (Net Profit)</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">{summary.netProfit?.toLocaleString()} ر.س</div>
              <div className="text-[11px] text-emerald-700 font-medium mt-1">بعد خصم كافة المصروفات التشغيلية</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">هامش صافي الربح الإجمالي</span>
              <div className="text-2xl font-black text-purple-700 mt-1">{summary.profitMargin}%</div>
              <div className="text-[11px] text-purple-600 font-medium mt-1">نسبة الفائض النقدي من إجمالي المبيعات</div>
            </div>
          </div>

          {/* Detailed Dual Columns: Parts Profit & Workshop Profit */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Parts Profit Breakdown */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-blue-600" />
                  أرباح بيع قطع الغيار
                </h3>
                <span className="text-xs font-mono font-bold bg-blue-50 text-blue-800 px-2.5 py-1 rounded-full">
                  هامش الربح: {summary.parts?.margin}%
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">إجمالي مبيعات قطع الغيار (سعر البيع):</span>
                  <span className="font-mono font-bold text-slate-900">{summary.parts?.sales?.toLocaleString()} ر.س</span>
                </div>

                <div className="flex justify-between items-center text-sm p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">تكلفة شراء القطع المباعة (COGS):</span>
                  <span className="font-mono font-bold text-rose-600">- {summary.parts?.cost?.toLocaleString()} ر.س</span>
                </div>

                <div className="flex justify-between items-center text-sm p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="font-bold text-emerald-900">مجمل ربح قطع الغيار:</span>
                  <span className="font-mono font-black text-lg text-emerald-700">{summary.parts?.profit?.toLocaleString()} ر.س</span>
                </div>
              </div>
            </div>

            {/* Workshop / Labor Profit Breakdown */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-emerald-600" />
                  أرباح خدمات الورشة وشغل اليد
                </h3>
                <span className="text-xs font-mono font-bold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full">
                  كفاءة التشغيل
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">إيرادات أجور الفحص والصيانة المفوترة:</span>
                  <span className="font-mono font-bold text-slate-900">{summary.workshop?.laborSales?.toLocaleString()} ر.س</span>
                </div>

                <div className="flex justify-between items-center text-sm p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">عمولات الفنيين والمهندسين المستحقة:</span>
                  <span className="font-mono font-bold text-rose-600">- {summary.workshop?.technicianCost?.toLocaleString()} ر.س</span>
                </div>

                <div className="flex justify-between items-center text-sm p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="font-bold text-emerald-900">صافي عائد شغل اليد للورشة:</span>
                  <span className="font-mono font-black text-lg text-emerald-700">{summary.workshop?.profit?.toLocaleString()} ر.س</span>
                </div>
              </div>
            </div>
          </div>

          {/* Operating Expenses Breakdown Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-rose-600" />
                المصروفات التشغيلية والإدارية
              </h3>
              <span className="font-mono font-bold text-rose-600">
                الإجمالي: {summary.expenses?.total?.toLocaleString()} ر.س
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {summary.expenses?.byCategory?.length === 0 ? (
                <div className="text-sm text-slate-400 py-4 col-span-3 text-center">لا توجد مصروفات مسجلة خلال هذه الفترة</div>
              ) : (
                summary.expenses?.byCategory?.map((cat: any, idx: number) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-700">{cat.name}</span>
                    <span className="font-mono font-bold text-rose-600 text-sm">{cat.amount.toLocaleString()} ر.س</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Formal P&L Statement */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-lg text-slate-900 border-b pb-3">
              قائمة الدخل والأرباح والخسائر التقديرية (Income Statement)
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-slate-700 font-semibold">إجمالي المبيعات والإيرادات (Gross Revenue)</span>
                <span className="font-mono font-bold">{summary.totalIncome?.toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between py-2 border-b text-rose-700">
                <span className="mr-4">- تكلفة البضاعة المباعة وعمولات العمالة المباشرة (COGS)</span>
                <span className="font-mono font-bold">- {((summary.parts?.cost || 0) + (summary.workshop?.technicianCost || 0)).toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between py-2.5 bg-blue-50/50 px-3 rounded-lg font-bold text-blue-900">
                <span>= مجمل الربح (Gross Profit)</span>
                <span className="font-mono text-base">{summary.grossProfit?.toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between py-2 border-b text-rose-700">
                <span className="mr-4">- المصروفات العمومية والتشغيلية (OPEX)</span>
                <span className="font-mono font-bold">- {summary.expenses?.total?.toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between py-2 border-b text-emerald-700">
                <span className="mr-4">+ إيرادات تشغيلية واستثمارية أخرى</span>
                <span className="font-mono font-bold">+ {summary.revenues?.total?.toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between py-4 bg-emerald-50 px-4 rounded-xl font-black text-base border-2 border-emerald-300 text-emerald-900">
                <span>= صافي الربح النهائي (Net Profit before Tax)</span>
                <span className="font-mono text-xl">{summary.netProfit?.toLocaleString()} ر.س</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
