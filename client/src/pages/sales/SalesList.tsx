import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Receipt,
  Search,
  Plus,
  Car,
  User,
  Calendar,
  DollarSign,
  Printer,
  RotateCcw,
  Eye,
  X,
  Check,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const SalesList: React.FC = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  const [searchParams] = useSearchParams();
  const { success, error } = useToast();

  useEffect(() => {
    const typeParam = searchParams.get('type');
    if (typeParam) setTypeFilter(typeParam);
    loadInvoices();
  }, [searchParams]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.getSalesInvoices();
      setInvoices(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReturnInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    try {
      const itemsToReturn = selectedInvoice.items
        .filter((it: any) => it.itemType === 'PART' && it.itemId)
        .map((it: any) => ({
          itemId: it.itemId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        }));

      if (itemsToReturn.length === 0) {
        error('لا توجد قطع غيار قابلة للإرجاع في هذه الفاتورة');
        return;
      }

      await api.createSalesReturn({
        salesInvoiceId: selectedInvoice.id,
        items: itemsToReturn,
        reason: returnReason,
      });

      success('تم اعتماد مرتجع المبيعات وإعادة القطع للمخزون بنجاح!');
      setReturnModalOpen(false);
      loadInvoices();
    } catch (err: any) {
      error(err.message || 'فشل إتمام المرتجع');
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesType = typeFilter === 'ALL' || inv.invoiceType === typeFilter;
    const matchesQuery =
      !searchQuery ||
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.customer && inv.customer.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inv.vehicle && inv.vehicle.plateNumber.includes(searchQuery));
    return matchesType && matchesQuery;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-brand-600" />
            <span>سجل فواتير المبيعات والصيانة (Invoices & Billing)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            كافة الفواتير الصادرة: كاشير قطع الغيار، فواتير صيانة الورشة المعتمدة، وفواتير الحسابات الآجلة
          </p>
        </div>

        <Link
          to="/pos"
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>نقطة بيع سريعة (POS)</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {[
              { key: 'ALL', label: 'كافة الفواتير' },
              { key: 'POS', label: 'كاشير قطع الغيار (POS)' },
              { key: 'MAINTENANCE', label: 'فواتير صيانة الورشة' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTypeFilter(t.key)}
                className={`px-4 py-2 rounded-lg transition-all ${
                  typeFilter === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-80 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث برقم الفاتورة، العميل، اللوحة..."
              className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-brand-500 outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <tr>
                <th className="p-3.5">رقم الفاتورة</th>
                <th className="p-3.5">النوع</th>
                <th className="p-3.5">العميل</th>
                <th className="p-3.5">السيارة</th>
                <th className="p-3.5">الإجمالي</th>
                <th className="p-3.5">المدفوع</th>
                <th className="p-3.5">طريقة الدفع</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">التاريخ</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-brand-700">{inv.invoiceNumber}</td>
                  <td className="p-3.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        inv.invoiceType === 'MAINTENANCE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {inv.invoiceType === 'MAINTENANCE' ? 'صيانة ورشة' : 'كاشير POS'}
                    </span>
                  </td>
                  <td className="p-3.5 font-bold text-slate-900">
                    {inv.customer ? inv.customer.name : 'عميل نقدي سريع'}
                  </td>
                  <td className="p-3.5 font-mono">
                    {inv.vehicle ? (
                      <span className="bg-slate-100 px-2 py-0.5 rounded font-bold">
                        {inv.vehicle.plateNumber}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="p-3.5 font-black text-slate-900 font-mono">
                    {inv.grandTotal.toLocaleString()} ر.س
                  </td>
                  <td className="p-3.5 font-mono text-emerald-600">{inv.paidAmount.toLocaleString()} ر.س</td>
                  <td className="p-3.5 font-semibold text-slate-600">{inv.paymentMethod}</td>
                  <td className="p-3.5">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {inv.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                    {new Date(inv.date).toLocaleDateString('ar-SA')}
                  </td>
                  <td className="p-3.5 text-center flex items-center justify-center gap-1">
                    <button
                      onClick={() => setSelectedInvoice(inv)}
                      className="p-1.5 bg-slate-100 hover:bg-brand-50 hover:text-brand-600 rounded-lg"
                      title="معاينة الفاتورة"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {inv.status !== 'RETURNED' && (
                      <button
                        onClick={() => {
                          setSelectedInvoice(inv);
                          setReturnModalOpen(true);
                        }}
                        className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg"
                        title="مرتجع مبيعات"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && !returnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  فاتورة ضريبية: {selectedInvoice.invoiceNumber}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  التاريخ: {new Date(selectedInvoice.date).toLocaleString('ar-SA')}
                </p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div>
                العميل: <strong>{selectedInvoice.customer?.name || 'نقدي'}</strong>
              </div>
              {selectedInvoice.vehicle && (
                <div>
                  السيارة:{' '}
                  <strong>
                    {selectedInvoice.vehicle.make} {selectedInvoice.vehicle.model} (
                    {selectedInvoice.vehicle.plateNumber})
                  </strong>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500">
                  <tr>
                    <th className="p-2">البيان / الصنف</th>
                    <th className="p-2">الكمية</th>
                    <th className="p-2">السعر</th>
                    <th className="p-2">الضريبة</th>
                    <th className="p-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {selectedInvoice.items?.map((it: any) => (
                    <tr key={it.id}>
                      <td className="p-2 font-bold text-slate-800">
                        {it.description || it.item?.nameAr}
                      </td>
                      <td className="p-2 font-mono">{it.quantity}</td>
                      <td className="p-2 font-mono">{it.unitPrice} ر.س</td>
                      <td className="p-2 font-mono">{it.taxAmount.toFixed(2)} ر.س</td>
                      <td className="p-2 font-bold font-mono">{it.total.toFixed(2)} ر.س</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1 text-left font-bold">
              <div>المجموع الفرعي: {selectedInvoice.subtotal.toLocaleString()} ر.س</div>
              <div>الضريبة (15%): {selectedInvoice.taxAmount.toFixed(2)} ر.س</div>
              <div className="text-brand-700 text-sm font-black pt-1 border-t border-slate-200">
                الإجمالي الكلي: {selectedInvoice.grandTotal.toFixed(2)} ر.س
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الفاتورة الضريبية</span>
              </button>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 bg-slate-100 font-bold rounded-xl text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Return Modal (Section 8) */}
      {returnModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                <span>مرتجع مبيعات للفاتورة {selectedInvoice.invoiceNumber}</span>
              </h3>
              <button onClick={() => setReturnModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReturnInvoice} className="space-y-4 text-xs">
              <p className="text-slate-500">
                سيتم إرجاع كافة قطع الغيار الواردة بالفاتورة إلى المخزون وتعديل الأثر المالي تلقائياً.
              </p>

              <div>
                <label className="block font-bold text-slate-700 mb-1">سبب الإرجاع *</label>
                <textarea
                  rows={3}
                  required
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="مثلاً: القطعة غير مطابقة لرغبة العميل، تم الإرجاع بحالة سليمة..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md shadow-rose-600/20"
                >
                  تأكيد المرتجع وإعادة القطع للمخزن
                </button>
                <button
                  type="button"
                  onClick={() => setReturnModalOpen(false)}
                  className="px-4 py-3 bg-slate-100 font-bold rounded-xl text-xs"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
