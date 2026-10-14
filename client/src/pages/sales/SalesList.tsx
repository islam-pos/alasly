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
  Download,
  FileText,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { exportToExcel, exportToPdf, formatExportDate } from '../../utils/exports';
import { printSalesInvoice } from '../../utils/invoicePrint';

export const SalesList: React.FC = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [quotationModalOpen, setQuotationModalOpen] = useState(false);
  const [quotationLoading, setQuotationLoading] = useState(false);
  const [quotationSaving, setQuotationSaving] = useState(false);
  const [quotationSearch, setQuotationSearch] = useState('');
  const [quotationProducts, setQuotationProducts] = useState<any[]>([]);
  const [quotationCustomers, setQuotationCustomers] = useState<any[]>([]);
  const [quotationCustomerId, setQuotationCustomerId] = useState('');
  const [quotationDiscount, setQuotationDiscount] = useState(0);
  const [quotationNotes, setQuotationNotes] = useState('');
  const [quotationCart, setQuotationCart] = useState<any[]>([]);
  const [convertingQuotationId, setConvertingQuotationId] = useState<string | null>(null);
  const [selectedQuotationForConversion, setSelectedQuotationForConversion] = useState<any>(null);
  const [conversionPaymentMethod, setConversionPaymentMethod] = useState<'CASH' | 'CARD' | 'CREDIT' | 'SPLIT'>('CASH');
  const [conversionCashPaid, setConversionCashPaid] = useState(0);
  const [conversionCardPaid, setConversionCardPaid] = useState(0);

  const [searchParams] = useSearchParams();
  const { success, error } = useToast();

  useEffect(() => {
    const typeParam = searchParams.get('type');
    if (typeParam) setTypeFilter(typeParam);
    loadInvoices();
  }, [searchParams]);

  useEffect(() => {
    api.master.getCompany()
      .then((response) => setCompany(response.data))
      .catch((err: any) => error(err.message || 'تعذر تحميل إعدادات الطباعة'));
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.getSalesInvoices();
      setInvoices(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openQuotationModal = async () => {
    setQuotationModalOpen(true);
    setQuotationLoading(true);
    try {
      const [itemsRes, customersRes] = await Promise.all([api.getItems(), api.getCustomers()]);
      setQuotationProducts(itemsRes.data || []);
      setQuotationCustomers(customersRes.data || []);
    } catch (loadError: any) {
      error(loadError.message || 'تعذر تحميل الأصناف والعملاء لإنشاء عرض السعر');
    } finally {
      setQuotationLoading(false);
    }
  };

  const addQuotationProduct = (product: any) => {
    setQuotationCart((current) => {
      const existing = current.find((line) => line.itemId === product.id);
      if (existing) {
        return current.map((line) => line.itemId === product.id
          ? { ...line, quantity: line.quantity + 1 }
          : line);
      }
      return [...current, {
        itemId: product.id,
        name: product.nameAr,
        sku: product.sku,
        unitPrice: Number(product.sellPrice || 0),
        quantity: 1,
      }];
    });
    setQuotationSearch('');
  };

  const createQuotation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (quotationCart.length === 0) {
      error('أضف صنفاً واحداً على الأقل إلى عرض السعر');
      return;
    }
    try {
      setQuotationSaving(true);
      const response = await api.createSalesQuotation({
        customerId: quotationCustomerId || null,
        items: quotationCart.map(({ itemId, quantity, unitPrice }) => ({ itemId, quantity, unitPrice })),
        discount: quotationDiscount,
        notes: quotationNotes,
      });
      success(`تم إنشاء عرض السعر ${response.invoiceNumber} دون خصم المخزون`);
      setQuotationModalOpen(false);
      setQuotationCart([]);
      setQuotationDiscount(0);
      setQuotationNotes('');
      setQuotationCustomerId('');
      setQuotationSearch('');
      setTypeFilter('QUOTATION');
      await loadInvoices();
    } catch (createError: any) {
      error(createError.message || 'تعذر إنشاء عرض السعر');
    } finally {
      setQuotationSaving(false);
    }
  };

  const convertQuotation = async (quotation: any) => {
    setSelectedQuotationForConversion(quotation);
    setConversionPaymentMethod('CASH');
    setConversionCashPaid(quotation.grandTotal);
    setConversionCardPaid(0);
  };

  const submitQuotationConversion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedQuotationForConversion) return;
    const cashPaid = conversionPaymentMethod === 'CASH'
      ? selectedQuotationForConversion.grandTotal
      : conversionPaymentMethod === 'SPLIT' ? conversionCashPaid : 0;
    const cardPaid = conversionPaymentMethod === 'CARD'
      ? selectedQuotationForConversion.grandTotal
      : conversionPaymentMethod === 'SPLIT' ? conversionCardPaid : 0;
    if (cashPaid < 0 || cardPaid < 0 || cashPaid + cardPaid > selectedQuotationForConversion.grandTotal) {
      error('مبالغ التحصيل تتجاوز إجمالي عرض السعر');
      return;
    }
    try {
      setConvertingQuotationId(selectedQuotationForConversion.id);
      const invoice = await api.convertSalesQuotation(selectedQuotationForConversion.id, {
        paymentMethod: conversionPaymentMethod,
        cashPaid,
        cardPaid,
      });
      success(`تم تحويل عرض السعر إلى الفاتورة ${invoice.invoiceNumber}`);
      setSelectedQuotationForConversion(null);
      await loadInvoices();
    } catch (convertError: any) {
      error(convertError.message || 'تعذر تحويل عرض السعر إلى فاتورة');
    } finally {
      setConvertingQuotationId(null);
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

  const exportInvoices = (format: 'excel' | 'pdf') => {
    const headers = ['رقم الفاتورة', 'التاريخ', 'العميل', 'نوع الفاتورة', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'];
    const rows = filteredInvoices.map((invoice) => [
      invoice.invoiceNumber,
      formatExportDate(invoice.date),
      invoice.customer?.name || 'عميل نقدي',
      invoice.invoiceType,
      invoice.grandTotal,
      invoice.paidAmount,
      invoice.remainingAmount,
      invoice.status,
    ]);
    if (format === 'excel') {
      exportToExcel('فواتير-المبيعات', rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))));
    } else {
      exportToPdf('فواتير المبيعات', headers, rows);
    }
  };

  const handlePrintInvoice = (invoice: any) => {
    try {
      const result = printSalesInvoice(invoice, company, company?.printSettings);
      if (result === 'blocked') error('يرجى السماح بالنوافذ المنبثقة لطباعة الفاتورة');
    } catch (printError: any) {
      error(printError.message || 'تعذرت طباعة الفاتورة');
    }
  };

  const quotationSubtotal = quotationCart.reduce(
    (total, line) => total + line.quantity * line.unitPrice,
    0,
  );
  const quotationTaxable = Math.max(0, quotationSubtotal - quotationDiscount);
  const quotationTotal = quotationTaxable;
  const matchingQuotationProducts = quotationSearch.trim()
    ? quotationProducts.filter((product) => [
      product.nameAr,
      product.sku,
      product.barcode,
      product.partNumber,
    ].some((value) => String(value || '').toLocaleLowerCase().includes(quotationSearch.trim().toLocaleLowerCase()))).slice(0, 8)
    : [];

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

        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportInvoices('excel')} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white">
            <Download className="h-4 w-4" /> Excel
          </button>
          <button onClick={() => exportInvoices('pdf')} className="flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-bold text-white">
            <Printer className="h-4 w-4" /> PDF
          </button>
          <button
            type="button"
            onClick={() => void openQuotationModal()}
            className="flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-700/20 hover:bg-blue-800"
          >
            <FileText className="h-4 w-4" /> عرض سعر جديد
          </button>
          <Link
            to="/pos"
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>نقطة بيع سريعة (POS)</span>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {[
              { key: 'ALL', label: 'كافة الفواتير' },
              { key: 'QUOTATION', label: 'عروض الأسعار' },
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
                        inv.invoiceType === 'QUOTATION'
                          ? 'bg-blue-100 text-blue-800'
                          : inv.invoiceType === 'MAINTENANCE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {inv.invoiceType === 'QUOTATION' ? 'عرض سعر' : inv.invoiceType === 'MAINTENANCE' ? 'صيانة ورشة' : 'كاشير POS'}
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
                    {inv.grandTotal.toLocaleString()} ج.م
                  </td>
                  <td className="p-3.5 font-mono text-emerald-600">{inv.paidAmount.toLocaleString()} ج.م</td>
                  <td className="p-3.5 font-semibold text-slate-600">{inv.paymentMethod}</td>
                  <td className="p-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      inv.status === 'DRAFT' ? 'bg-blue-100 text-blue-800'
                        : inv.status === 'CONVERTED' ? 'bg-violet-100 text-violet-800'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {inv.status === 'DRAFT' ? 'عرض سعر' : inv.status === 'CONVERTED' ? `محوّل إلى ${inv.convertedInvoice?.invoiceNumber || 'فاتورة'}` : inv.status}
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
                    {inv.invoiceType === 'QUOTATION' && inv.status === 'DRAFT' && (
                      <button
                        type="button"
                        disabled={convertingQuotationId === inv.id}
                        onClick={() => void convertQuotation(inv)}
                        className="rounded-lg bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        title="تحويل عرض السعر إلى فاتورة"
                      >
                        {convertingQuotationId === inv.id ? <span className="text-[10px]">...</span> : <FileText className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {inv.invoiceType !== 'QUOTATION' && inv.status !== 'RETURNED' && (
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

      {selectedQuotationForConversion && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={submitQuotationConversion} className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">تحويل عرض السعر إلى فاتورة</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedQuotationForConversion.invoiceNumber} · الإجمالي {Number(selectedQuotationForConversion.grandTotal).toFixed(2)} ج.م</p>
              </div>
              <button type="button" onClick={() => setSelectedQuotationForConversion(null)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <label className="block text-sm font-bold text-slate-700">
              طريقة السداد
              <select value={conversionPaymentMethod} onChange={(event) => setConversionPaymentMethod(event.target.value as typeof conversionPaymentMethod)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <option value="CASH">نقدي</option>
                <option value="CARD">بطاقة</option>
                <option value="CREDIT">آجل</option>
                <option value="SPLIT">مقسم (نقدي وبطاقة)</option>
              </select>
            </label>
            {conversionPaymentMethod === 'SPLIT' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">المبلغ النقدي
                  <input type="number" min="0" step="0.01" value={conversionCashPaid} onChange={(event) => setConversionCashPaid(Number(event.target.value) || 0)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5" />
                </label>
                <label className="text-sm font-bold text-slate-700">المبلغ بالبطاقة
                  <input type="number" min="0" step="0.01" value={conversionCardPaid} onChange={(event) => setConversionCardPaid(Number(event.target.value) || 0)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5" />
                </label>
              </div>
            )}
            <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              عند التأكيد سيتحقق النظام من توفر المخزون ويخصم الأصناف، ثم يصدر الفاتورة ويسجل الدفعة المختارة.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSelectedQuotationForConversion(null)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600">إلغاء</button>
              <button type="submit" disabled={convertingQuotationId === selectedQuotationForConversion.id} className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{convertingQuotationId ? 'جارٍ التحويل...' : 'تأكيد التحويل وإصدار الفاتورة'}</button>
            </div>
          </form>
        </div>
      )}

      {quotationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={createQuotation} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><FileText className="h-5 w-5 text-blue-700" /> إنشاء عرض سعر</h2>
                <p className="mt-1 text-xs text-slate-500">عرض السعر لا يحجز ولا يخصم الأصناف من المخزون.</p>
              </div>
              <button type="button" onClick={() => setQuotationModalOpen(false)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <label className="block text-sm font-bold text-slate-700">
                العميل
                <select value={quotationCustomerId} onChange={(event) => setQuotationCustomerId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <option value="">عميل نقدي / غير محدد</option>
                  {quotationCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>

              <div className="relative">
                <label className="mb-1 block text-sm font-bold text-slate-700">إضافة صنف بالاسم أو الكود أو الباركود</label>
                <div className="relative">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="search"
                    value={quotationSearch}
                    onChange={(event) => setQuotationSearch(event.target.value)}
                    placeholder="ابحث عن صنف..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-10 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                {matchingQuotationProducts.length > 0 && (
                  <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                    {matchingQuotationProducts.map((product) => (
                      <button key={product.id} type="button" onClick={() => addQuotationProduct(product)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-right text-sm last:border-0 hover:bg-blue-50">
                        <span><span className="font-bold text-slate-800">{product.nameAr}</span><span className="mr-2 font-mono text-xs text-slate-400">{product.sku}</span></span>
                        <span className="shrink-0 font-bold text-brand-700">{Number(product.sellPrice || 0).toLocaleString()} ج.م</span>
                      </button>
                    ))}
                  </div>
                )}
                {quotationLoading && <p className="mt-2 text-xs text-slate-500">جارٍ تحميل الأصناف والعملاء...</p>}
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">الصنف</th><th className="p-3">الكمية</th><th className="p-3">سعر الوحدة</th><th className="p-3">الإجمالي</th><th className="p-3" /></tr></thead>
                  <tbody>
                    {quotationCart.map((line) => (
                      <tr key={line.itemId} className="border-t border-slate-100">
                        <td className="p-3 font-semibold">{line.name}<span className="mr-2 font-mono text-xs text-slate-400">{line.sku}</span></td>
                        <td className="p-3"><input aria-label={`كمية ${line.name}`} type="number" min="1" step="1" value={line.quantity} onChange={(event) => setQuotationCart((current) => current.map((item) => item.itemId === line.itemId ? { ...item, quantity: Math.max(1, Number(event.target.value) || 1) } : item))} className="w-20 rounded-lg border border-slate-200 p-1.5" /></td>
                        <td className="p-3"><input aria-label={`سعر ${line.name}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setQuotationCart((current) => current.map((item) => item.itemId === line.itemId ? { ...item, unitPrice: Math.max(0, Number(event.target.value) || 0) } : item))} className="w-28 rounded-lg border border-slate-200 p-1.5" /></td>
                        <td className="p-3 font-bold">{(line.quantity * line.unitPrice).toLocaleString()} ج.م</td>
                        <td className="p-3"><button type="button" onClick={() => setQuotationCart((current) => current.filter((item) => item.itemId !== line.itemId))} title="حذف الصنف" className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"><X className="h-4 w-4" /></button></td>
                      </tr>
                    ))}
                    {quotationCart.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">ابحث وأضف الأصناف إلى عرض السعر</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">الخصم (ج.م)
                  <input type="number" min="0" step="0.01" value={quotationDiscount} onChange={(event) => setQuotationDiscount(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5" />
                </label>
                <label className="text-sm font-bold text-slate-700">ملاحظات
                  <input value={quotationNotes} onChange={(event) => setQuotationNotes(event.target.value)} maxLength={500} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5" />
                </label>
              </div>
              <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex justify-between"><span>المجموع قبل الخصم</span><strong>{quotationSubtotal.toLocaleString()} ج.م</strong></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-black text-brand-700"><span>الإجمالي</span><strong>{quotationTotal.toFixed(2)} ج.م</strong></div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <button type="button" onClick={() => setQuotationModalOpen(false)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600">إلغاء</button>
              <button type="submit" disabled={quotationSaving || quotationLoading || quotationCart.length === 0} className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{quotationSaving ? 'جارٍ الحفظ...' : 'حفظ عرض السعر'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && !returnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {selectedInvoice.invoiceType === 'QUOTATION' ? 'عرض سعر' : 'فاتورة'}: {selectedInvoice.invoiceNumber}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  التاريخ: {new Date(selectedInvoice.date).toLocaleString('ar-EG')}
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
                      <td className="p-2 font-mono">{it.unitPrice} ج.م</td>
                      <td className="p-2 font-bold font-mono">{it.total.toFixed(2)} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1 text-left font-bold">
              <div>المجموع الفرعي: {selectedInvoice.subtotal.toLocaleString()} ج.م</div>
              <div className="text-brand-700 text-sm font-black pt-1 border-t border-slate-200">
                الإجمالي الكلي: {selectedInvoice.grandTotal.toFixed(2)} ج.م
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => handlePrintInvoice(selectedInvoice)}
                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>{selectedInvoice.invoiceType === 'QUOTATION' ? 'طباعة عرض السعر' : 'طباعة الفاتورة الضريبية'}</span>
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
