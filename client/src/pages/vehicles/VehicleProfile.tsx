import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Car,
  User,
  Clock,
  Wrench,
  Receipt,
  Package,
  Calendar,
  ChevronLeft,
  FileText,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const VehicleProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('history');
  const { error } = useToast();

  useEffect(() => {
    if (id) {
      loadVehicle();
    }
  }, [id]);

  const loadVehicle = async () => {
    setLoading(true);
    try {
      const res = await api.getVehicleProfile(id!);
      setData(res);
    } catch (err: any) {
      error(err.message || 'فشل تحميل ملف السيارة');
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-sm font-medium">جاري تحميل بروفايل وسجل صيانة السيارة...</div>
      </div>
    );
  }

  const { vehicle, replacedParts, performedServices } = data;

  const tabs = [
    { id: 'history', label: 'تاريخ الصيانة الزمني' },
    { id: 'job_cards', label: `أوامر الإصلاح (${vehicle.repairOrders?.length || 0})` },
    { id: 'parts', label: `قطع الغيار المستبدلة (${replacedParts?.length || 0})` },
    { id: 'services', label: `الخدمات وأجور اليد (${performedServices?.length || 0})` },
    { id: 'invoices', label: `الفواتير المسددة (${vehicle.salesInvoices?.length || 0})` },
    { id: 'specs', label: 'المواصفات الفنية' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Profile Banner (Section 22) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-600 to-slate-900 text-white flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Car className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black text-slate-900">
                  {vehicle.make} {vehicle.model}
                </h1>
                <span className="bg-slate-900 text-white text-sm font-bold font-mono px-3 py-1 rounded-lg">
                  {vehicle.plateNumber}
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  موديل {vehicle.year}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                <span>المالك: <strong>{vehicle.customer?.name}</strong></span>
                <span>•</span>
                <span>رقم الشاسيه: <span className="font-mono">{vehicle.vin || 'غير مسجل'}</span></span>
              </p>
            </div>
          </div>

          <Link
            to={`/workshop/job-cards?action=new`}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-md shadow-brand-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>فتح أمر إصلاح لهذه السيارة</span>
          </Link>
        </div>

        {/* Key Metrics Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <span className="text-slate-400 block font-medium">العداد الحالي:</span>
            <span className="font-bold text-slate-900 text-sm font-mono mt-0.5 block">
              {vehicle.currentOdometer.toLocaleString()} كم
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">آخر تاريخ صيانة:</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">
              {vehicle.lastServiceDate ? new Date(vehicle.lastServiceDate).toLocaleDateString('ar-SA') : 'اليوم'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">إجمالي مرات الدخول للورشة:</span>
            <span className="font-bold text-brand-600 text-sm font-mono mt-0.5 block">
              {vehicle.repairOrders?.length || 0} مرات
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">إجمالي الإنفاق:</span>
            <span className="font-bold text-emerald-600 text-sm font-mono mt-0.5 block">
              {(vehicle.salesInvoices?.reduce((sum: number, i: any) => sum + i.grandTotal, 0) || 0).toLocaleString()} ر.س
            </span>
          </div>
        </div>
      </div>

      {/* 2. Tabs Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center overflow-x-auto border-b border-slate-200 bg-slate-50/50 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-700 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Tab 1: Service History Timeline */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">الجدول الزمني لأعمال الصيانة السابقة</h3>
              <div className="relative border-r-2 border-slate-200 pr-4 mr-2 space-y-6">
                {vehicle.repairOrders?.map((ro: any) => (
                  <div key={ro.id} className="relative">
                    {/* Timeline Node */}
                    <div className="absolute -right-[23px] top-1 w-3.5 h-3.5 rounded-full bg-brand-600 border-2 border-white"></div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <Link
                          to={`/workshop/job-cards/${ro.id}`}
                          className="font-bold text-sm text-brand-700 hover:underline font-mono"
                        >
                          {ro.orderNumber}
                        </Link>
                        <span className="text-xs text-slate-500 font-mono">
                          {new Date(ro.createdAt).toLocaleDateString('ar-SA')} • {ro.currentOdometer.toLocaleString()} كم
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 font-medium">
                        <strong>الشكوى:</strong> {ro.customerComplaint}
                      </p>
                      <div className="text-[11px] text-slate-500 flex items-center gap-4">
                        <span>الفني: {ro.technician?.name || 'فني الورشة'}</span>
                        <span>•</span>
                        <span>الإجمالي: <strong className="text-slate-900">{ro.grandTotal} ر.س</strong></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: Job Cards Table */}
          {activeTab === 'job_cards' && (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">رقم الأمر</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">العداد</th>
                    <th className="p-3">الشكوى</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">الإجمالي</th>
                    <th className="p-3 text-center">عرض</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {vehicle.repairOrders?.map((ro: any) => (
                    <tr key={ro.id}>
                      <td className="p-3 font-mono font-bold text-brand-700">{ro.orderNumber}</td>
                      <td className="p-3 text-slate-500 font-mono">
                        {new Date(ro.createdAt).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="p-3 font-mono">{ro.currentOdometer.toLocaleString()} كم</td>
                      <td className="p-3 max-w-xs truncate">{ro.customerComplaint}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100">
                          {ro.status}
                        </span>
                      </td>
                      <td className="p-3 font-bold">{ro.grandTotal} ر.س</td>
                      <td className="p-3 text-center">
                        <Link
                          to={`/workshop/job-cards/${ro.id}`}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 rounded font-bold text-[11px]"
                        >
                          التفاصيل
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 3: Replaced Parts */}
          {activeTab === 'parts' && (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">تاريخ الاستبدال</th>
                    <th className="p-3">رقم أمر الإصلاح</th>
                    <th className="p-3">اسم قطعة الغيار</th>
                    <th className="p-3">الكود SKU</th>
                    <th className="p-3">الكمية</th>
                    <th className="p-3">السعر</th>
                    <th className="p-3">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {replacedParts && replacedParts.length > 0 ? (
                    replacedParts.map((p: any, i: number) => (
                      <tr key={i}>
                        <td className="p-3 text-slate-500 font-mono">
                          {new Date(p.date).toLocaleDateString('ar-SA')}
                        </td>
                        <td className="p-3 font-mono font-bold text-brand-700">{p.orderNumber}</td>
                        <td className="p-3 font-bold text-slate-800">{p.partName}</td>
                        <td className="p-3 font-mono text-slate-400">{p.sku}</td>
                        <td className="p-3 font-bold">{p.quantity}</td>
                        <td className="p-3">{p.unitPrice} ر.س</td>
                        <td className="p-3 font-bold text-slate-900">{p.total} ر.س</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        لا توجد سجلات لقطع مستبدلة لهذه السيارة حتى الآن.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 4: Services Performed */}
          {activeTab === 'services' && (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">رقم الأمر</th>
                    <th className="p-3">الخدمة المنفذة</th>
                    <th className="p-3">ساعات العمل</th>
                    <th className="p-3">أجور اليد</th>
                    <th className="p-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {performedServices && performedServices.length > 0 ? (
                    performedServices.map((s: any, i: number) => (
                      <tr key={i}>
                        <td className="p-3 text-slate-500 font-mono">
                          {new Date(s.date).toLocaleDateString('ar-SA')}
                        </td>
                        <td className="p-3 font-mono font-bold text-brand-700">{s.orderNumber}</td>
                        <td className="p-3 font-bold text-slate-800">{s.serviceName}</td>
                        <td className="p-3 font-mono">{s.hours} ساعة</td>
                        <td className="p-3 font-bold text-slate-900">{s.total} ر.س</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        لا توجد خدمات مسجلة لهذه السيارة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 5: Invoices */}
          {activeTab === 'invoices' && (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">رقم الفاتورة</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">النوع</th>
                    <th className="p-3">الإجمالي شامل الضريبة</th>
                    <th className="p-3">طريقة الدفع</th>
                    <th className="p-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {vehicle.salesInvoices?.map((inv: any) => (
                    <tr key={inv.id}>
                      <td className="p-3 font-mono font-bold text-brand-700">{inv.invoiceNumber}</td>
                      <td className="p-3 text-slate-500 font-mono">
                        {new Date(inv.date).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="p-3">{inv.invoiceType}</td>
                      <td className="p-3 font-bold text-slate-900">{inv.grandTotal} ر.س</td>
                      <td className="p-3 font-semibold">{inv.paymentMethod}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 6: Specs */}
          {activeTab === 'specs' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs max-w-2xl bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div>
                <span className="text-slate-400 block font-medium">الماركة والشركة المصنعة:</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">{vehicle.make}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">الموديل والطراز:</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">{vehicle.model}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">سنة الصنع:</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">{vehicle.year}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">اللون الخارجي:</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">{vehicle.color || 'أبيض'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">نوع المحرك والوقود:</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                  {vehicle.engineType || 'بنزين'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">رقم المحرك:</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block font-mono">
                  {vehicle.engineNumber || 'قياسي'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
