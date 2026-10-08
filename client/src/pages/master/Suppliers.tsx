import React, { useState, useEffect } from 'react';
import {
  Building2,
  Search,
  Plus,
  Phone,
  FileSpreadsheet,
  Calendar,
  X,
  Check,
  Download,
  Printer,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { exportToExcel, exportToPdf, formatExportDate, formatExportNumber } from '../../utils/exports';

export const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<any>(null);
  const [allStatements, setAllStatements] = useState<any[] | null>(null);
  const [whatsappEdits, setWhatsappEdits] = useState<Record<string, { number: string; optIn: boolean }>>({});
  const [savingWhatsappId, setSavingWhatsappId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    company: '',
    phone: '',
    mobile: '',
    whatsappNumber: '',
    whatsappOptIn: false,
    taxNumber: '',
    paymentTermsDays: 30,
    creditLimit: 50000,
    alsoCustomer: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const { success, error } = useToast();

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const res = await api.getSuppliers();
      setSuppliers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      error('اسم المورد ورقم الهاتف حقول إلزامية');
      return;
    }

    setSubmitting(true);
    try {
      await api.createSupplier(formData);
      success('تمت إضافة المورد بنجاح');
      setModalOpen(false);
      setFormData({
        name: '',
        company: '',
        phone: '',
        mobile: '',
        whatsappNumber: '',
        whatsappOptIn: false,
        taxNumber: '',
        paymentTermsDays: 30,
        creditLimit: 50000,
        alsoCustomer: false,
      });
      loadSuppliers();
    } catch (err: any) {
      error(err.message || 'فشل حفظ المورد');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewStatement = async (supplierId: string) => {
    try {
      const res = await api.getSupplierStatement(supplierId);
      setSelectedStatement(res);
      setAllStatements(null);
      setStatementModalOpen(true);
    } catch (err: any) {
      error(err.message || 'فشل تحميل كشف حساب المورد');
    }
  };

  const saveSupplierWhatsapp = async (supplier: any) => {
    const values = whatsappEdits[supplier.id] || {
      number: supplier.whatsappNumber || '',
      optIn: Boolean(supplier.whatsappOptIn),
    };
    try {
      setSavingWhatsappId(supplier.id);
      const response = await api.updateSupplier(supplier.id, {
        whatsappNumber: values.number || null,
        whatsappOptIn: values.optIn,
      });
      setSuppliers((current) => current.map((entry) => entry.id === supplier.id
        ? { ...entry, ...response.data }
        : entry));
      setWhatsappEdits((current) => {
        const next = { ...current };
        delete next[supplier.id];
        return next;
      });
      success('تم حفظ رقم واتساب المورد');
    } catch (err: any) {
      error(err.message || 'تعذر حفظ رقم واتساب المورد');
    } finally {
      setSavingWhatsappId(null);
    }
  };

  const handleViewAllStatements = async () => {
    try {
      const res = await api.getAllSupplierStatements();
      setAllStatements(res.data.suppliers);
      setSelectedStatement(null);
      setStatementModalOpen(true);
    } catch (err: any) {
      error(err.message || 'فشل تحميل كشوف حساب الموردين');
    }
  };

  const statementRows = (statements: any[]) =>
    statements.flatMap((supplier) => {
      let balance = supplier.openingBalance || 0;
      return [
        ...(supplier.openingBalance
          ? [[supplier.name, '', '', 'رصيد افتتاحي', supplier.openingBalance, 0, balance]]
          : []),
        ...(supplier.statement || []).map((transaction: any) => {
          balance += (transaction.debit || 0) - (transaction.credit || 0);
          return [
            supplier.name,
            formatExportDate(transaction.date),
            transaction.number,
            transaction.type,
            transaction.debit || 0,
            transaction.credit || 0,
            balance,
          ];
        }),
      ];
    });

  const exportStatements = (format: 'excel' | 'pdf') => {
    const statements = allStatements || (selectedStatement ? [selectedStatement.supplier] : []);
    const rows = statementRows(statements);
    const headers = ['المورد', 'التاريخ', 'رقم المستند', 'البيان', 'مدين', 'دائن', 'الرصيد'];
    if (format === 'excel') {
      exportToExcel('كشف-حساب-الموردين', rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))));
    } else {
      exportToPdf('كشف حساب الموردين', headers, rows);
    }
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.company && s.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone.includes(searchQuery)
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand-600" />
            <span>سجل الموردين والشركات الموردة (Suppliers Master)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة الموردين، شروط السداد، المديونيات، ومتابعة فواتير المشتريات
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مورد جديد</span>
        </button>
        <button
          onClick={handleViewAllStatements}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>كشف حساب الموردين</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="w-full sm:w-80 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث باسم المورد، الشركة، الجوال..."
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
                <th className="p-3.5">كود المورد</th>
                <th className="p-3.5">اسم المورد / الشركة</th>
                <th className="p-3.5">الهاتف والجوال</th>
                <th className="p-3.5">واتساب وموافقة الإرسال</th>
                <th className="p-3.5">الرقم الضريبي</th>
                <th className="p-3.5">مدة السداد</th>
                <th className="p-3.5">الرصيد المستحق (AP)</th>
                <th className="p-3.5">فواتير الشراء</th>
                <th className="p-3.5 text-center">كشف الحساب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredSuppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-slate-700">{s.code}</td>
                  <td className="p-3.5">
                    <div className="font-bold text-slate-900">{s.name}</div>
                    {s.company && <div className="text-[11px] text-slate-400">{s.company}</div>}
                    {s.customer && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">مورد وعميل</span>}
                  </td>
                  <td className="p-3.5 font-mono text-slate-600">{s.phone}</td>
                  <td className="p-3.5">
                    {(() => {
                      const values = whatsappEdits[s.id] || {
                        number: s.whatsappNumber || '',
                        optIn: Boolean(s.whatsappOptIn),
                      };
                      return (
                        <div className="flex min-w-48 flex-col gap-1">
                          <input
                            type="tel"
                            value={values.number}
                            onChange={(event) => setWhatsappEdits((current) => ({
                              ...current,
                              [s.id]: { ...values, number: event.target.value },
                            }))}
                            placeholder="+201XXXXXXXXX"
                            dir="ltr"
                            className="rounded-md border px-2 py-1 font-mono"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-1 text-[10px]">
                              <input
                                type="checkbox"
                                checked={values.optIn}
                                onChange={(event) => setWhatsappEdits((current) => ({
                                  ...current,
                                  [s.id]: { ...values, optIn: event.target.checked },
                                }))}
                              />
                              وافق على الرسائل
                            </label>
                            <button
                              type="button"
                              disabled={savingWhatsappId === s.id}
                              onClick={() => saveSupplierWhatsapp(s)}
                              className="rounded bg-blue-50 px-2 py-1 font-bold text-blue-700 disabled:opacity-50"
                            >
                              حفظ
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-3.5 font-mono text-slate-500">{s.taxNumber || '-'}</td>
                  <td className="p-3.5 font-mono">{s.paymentTermsDays} يوم</td>
                  <td className="p-3.5">
                    <span
                      className={`font-bold font-mono text-xs ${
                        s.currentBalance > 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {s.currentBalance.toLocaleString()} ر.س
                    </span>
                  </td>
                  <td className="p-3.5 font-bold text-brand-700">
                    {s._count?.purchaseInvoices || 0} فاتورة
                  </td>
                  <td className="p-3.5 text-center">
                    <button
                      onClick={() => handleViewStatement(s.id)}
                      className="px-3 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold rounded-lg text-xs"
                    >
                      كشف حساب
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Supplier Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-brand-600" />
                <span>إضافة مورد جديد</span>
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المورد *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="شركة الزيوت أو وكالة قطع الغيار"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الشركة التجارية</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="اسم المؤسسة التجارية"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الهاتف *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="011XXXXXXX"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">مدة السداد (أيام)</label>
                  <input
                    type="number"
                    value={formData.paymentTermsDays}
                    onChange={(e) =>
                      setFormData({ ...formData, paymentTermsDays: parseInt(e.target.value) || 30 })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم واتساب المورد</label>
                <input
                  type="tel"
                  value={formData.whatsappNumber}
                  onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                  placeholder="+201XXXXXXXXX"
                  dir="ltr"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={formData.whatsappOptIn} onChange={(e) => setFormData({ ...formData, whatsappOptIn: e.target.checked })} className="h-4 w-4" />
                وافق المورد على استلام طلبات الشراء والفواتير عبر واتساب
              </label>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الرقم الضريبي</label>
                <input
                  type="text"
                  value={formData.taxNumber}
                  onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                  placeholder="3XXXXXXXXXXXXXX"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.alsoCustomer}
                  onChange={(e) => setFormData({ ...formData, alsoCustomer: e.target.checked })}
                  className="h-4 w-4 accent-brand-600"
                />
                تسجيل هذا المورد كعميل أيضًا
              </label>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ المورد</span>
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

      {/* Supplier Statement Modal */}
      {statementModalOpen && (selectedStatement || allStatements) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {allStatements ? 'كشف حساب جميع الموردين' : `كشف حساب المورد: ${selectedStatement.supplier.name}`}
                </h3>
                {!allStatements && <p className="text-xs text-slate-400 mt-0.5">
                  كود: {selectedStatement.supplier.code} • هاتف: {selectedStatement.supplier.phone}
                </p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => exportStatements('excel')} title="تنزيل Excel" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50"><Download className="h-4 w-4" /></button>
                <button onClick={() => exportStatements('pdf')} title="تنزيل PDF" className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"><Printer className="h-4 w-4" /></button>
                <button onClick={() => setStatementModalOpen(false)} className="text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Summary Cards */}
            {!allStatements && <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block font-medium">إجمالي المشتريات:</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block font-mono">
                  {selectedStatement.totalPurchases.toLocaleString()} ر.س
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">إجمالي المسدد:</span>
                <span className="font-bold text-emerald-600 text-sm mt-0.5 block font-mono">
                  {selectedStatement.totalPaid.toLocaleString()} ر.س
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">الرصيد المستحق الحالي:</span>
                <span className="font-bold text-rose-600 text-sm mt-0.5 block font-mono">
                  {selectedStatement.totalRemaining.toLocaleString()} ر.س
                </span>
              </div>
            </div>}

            {/* Invoices List */}
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    {allStatements && <th className="p-2.5">المورد</th>}
                    <th className="p-2.5">التاريخ</th>
                    <th className="p-2.5">رقم المستند</th>
                    <th className="p-2.5">البيان</th>
                    <th className="p-2.5">مدين</th>
                    <th className="p-2.5">دائن</th>
                    <th className="p-2.5">الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(allStatements || [selectedStatement.supplier]).flatMap((supplier: any) => {
                    let balance = supplier.openingBalance || 0;
                    const openingRow = balance ? [<tr key={`${supplier.id}-opening`}>
                      {allStatements && <td className="p-2.5 font-bold">{supplier.name}</td>}
                      <td className="p-2.5">-</td>
                      <td className="p-2.5">-</td>
                      <td className="p-2.5">رصيد افتتاحي</td>
                      <td className="p-2.5 font-mono">{formatExportNumber(balance)}</td>
                      <td className="p-2.5 font-mono">{formatExportNumber(0)}</td>
                      <td className="p-2.5 font-mono font-bold">{formatExportNumber(balance)} ر.س</td>
                    </tr>] : [];
                    const transactions = (supplier.statement || []).map((transaction: any) => {
                      balance += (transaction.debit || 0) - (transaction.credit || 0);
                      return <tr key={`${supplier.id}-${transaction.id}`}>
                        {allStatements && <td className="p-2.5 font-bold">{supplier.name}</td>}
                        <td className="p-2.5 font-mono text-slate-500">{formatExportDate(transaction.date)}</td>
                        <td className="p-2.5 font-mono font-bold text-brand-700">{transaction.number}</td>
                        <td className="p-2.5">{transaction.type}</td>
                        <td className="p-2.5 font-mono">{formatExportNumber(transaction.debit)}</td>
                        <td className="p-2.5 font-mono">{formatExportNumber(transaction.credit)}</td>
                        <td className="p-2.5 font-mono font-bold">{formatExportNumber(balance)} ر.س</td>
                      </tr>;
                    });
                    return [...openingRow, ...transactions];
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setStatementModalOpen(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
