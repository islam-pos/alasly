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
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: '',
    company: '',
    phone: '',
    mobile: '',
    taxNumber: '',
    paymentTermsDays: 30,
    creditLimit: 50000,
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
      setSuppliers(res);
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
        taxNumber: '',
        paymentTermsDays: 30,
        creditLimit: 50000,
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
      setStatementModalOpen(true);
    } catch (err: any) {
      error(err.message || 'فشل تحميل كشف حساب المورد');
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
                  </td>
                  <td className="p-3.5 font-mono text-slate-600">{s.phone}</td>
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
                <label className="block font-bold text-slate-700 mb-1">الرقم الضريبي</label>
                <input
                  type="text"
                  value={formData.taxNumber}
                  onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                  placeholder="3XXXXXXXXXXXXXX"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

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
      {statementModalOpen && selectedStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  كشف حساب المورد: {selectedStatement.supplier.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  كود: {selectedStatement.supplier.code} • هاتف: {selectedStatement.supplier.phone}
                </p>
              </div>
              <button onClick={() => setStatementModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
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
            </div>

            {/* Invoices List */}
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="p-2.5">رقم الفاتورة</th>
                    <th className="p-2.5">التاريخ</th>
                    <th className="p-2.5">الإجمالي</th>
                    <th className="p-2.5">المدفوع</th>
                    <th className="p-2.5">المتبقي</th>
                    <th className="p-2.5">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {selectedStatement.supplier.purchaseInvoices?.map((inv: any) => (
                    <tr key={inv.id}>
                      <td className="p-2.5 font-mono font-bold text-brand-700">{inv.invoiceNumber}</td>
                      <td className="p-2.5 font-mono text-slate-500">
                        {new Date(inv.date).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="p-2.5 font-bold font-mono">{inv.grandTotal} ر.س</td>
                      <td className="p-2.5 font-mono text-emerald-600">{inv.paidAmount} ر.س</td>
                      <td className="p-2.5 font-mono text-rose-600">{inv.remainingAmount} ر.س</td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
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
