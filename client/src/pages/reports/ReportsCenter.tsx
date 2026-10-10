import React, { useState, useEffect } from 'react';
import { 
  BarChart3, TrendingUp, Boxes, Wrench, Download, 
  Printer, Calendar, Filter, FileText, CheckCircle2, 
  DollarSign, Package, Car
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { exportToExcel, exportToPdf, formatExportDate } from '../../utils/exports';

export const ReportsCenter: React.FC = () => {
  const { showToast } = useToast();
  const [activeReport, setActiveReport] = useState<'sales' | 'inventory' | 'workshop'>('sales');
  const [loading, setLoading] = useState(false);

  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');

  // Report Data states
  const [salesReport, setSalesReport] = useState<any>({ invoices: [], summary: {} });
  const [inventoryReport, setInventoryReport] = useState<any>({ items: [], summary: {} });
  const [workshopReport, setWorkshopReport] = useState<any>({ jobCards: [], summary: {} });
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const loadWarehouses = async () => {
    try {
      const res = await api.master.getWarehouses();
      setWarehouses(res.data);
    } catch (err) {}
  };

  const fetchActiveReport = async () => {
    setLoading(true);
    try {
      if (activeReport === 'sales') {
        const res = await api.reports.getSalesReport({ fromDate, toDate });
        setSalesReport(res.data);
      } else if (activeReport === 'inventory') {
        const res = await api.reports.getInventoryReport({ warehouseId: selectedWarehouse });
        setInventoryReport(res.data);
      } else if (activeReport === 'workshop') {
        const res = await api.reports.getWorkshopReport({ fromDate, toDate });
        setWorkshopReport(res.data);
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تحميل بيانات التقرير', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    fetchActiveReport();
  }, [activeReport, fromDate, toDate, selectedWarehouse]);

  const getReportExport = () => {
    if (activeReport === 'sales') {
      return {
        title: 'تقرير المبيعات والفواتير',
        headers: ['رقم الفاتورة', 'التاريخ', 'العميل', 'النوع', 'المجموع', 'الضريبة', 'الخصم', 'الصافي', 'المدفوع', 'المتبقي'],
        rows: salesReport.invoices.map((inv: any) => [inv.invoiceNumber, formatExportDate(inv.date), inv.customer?.name || 'نقدي', inv.invoiceType, inv.subtotal, inv.taxAmount, inv.discount, inv.grandTotal, inv.paidAmount, inv.remainingAmount]),
      };
    }
    if (activeReport === 'inventory') {
      return {
        title: 'تقرير تقييم المخزون والأصناف',
        headers: ['الصنف', 'الباركود', 'التصنيف', 'الكمية', 'حد الطلب', 'سعر التكلفة', 'سعر البيع', 'قيمة التكلفة', 'قيمة البيع'],
        rows: inventoryReport.items.map((it: any) => [it.name, it.barcode || '', it.category, it.quantity, it.minStock, it.avgCost, it.sellPrice, it.costValue, it.sellValue]),
      };
    }
    return {
      title: 'تقرير أداء الورشة وأوامر الإصلاح',
      headers: ['رقم الأمر', 'التاريخ', 'العميل', 'السيارة', 'اللوحة', 'الفني', 'قطع الغيار', 'أجور اليد', 'الإجمالي', 'الحالة'],
      rows: workshopReport.jobCards.map((j: any) => [j.orderNumber, formatExportDate(j.createdAt), j.customer?.name, `${j.vehicle?.make || ''} ${j.vehicle?.model || ''}`, j.vehicle?.plateNumber, j.technician?.name || '-', j.totalParts, j.totalLabor, j.grandTotal, j.status]),
    };
  };

  const exportReport = (format: 'excel' | 'pdf') => {
    const report = getReportExport();
    if (format === 'excel') {
      exportToExcel(`تقرير-${activeReport}`, report.rows.map((row: unknown[]) => Object.fromEntries(report.headers.map((header, index) => [header, row[index] ?? '']))));
    } else {
      exportToPdf(report.title, report.headers, report.rows);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            مركز التقارير والإحصائيات
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            تقارير تفصيلية للمبيعات، تقييم المخزون، وأداء الورشة مع إمكانية التصدير والطباعة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportReport('excel')}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition"
          >
            <Download className="w-4 h-4" />
            تنزيل Excel
          </button>
          <button
            onClick={() => exportReport('pdf')}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition"
          >
            <Printer className="w-4 h-4" />
            تنزيل PDF
          </button>
        </div>
      </div>

      {/* Report Switcher & Filters */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 gap-2 pb-2">
          <button
            onClick={() => setActiveReport('sales')}
            className={`pb-3 px-5 font-bold text-sm border-b-2 flex items-center gap-2 transition ${
              activeReport === 'sales' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            تقرير المبيعات والفواتير
          </button>
          <button
            onClick={() => setActiveReport('inventory')}
            className={`pb-3 px-5 font-bold text-sm border-b-2 flex items-center gap-2 transition ${
              activeReport === 'inventory' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Boxes className="w-4 h-4" />
            تقرير تقييم المخزون والأصناف
          </button>
          <button
            onClick={() => setActiveReport('workshop')}
            className={`pb-3 px-5 font-bold text-sm border-b-2 flex items-center gap-2 transition ${
              activeReport === 'workshop' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wrench className="w-4 h-4" />
            تقرير أداء الورشة وأوامر الإصلاح
          </button>
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {activeReport !== 'inventory' ? (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-semibold">من تاريخ:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="border rounded-xl px-3 py-1.5 text-xs bg-slate-50 outline-none"
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-semibold">إلى تاريخ:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="border rounded-xl px-3 py-1.5 text-xs bg-slate-50 outline-none"
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">المستودع:</span>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-xs bg-slate-50 outline-none"
              >
                <option value="">جميع المستودعات</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}

          {(fromDate || toDate || selectedWarehouse) && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); setSelectedWarehouse(''); }}
              className="text-xs text-rose-600 hover:underline font-semibold pr-2"
            >
              إلغاء التصفية
            </button>
          )}
        </div>
      </div>

      {/* Report 1: Sales Report */}
      {activeReport === 'sales' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">عدد الفواتير الصادرة</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{salesReport.summary?.count || 0} فاتورة</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">إجمالي المبيعات (شامل الضريبة)</span>
              <div className="text-2xl font-black text-blue-700 mt-1">{(salesReport.summary?.totalSales || 0).toLocaleString()} ج.م</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">ضريبة القيمة المضافة المحصلة</span>
              <div className="text-2xl font-black text-slate-800 mt-1">{(salesReport.summary?.totalTax || 0).toLocaleString()} ج.م</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">إجمالي المبالغ المحصلة</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">{(salesReport.summary?.totalPaid || 0).toLocaleString()} ج.م</div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">رقم الفاتورة</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">العميل</th>
                  <th className="py-3 px-4">نوع الفاتورة</th>
                  <th className="py-3 px-4 text-left">المجموع قبل الضريبة</th>
                  <th className="py-3 px-4 text-left">الضريبة 15%</th>
                  <th className="py-3 px-4 text-left font-bold text-slate-900">المبلغ الإجمالي</th>
                  <th className="py-3 px-4 text-center">طريقة الدفع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesReport.invoices?.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono font-bold text-blue-600">{inv.invoiceNumber}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{new Date(inv.date).toLocaleDateString('ar-SA')}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{inv.customer?.name || 'عميل نقدي'}</td>
                    <td className="py-3 px-4 text-xs">
                      <span className="bg-slate-100 px-2 py-0.5 rounded font-semibold text-slate-700">
                        {inv.invoiceType === 'WORKSHOP' ? 'أمر صيانة' : inv.invoiceType === 'POS' ? 'كاشير POS' : 'مبيعات'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-left font-mono">{inv.subtotal?.toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 text-left font-mono text-slate-500">{inv.taxAmount?.toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 text-left font-mono font-black text-slate-900">{inv.grandTotal?.toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-xs px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700">
                        {inv.paymentMethod === 'CASH' ? 'نقدي' : inv.paymentMethod === 'CARD' ? 'مدى' : 'تحويل'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 2: Inventory Valuation Report */}
      {activeReport === 'inventory' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">إجمالي عدد القطع بالمخزن</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{inventoryReport.summary?.totalStockQty?.toLocaleString() || 0} وحدة</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">القيمة الإجمالية بسعر التكلفة</span>
              <div className="text-2xl font-black text-blue-700 mt-1">{(inventoryReport.summary?.totalValuationCost || 0).toLocaleString()} ج.م</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">القيمة التقديرية بسعر البيع</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">{(inventoryReport.summary?.totalValuationSell || 0).toLocaleString()} ج.م</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">الربح المتوقع عند البيع</span>
              <div className="text-2xl font-black text-purple-700 mt-1">{(inventoryReport.summary?.expectedProfit || 0).toLocaleString()} ج.م</div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">الصنف</th>
                  <th className="py-3 px-4">التصنيف</th>
                  <th className="py-3 px-4 text-center">الرصيد المتاح</th>
                  <th className="py-3 px-4 text-left">متوسط التكلفة</th>
                  <th className="py-3 px-4 text-left">سعر البيع</th>
                  <th className="py-3 px-4 text-left">إجمالي التكلفة</th>
                  <th className="py-3 px-4 text-left font-bold text-slate-900">إجمالي البيع</th>
                  <th className="py-3 px-4 text-center">حالة المخزون</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventoryReport.items?.map((it: any) => (
                  <tr key={it.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{it.name}</div>
                      <div className="text-xs font-mono text-slate-400">{it.sku}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{it.category}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">{it.quantity} {it.unit}</td>
                    <td className="py-3 px-4 text-left font-mono">{it.avgCost?.toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 text-left font-mono font-semibold text-slate-800">{it.sellPrice?.toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 text-left font-mono text-blue-700">{it.costValue?.toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 text-left font-mono font-bold text-emerald-700">{it.sellValue?.toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        it.isLow ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {it.isLow ? 'منخفض' : 'متوفر'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 3: Workshop Performance Report */}
      {activeReport === 'workshop' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">إجمالي أوامر الإصلاح</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{workshopReport.summary?.totalOrders || 0} أمر</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">إيرادات الورشة الكلية</span>
              <div className="text-2xl font-black text-blue-700 mt-1">{(workshopReport.summary?.totalRevenue || 0).toLocaleString()} ج.م</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">إيرادات شغل اليد (أجور الفحص والتركيب)</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">{(workshopReport.summary?.totalLaborRevenue || 0).toLocaleString()} ج.م</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">متوسط قيمة أمر الصيانة</span>
              <div className="text-2xl font-black text-purple-700 mt-1">{(workshopReport.summary?.avgOrderValue || 0).toLocaleString()} ج.م</div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">رقم الأمر</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">المركبة والعميل</th>
                  <th className="py-3 px-4">الفني المسؤول</th>
                  <th className="py-3 px-4 text-left">قطع الغيار</th>
                  <th className="py-3 px-4 text-left">أجور اليد</th>
                  <th className="py-3 px-4 text-left font-bold text-slate-900">الإجمالي</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workshopReport.jobCards?.map((j: any) => (
                  <tr key={j.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono font-bold text-blue-600">{j.orderNumber}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{new Date(j.createdAt).toLocaleDateString('ar-SA')}</td>
                    <td className="py-3 px-4 text-xs">
                      <div className="font-bold text-slate-800">{j.vehicle?.make} {j.vehicle?.model} ({j.vehicle?.plateNumber})</div>
                      <div className="text-slate-400">{j.customer?.name}</div>
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-700">{j.technician?.name || '-'}</td>
                    <td className="py-3 px-4 text-left font-mono">{j.totalParts?.toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 text-left font-mono text-emerald-700 font-semibold">{j.totalLabor?.toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 text-left font-mono font-black text-slate-900">{j.grandTotal?.toLocaleString()} ج.م</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        j.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-800' : 
                        j.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {j.status === 'CLOSED' ? 'مكتمل ومفوتر' : j.status === 'IN_PROGRESS' ? 'قيد العمل' : 'استلام'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
