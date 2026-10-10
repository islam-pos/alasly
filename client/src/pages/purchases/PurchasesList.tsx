import React, { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useSearchParams } from 'react-router-dom';
import {
  ShoppingCart,
  Search,
  Barcode,
  Camera,
  Plus,
  Building2,
  Calendar,
  Package,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  X,
  Check,
  Download,
  Printer,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { exportToExcel, exportToPdf, formatExportDate } from '../../utils/exports';

export const PurchasesList: React.FC = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [shortageModalOpen, setShortageModalOpen] = useState(false);
  const [shortageQuantities, setShortageQuantities] = useState<Record<string, number>>({});
  const [shortageSubmitting, setShortageSubmitting] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');

  // New Invoice Form
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CREDIT');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([
    { itemId: '', quantity: 10, unitPrice: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const barcodeReadRef = useRef(false);

  const [searchParams] = useSearchParams();
  const { success, error } = useToast();

  useEffect(() => {
    loadData();
    if (searchParams.get('action') === 'new') {
      setModalOpen(true);
    }
  }, [searchParams]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, supRes, whRes, itRes, requestRes] = await Promise.all([
        api.getPurchaseInvoices(),
        api.getSuppliers(),
        api.getWarehouses(),
        api.getItems(),
        api.getPurchaseRequests(),
      ]);
      setInvoices(invRes.data);
      setSuppliers(supRes.data);
      setWarehouses(whRes.data);
      setItems(itRes.data);
      setPurchaseRequests(requestRes.data);
      if (supRes.data.length > 0) setSelectedSupplierId(supRes.data[0].id);
      if (whRes.data.length > 0) setSelectedWarehouseId(whRes.data[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItemRow = () => {
    setInvoiceItems((prev) => [...prev, { itemId: '', quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveItemRow = (idx: number) => {
    setInvoiceItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: string, val: any) => {
    setInvoiceItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (field === 'itemId') {
          const found = items.find((it) => it.id === val);
          return {
            ...row,
            itemId: val,
            unitPrice: found ? found.purchasePrice : row.unitPrice,
          };
        }
        return { ...row, [field]: val };
      })
    );
  };

  const handleBarcodeValue = async (value: string) => {
    const code = value.trim();
    if (!code) return;

    try {
      const item = await api.lookupItemByBarcode(code);
      setInvoiceItems((current) => {
        const existingRow = current.find((row) => row.itemId === item.id);
        if (existingRow) {
          return current.map((row) =>
            row.itemId === item.id ? { ...row, quantity: (Number(row.quantity) || 0) + 1 } : row,
          );
        }

        const emptyRowIndex = current.findIndex((row) => !row.itemId);
        const newRow = { itemId: item.id, quantity: 1, unitPrice: item.purchasePrice || 0 };
        if (emptyRowIndex === -1) return [...current, newRow];
        return current.map((row, index) => index === emptyRowIndex ? newRow : row);
      });
      setBarcodeInput('');
      success(`تمت إضافة ${item.nameAr} إلى الفاتورة`);
    } catch (err: any) {
      error(err.message || 'لم يتم العثور على صنف بهذا الباركود أو الكود');
    }
  };

  useEffect(() => {
    if (!cameraScannerOpen || !videoRef.current) return;

    let cancelled = false;
    barcodeReadRef.current = false;
    setCameraError('');
    const reader = new BrowserMultiFormatReader();

    reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } },
      videoRef.current,
      (result, _scanError, controls) => {
        if (cancelled || !result || barcodeReadRef.current) return;
        barcodeReadRef.current = true;
        controls.stop();
        scannerControlsRef.current = null;
        setCameraScannerOpen(false);
        void handleBarcodeValue(result.getText());
      },
    ).then((controls) => {
      if (cancelled) {
        controls.stop();
      } else {
        scannerControlsRef.current = controls;
      }
    }).catch((scanError: unknown) => {
      if (!cancelled) {
        setCameraError(
          scanError instanceof Error
            ? scanError.message
            : 'تعذر تشغيل الكاميرا. تحقق من السماح باستخدامها ومن اتصال آمن (HTTPS).',
        );
      }
    });

    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [cameraScannerOpen]);

  const closeCameraScanner = () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setCameraScannerOpen(false);
  };

  const closeInvoiceModal = () => {
    closeCameraScanner();
    setModalOpen(false);
  };

  const subtotal = invoiceItems.reduce(
    (sum, it) => sum + (parseFloat(it.unitPrice) || 0) * (parseInt(it.quantity) || 0),
    0
  );
  const taxAmount = (subtotal * 15) / 100;
  const grandTotal = subtotal + taxAmount;

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !selectedWarehouseId || invoiceItems.length === 0) {
      error('يرجى اختيار المورد والمخزن وإضافة الأصناف');
      return;
    }

    const validItems = invoiceItems.filter((i) => i.itemId && i.quantity > 0);
    if (validItems.length === 0) {
      error('يرجى اختيار صنف صالح وكمية صحيحة');
      return;
    }

    setSubmitting(true);
    try {
      const createdInvoice = await api.createPurchaseInvoice({
        supplierId: selectedSupplierId,
        warehouseId: selectedWarehouseId,
        supplierInvoiceNumber: supplierInvoiceNo,
        paymentMethod,
        paidAmount,
        items: validItems,
      });

      success('تم اعتماد فاتورة المشتريات وزيادة رصيد المخزن بنجاح!');
      if (createdInvoice.whatsappNotification?.sent) {
        success('تم إرسال نسخة PDF للمورد عبر واتساب');
      } else if (createdInvoice.whatsappNotification?.reason === 'not_configured') {
        error('لم تُرسل الفاتورة: إعدادات WhatsApp Cloud API غير مكتملة');
      } else if (createdInvoice.whatsappNotification?.reason === 'no_supplier_or_opt_in') {
        error('لم تُرسل الفاتورة: رقم واتساب المورد أو موافقته على الاستلام غير مسجل');
      } else if (createdInvoice.whatsappNotification?.error) {
        error(`تعذر إرسال فاتورة المورد عبر واتساب: ${createdInvoice.whatsappNotification.error}`);
      }
      setModalOpen(false);
      setInvoiceItems([{ itemId: '', quantity: 10, unitPrice: 0 }]);
      setSupplierInvoiceNo('');
      loadData();
    } catch (err: any) {
      error(err.message || 'فشل اعتماد فاتورة المشتريات');
    } finally {
      setSubmitting(false);
    }
  };

  const lowStockItems = items.filter((item) =>
    item.isLowStock || (Number(item.totalQuantity) || 0) <= (Number(item.minStock) || 0),
  );

  const openShortageRequest = () => {
    setShortageQuantities(Object.fromEntries(lowStockItems.map((item) => [
      item.id,
      Math.max(1, (Number(item.maxStock) || Number(item.minStock) || 1) - (Number(item.totalQuantity) || 0)),
    ])));
    setShortageModalOpen(true);
  };

  const handleCreateShortageRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    const requestItems = lowStockItems
      .filter((item) => Number.isInteger(shortageQuantities[item.id]) && shortageQuantities[item.id] > 0)
      .map((item) => ({
        itemId: item.id,
        quantity: shortageQuantities[item.id],
        estimatedPrice: item.purchasePrice || 0,
      }));
    if (!selectedSupplierId || !selectedWarehouseId || requestItems.length === 0) {
      error('اختر المورد والمخزن وحدد كمية لصنف ناقص واحد على الأقل');
      return;
    }

    setShortageSubmitting(true);
    try {
      const request = await api.createPurchaseRequest({
        supplierId: selectedSupplierId,
        warehouseId: selectedWarehouseId,
        reason: 'نواقص المخزون',
        notes: 'طلب نواقص تم إنشاؤه من شاشة المشتريات',
        items: requestItems,
      });
      setShortageModalOpen(false);
      loadData();
      if (request.whatsappNotification?.sent) {
        success(`تم إنشاء الطلب وإرساله للمورد عبر واتساب (${request.requestNumber})`);
      } else {
        error(`تم إنشاء الطلب ${request.requestNumber} لكن لم يُرسل عبر واتساب: ${
          request.whatsappNotification?.error
          || (request.whatsappNotification?.reason === 'not_configured'
            ? 'إعدادات WhatsApp Cloud API غير مكتملة'
            : 'رقم واتساب المورد أو موافقته على الرسائل غير مسجل')
        }`);
      }
    } catch (err: any) {
      error(err.message || 'فشل إنشاء طلب النواقص');
    } finally {
      setShortageSubmitting(false);
    }
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.supplier?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.supplierInvoiceNumber && inv.supplierInvoiceNumber.includes(searchQuery))
  );

  const exportInvoices = (format: 'excel' | 'pdf') => {
    const headers = ['رقم الفاتورة', 'المورد', 'رقم فاتورة المورد', 'المستودع', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'];
    const rows = filteredInvoices.map((invoice) => [
      invoice.invoiceNumber,
      invoice.supplier?.name || '',
      invoice.supplierInvoiceNumber || '',
      invoice.warehouse?.name || '',
      formatExportDate(invoice.date),
      invoice.grandTotal,
      invoice.paidAmount,
      invoice.remainingAmount,
      invoice.status,
    ]);
    if (format === 'excel') {
      exportToExcel('فواتير-المشتريات', rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))));
    } else {
      exportToPdf('فواتير المشتريات', headers, rows);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-brand-600" />
            <span>إدارة المشتريات وفواتير الموردين (Purchases & PO)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            تسجيل شحنات قطع الغيار الواردة، زيادة المخزون تلقائياً، وتحديث متوسط التكلفة وحسابات الموردين
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={openShortageRequest}
            disabled={!lowStockItems.length}
            className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800 disabled:opacity-50"
          >
            <Package className="h-4 w-4" /> طلب النواقص من مورد
          </button>
          <button onClick={() => exportInvoices('excel')} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white">
            <Download className="h-4 w-4" /> Excel
          </button>
          <button onClick={() => exportInvoices('pdf')} className="flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-bold text-white">
            <Printer className="h-4 w-4" /> PDF
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>فاتورة مشتريات جديدة</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="w-full sm:w-80 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الفاتورة، اسم المورد..."
            className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-brand-500 outline-none"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <tr>
                <th className="p-3.5">رقم الفاتورة</th>
                <th className="p-3.5">المورد</th>
                <th className="p-3.5">فاتورة المورد</th>
                <th className="p-3.5">المستودع المستلم</th>
                <th className="p-3.5">الإجمالي شامل الضريبة</th>
                <th className="p-3.5">المدفوع</th>
                <th className="p-3.5">المتبقي</th>
                <th className="p-3.5">طريقة الدفع</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    جاري تحميل فواتير المشتريات...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400">
                    لا توجد فواتير مشتريات
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-brand-700">{inv.invoiceNumber}</td>
                    <td className="p-3.5 font-bold text-slate-900">{inv.supplier?.name}</td>
                    <td className="p-3.5 font-mono text-slate-500">{inv.supplierInvoiceNumber || '-'}</td>
                    <td className="p-3.5 text-slate-600">{inv.warehouse?.name}</td>
                    <td className="p-3.5 font-black text-slate-900 font-mono">
                      {inv.grandTotal.toLocaleString()} ج.م
                    </td>
                    <td className="p-3.5 font-mono text-emerald-600">{inv.paidAmount.toLocaleString()} ج.م</td>
                    <td className="p-3.5 font-mono text-rose-600">{inv.remainingAmount.toLocaleString()} ج.م</td>
                    <td className="p-3.5 font-semibold text-slate-600">{inv.paymentMethod}</td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                      {new Date(inv.date).toLocaleDateString('ar-SA')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {shortageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleCreateShortageRequest} className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="font-bold text-slate-900">إرسال طلب نواقص لمورد</h2>
                <p className="mt-1 text-xs text-slate-500">تُجمع الأصناف تحت حد المخزون، ويمكن تعديل كميات الطلب.</p>
              </div>
              <button type="button" onClick={() => setShortageModalOpen(false)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                <span className="mb-1 block">المورد</span>
                <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)} className="w-full rounded-xl border px-3 py-2">
                  <option value="">اختر المورد</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                <span className="mb-1 block">المخزن</span>
                <select value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)} className="w-full rounded-xl border px-3 py-2">
                  <option value="">اختر المخزن</option>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
              </label>
            </div>
            <div className="max-h-80 overflow-auto rounded-xl border">
              <table className="w-full text-right text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr><th className="p-3">الصنف</th><th className="p-3">المتاح</th><th className="p-3">حد الطلب</th><th className="p-3">كمية الطلب</th></tr>
                </thead>
                <tbody className="divide-y">
                  {lowStockItems.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3 font-semibold">{item.nameAr}</td>
                      <td className="p-3">{item.totalQuantity || 0}</td>
                      <td className="p-3">{item.minStock}</td>
                      <td className="p-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={shortageQuantities[item.id] || 0}
                          onChange={(e) => setShortageQuantities((current) => ({
                            ...current,
                            [item.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                          }))}
                          className="w-24 rounded-lg border px-2 py-1 text-center"
                        />
                      </td>
                    </tr>
                  ))}
                  {!lowStockItems.length && <tr><td colSpan={4} className="p-6 text-center text-slate-500">لا توجد أصناف تحت حد الطلب.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <button type="button" onClick={() => setShortageModalOpen(false)} className="rounded-xl border px-4 py-2 text-sm">إلغاء</button>
              <button type="submit" disabled={shortageSubmitting || !lowStockItems.length} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {shortageSubmitting ? 'جارٍ إنشاء وإرسال الطلب...' : 'إنشاء وإرسال الطلب'}
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">طلبات النواقص المرسلة للموردين</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="p-3">رقم الطلب</th>
                <th className="p-3">المورد</th>
                <th className="p-3">المخزن</th>
                <th className="p-3">عدد الأصناف</th>
                <th className="p-3">حالة الطلب</th>
                <th className="p-3">رد المورد</th>
                <th className="p-3">تاريخ الطلب</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {purchaseRequests.slice(0, 20).map((request) => (
                <tr key={request.id}>
                  <td className="p-3 font-mono font-bold">{request.requestNumber}</td>
                  <td className="p-3">{request.supplier?.name || 'غير محدد'}</td>
                  <td className="p-3">{request.warehouse?.name || '-'}</td>
                  <td className="p-3">{request.items?.length || 0}</td>
                  <td className="p-3">{request.status}</td>
                  <td className="p-3">
                    {request.supplierResponse === 'ACCEPTED'
                      ? 'وافق المورد'
                      : request.supplierResponse === 'DECLINED'
                        ? 'اعتذر المورد'
                        : 'بانتظار رد المورد'}
                  </td>
                  <td className="p-3">{new Date(request.createdAt).toLocaleDateString('ar-EG')}</td>
                </tr>
              ))}
              {!purchaseRequests.length && (
                <tr><td colSpan={7} className="p-5 text-center text-slate-500">لا توجد طلبات نواقص بعد.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* New Purchase Invoice Modal (Section 5) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-brand-600" />
                <span>تسجيل فاتورة مشتريات واستلام بضاعة</span>
              </h3>
              <button type="button" onClick={closeInvoiceModal} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المورد *</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">المستودع المستلم *</label>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم فاتورة المورد</label>
                  <input
                    type="text"
                    value={supplierInvoiceNo}
                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                    placeholder="INV-XXXX"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              {/* Items Rows */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-800">الأصناف المشتراة والكميات:</div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <div className="relative min-w-48 flex-1 sm:flex-none">
                      <input
                        type="text"
                        value={barcodeInput}
                        onChange={(event) => setBarcodeInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void handleBarcodeValue(barcodeInput);
                          }
                        }}
                        aria-label="إدخال باركود الصنف"
                        placeholder="امسح الباركود ثم اضغط Enter"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-9 font-mono text-xs outline-none focus:border-brand-500"
                      />
                      <Barcode className="absolute right-3 top-2 h-4 w-4 text-slate-400" />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleBarcodeValue(barcodeInput)}
                      disabled={!barcodeInput.trim()}
                      className="flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                    >
                      <Barcode className="h-4 w-4" />
                      إضافة بالكود
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraScannerOpen(true)}
                      className="flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      <Camera className="h-4 w-4" />
                      مسح بالكاميرا
                    </button>
                  </div>
                </div>
                {invoiceItems.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={row.itemId}
                      onChange={(e) => handleItemChange(idx, 'itemId', e.target.value)}
                      required
                      className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="">-- اختر قطعة الغيار --</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.nameAr} ({it.sku})
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) =>
                        handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)
                      }
                      placeholder="الكمية"
                      className="w-20 p-2 bg-slate-50 border border-slate-200 rounded-xl text-center font-mono font-bold"
                    />

                    <input
                      type="number"
                      value={row.unitPrice}
                      onChange={(e) =>
                        handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)
                      }
                      placeholder="سعر الشراء"
                      className="w-24 p-2 bg-slate-50 border border-slate-200 rounded-xl text-center font-mono font-bold"
                    />

                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(idx)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة سطر صنف آخر
                </button>
              </div>

              {/* Totals & Payment method */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span>المجموع الفرعي:</span>
                  <span className="font-bold">{subtotal.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span>ضريبة القيمة المضافة (15%):</span>
                  <span className="font-bold">{taxAmount.toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between text-brand-700 font-black text-sm pt-2 border-t border-slate-200">
                  <span>الإجمالي النهائي:</span>
                  <span>{grandTotal.toFixed(2)} ج.م</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">طريقة السداد</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="CREDIT">آجل (على حساب المورد)</option>
                    <option value="CASH">نقداً فوري</option>
                    <option value="BANK">تحويل بنكي</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">المبلغ المسدد الآن (ج.م)</label>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-500/20"
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>اعتماد الفاتورة وتحديث المخزون والمالية</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {cameraScannerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="font-bold text-slate-900">قراءة باركود صنف المشتريات</h2>
                <p className="mt-1 text-xs text-slate-500">وجّه الكاميرا نحو الباركود حتى تتم إضافته إلى الفاتورة</p>
              </div>
              <button
                type="button"
                onClick={closeCameraScanner}
                aria-label="إغلاق قارئ الكاميرا"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <video
                ref={videoRef}
                className="aspect-video w-full rounded-xl bg-black object-cover"
                muted
                playsInline
              />
              {cameraError && (
                <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  {cameraError}
                </p>
              )}
              <p className="text-xs text-slate-500">
                يلزم السماح بالوصول للكاميرا، ويجب فتح النظام عبر HTTPS أو localhost.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
