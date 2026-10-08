import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShoppingCart,
  Search,
  Plus,
  Building2,
  Calendar,
  Package,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  X,
  Check,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const PurchasesList: React.FC = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

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
      const [invRes, supRes, whRes, itRes] = await Promise.all([
        api.getPurchaseInvoices(),
        api.getSuppliers(),
        api.getWarehouses(),
        api.getItems(),
      ]);
      setInvoices(invRes.data);
      setSuppliers(supRes.data);
      setWarehouses(whRes.data);
      setItems(itRes.data);
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
      await api.createPurchaseInvoice({
        supplierId: selectedSupplierId,
        warehouseId: selectedWarehouseId,
        supplierInvoiceNumber: supplierInvoiceNo,
        paymentMethod,
        paidAmount,
        items: validItems,
      });

      success('تم اعتماد فاتورة المشتريات وزيادة رصيد المخزن بنجاح!');
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

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.supplier?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.supplierInvoiceNumber && inv.supplierInvoiceNumber.includes(searchQuery))
  );

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

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>فاتورة مشتريات جديدة</span>
        </button>
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
                      {inv.grandTotal.toLocaleString()} ر.س
                    </td>
                    <td className="p-3.5 font-mono text-emerald-600">{inv.paidAmount.toLocaleString()} ر.س</td>
                    <td className="p-3.5 font-mono text-rose-600">{inv.remainingAmount.toLocaleString()} ر.س</td>
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

      {/* New Purchase Invoice Modal (Section 5) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-brand-600" />
                <span>تسجيل فاتورة مشتريات واستلام بضاعة</span>
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400">
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
                <div className="font-bold text-slate-800">الأصناف المشتراة والكميات:</div>
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
                  <span className="font-bold">{subtotal.toLocaleString()} ر.س</span>
                </div>
                <div className="flex justify-between">
                  <span>ضريبة القيمة المضافة (15%):</span>
                  <span className="font-bold">{taxAmount.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between text-brand-700 font-black text-sm pt-2 border-t border-slate-200">
                  <span>الإجمالي النهائي:</span>
                  <span>{grandTotal.toFixed(2)} ر.س</span>
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
                  <label className="block font-bold text-slate-700 mb-1">المبلغ المسدد الآن (ر.س)</label>
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
    </div>
  );
};
