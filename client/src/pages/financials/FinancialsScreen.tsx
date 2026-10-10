import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Wallet, DollarSign, ArrowUpRight, ArrowDownLeft, 
  Building2, Receipt, Plus, Printer, CheckCircle2, 
  Clock, AlertCircle, X
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PrintModal, CashVoucherPrint } from '../../components/common/PrintTemplates';
import { exportToExcel, exportToPdf, formatExportDate } from '../../utils/exports';

export const FinancialsScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canManageExpenses = hasPermission('manage_expenses');
  const canManageCashbox = hasPermission('manage_cashbox');
  const canManageBanks = hasPermission('manage_banks');
  const [activeTab, setActiveTab] = useState<'expenses' | 'revenues' | 'cashbox' | 'shifts' | 'banks'>('expenses');

  // Data states
  const [expenses, setExpenses] = useState<any[]>([]);
  const [revenues, setRevenues] = useState<any[]>([]);
  const [cashTransactions, setCashTransactions] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [cashboxes, setCashboxes] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Print voucher modal
  const [selectedVoucherForPrint, setSelectedVoucherForPrint] = useState<any>(null);

  // Modals
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false);
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [selectedShiftToClose, setSelectedShiftToClose] = useState<any>(null);

  // Forms
  const [expenseForm, setExpenseForm] = useState({
    categoryId: '',
    beneficiary: '',
    amount: '',
    taxAmount: '0',
    paymentMethod: 'CASH',
    cashboxId: '',
    bankId: '',
    description: ''
  });

  const [revenueForm, setRevenueForm] = useState({
    categoryId: '',
    source: '',
    amount: '',
    paymentMethod: 'CASH',
    cashboxId: '',
    bankId: '',
    description: ''
  });

  const [voucherForm, setVoucherForm] = useState({
    type: 'RECEIPT', // RECEIPT or PAYMENT
    cashboxId: '',
    amount: '',
    partyName: '',
    description: ''
  });

  const [closeShiftForm, setCloseShiftForm] = useState({
    actualCash: '',
    differenceReason: '',
    notes: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const empty = { data: [] };
      const [eRes, rRes, cRes, sRes, bRes, cbRes, expCatRes] = await Promise.all([
        canManageExpenses ? api.financials.getExpenses() : Promise.resolve(empty),
        canManageExpenses ? api.financials.getRevenues() : Promise.resolve(empty),
        canManageCashbox ? api.financials.getCashTransactions() : Promise.resolve(empty),
        canManageCashbox ? api.financials.getCashShifts() : Promise.resolve(empty),
        canManageBanks ? api.financials.getBanks() : Promise.resolve(empty),
        canManageCashbox ? api.financials.getCashboxes() : Promise.resolve(empty),
        canManageExpenses ? api.financials.getExpenseCategories() : Promise.resolve(empty)
      ]);
      setExpenses(eRes.data);
      setRevenues(rRes.data);
      setCashTransactions(cRes.data);
      setShifts(sRes.data);
      setBanks(bRes.data);
      setCashboxes(cbRes.data);
      setExpenseCategories(expCatRes.data);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تحميل البيانات المالية', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if ((requestedTab === 'expenses' || requestedTab === 'revenues' || requestedTab === 'categories') && canManageExpenses) setActiveTab(requestedTab === 'revenues' ? 'revenues' : 'expenses');
    else if ((requestedTab === 'cash' || requestedTab === 'cashbox') && canManageCashbox) setActiveTab('cashbox');
    else if (requestedTab === 'shifts' && canManageCashbox) setActiveTab('shifts');
    else if (requestedTab === 'banks' && canManageBanks) setActiveTab('banks');
    else if (canManageExpenses) setActiveTab('expenses');
    else if (canManageCashbox) setActiveTab('cashbox');
    else if (canManageBanks) setActiveTab('banks');
  }, [searchParams, canManageExpenses, canManageCashbox, canManageBanks]);

  // Top KPIs
  const totalCashboxBalance = cashboxes.reduce((sum, cb) => sum + (cb.balance || 0), 0);
  const totalBankBalance = banks.reduce((sum, b) => sum + (b.currentBalance || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
  const totalRevenues = revenues.reduce((sum, r) => sum + (r.amount || 0), 0);

  const exportFinancialRecords = (format: 'excel' | 'pdf') => {
    const records =
      activeTab === 'expenses'
        ? expenses.map((record) => [record.expenseNumber, formatExportDate(record.date), record.category?.name || '', record.beneficiary || '', record.totalAmount, record.paymentMethod])
        : activeTab === 'revenues'
          ? revenues.map((record) => [record.revenueNumber, formatExportDate(record.date), record.category?.name || '', record.source || '', record.amount, record.paymentMethod])
          : activeTab === 'cashbox'
            ? cashTransactions.map((record) => [record.type, formatExportDate(record.date), record.partyName || '', record.description || '', record.amount, record.cashbox?.name || ''])
            : activeTab === 'shifts'
              ? shifts.map((record) => [record.shiftNumber, formatExportDate(record.startTime), record.cashierName || '', record.status, record.expectedCash, record.actualCash])
              : banks.map((record) => [record.bankName, record.accountNumber || '', record.currentBalance]);
    const headers =
      activeTab === 'expenses'
        ? ['رقم السند', 'التاريخ', 'التصنيف', 'المستفيد', 'المبلغ', 'طريقة الدفع']
        : activeTab === 'revenues'
          ? ['رقم السند', 'التاريخ', 'التصنيف', 'المصدر', 'المبلغ', 'طريقة الدفع']
          : activeTab === 'cashbox'
            ? ['النوع', 'التاريخ', 'الطرف', 'الوصف', 'المبلغ', 'الصندوق']
            : activeTab === 'shifts'
              ? ['رقم الوردية', 'التاريخ', 'الكاشير', 'الحالة', 'المتوقع', 'الفعلي']
              : ['البنك', 'رقم الحساب', 'الرصيد'];
    const title = `السجلات المالية - ${activeTab}`;
    if (format === 'excel') {
      exportToExcel(title, records.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))));
    } else {
      exportToPdf(title, headers, records);
    }
  };

  // Submit Expense
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.financials.createExpense({
        ...expenseForm,
        amount: parseFloat(expenseForm.amount),
        taxAmount: parseFloat(expenseForm.taxAmount || '0'),
        cashboxId: expenseForm.paymentMethod === 'CASH' ? (expenseForm.cashboxId || cashboxes[0]?.id) : null,
        bankId: expenseForm.paymentMethod === 'BANK' ? (expenseForm.bankId || banks[0]?.id) : null,
      });
      showToast('تم تسجيل سند المصروف بنجاح', 'success');
      setIsExpenseModalOpen(false);
      setExpenseForm({ categoryId: '', beneficiary: '', amount: '', taxAmount: '0', paymentMethod: 'CASH', cashboxId: '', bankId: '', description: '' });
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل حفظ المصروف', 'error');
    }
  };

  // Submit Revenue
  const handleCreateRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.financials.createRevenue({
        ...revenueForm,
        amount: parseFloat(revenueForm.amount),
        cashboxId: revenueForm.paymentMethod === 'CASH' ? (revenueForm.cashboxId || cashboxes[0]?.id) : null,
        bankId: revenueForm.paymentMethod === 'BANK' ? (revenueForm.bankId || banks[0]?.id) : null,
      });
      showToast('تم تسجيل سند الإيراد بنجاح', 'success');
      setIsRevenueModalOpen(false);
      setRevenueForm({ categoryId: '', source: '', amount: '', paymentMethod: 'CASH', cashboxId: '', bankId: '', description: '' });
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تسجيل الإيراد', 'error');
    }
  };

  // Submit Voucher
  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.financials.createCashVoucher({
        ...voucherForm,
        cashboxId: voucherForm.cashboxId || cashboxes[0]?.id,
        amount: parseFloat(voucherForm.amount),
      });
      showToast('تم تسجيل السند النقدي بنجاح', 'success');
      setIsVoucherModalOpen(false);
      setVoucherForm({ type: 'RECEIPT', cashboxId: '', amount: '', partyName: '', description: '' });
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تسجيل السند', 'error');
    }
  };

  // Close Cash Shift
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShiftToClose) return;
    try {
      await api.financials.closeCashShift({
        shiftId: selectedShiftToClose.id,
        actualCash: parseFloat(closeShiftForm.actualCash),
        differenceReason: closeShiftForm.differenceReason,
        notes: closeShiftForm.notes,
      });
      showToast('تم إغلاق وتسوية الوردية بنجاح', 'success');
      setIsCloseShiftModalOpen(false);
      setSelectedShiftToClose(null);
      setCloseShiftForm({ actualCash: '', differenceReason: '', notes: '' });
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل إغلاق الوردية', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Wallet className="w-7 h-7 text-emerald-600" />
            الإدارة المالية والخزينة والبنوك
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            متابعة الصناديق النقدية، المصروفات، الإيرادات، حسابات البنوك وإغلاق ورديات الكاشير
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportFinancialRecords('excel')}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2.5 rounded-xl font-bold text-sm"
          >
            Excel
          </button>
          <button
            onClick={() => exportFinancialRecords('pdf')}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-3 py-2.5 rounded-xl font-bold text-sm"
          >
            PDF
          </button>
          {canManageCashbox && <button
            onClick={() => setIsVoucherModalOpen(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition"
          >
            <Receipt className="w-4 h-4" />
            سند قبض / صرف
          </button>}
          {canManageExpenses && <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition"
          >
            <ArrowDownLeft className="w-4 h-4" />
            تسجيل مصروف
          </button>}
          {canManageExpenses && <button
            onClick={() => setIsRevenueModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition"
          >
            <ArrowUpRight className="w-4 h-4" />
            تسجيل إيراد
          </button>}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">رصيد الصناديق النقدية</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{totalCashboxBalance.toLocaleString()} ج.م</div>
            <span className="text-[11px] text-slate-400">في {cashboxes.length} صناديق نشطة</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">أرصدة الحسابات البنكية</span>
            <div className="text-2xl font-black text-blue-700 mt-1">{totalBankBalance.toLocaleString()} ج.م</div>
            <span className="text-[11px] text-slate-400">في {banks.length} حسابات مصرفية</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">إجمالي المصروفات المسجلة</span>
            <div className="text-2xl font-black text-rose-600 mt-1">{totalExpenses.toLocaleString()} ج.م</div>
            <span className="text-[11px] text-rose-600 font-medium">تشغيلية، إيجارات، فواتير</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">إجمالي الإيرادات المتنوعة</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">{totalRevenues.toLocaleString()} ج.م</div>
            <span className="text-[11px] text-emerald-600 font-medium">إيرادات أخرى غير المبيعات</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6 pt-2 rounded-t-2xl overflow-x-auto">
        {canManageExpenses && <button
          onClick={() => setActiveTab('expenses')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'expenses' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          سندات المصروفات ({expenses.length})
        </button>}
        {canManageExpenses && <button
          onClick={() => setActiveTab('revenues')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'revenues' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          سندات الإيرادات ({revenues.length})
        </button>}
        {canManageCashbox && <button
          onClick={() => setActiveTab('cashbox')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'cashbox' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          حركات الصناديق وسندات القبض/الصرف
        </button>}
        {canManageCashbox && <button
          onClick={() => setActiveTab('shifts')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'shifts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          ورديات الكاشير والتسوية ({shifts.length})
        </button>}
        {canManageBanks && <button
          onClick={() => setActiveTab('banks')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'banks' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          الحسابات المصرفية ({banks.length})
        </button>}
      </div>

      {/* Tab 1: Expenses */}
      {activeTab === 'expenses' && canManageExpenses && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6">
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">رقم السند</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">التصنيف</th>
                  <th className="py-3 px-4">المستفيد</th>
                  <th className="py-3 px-4">طريقة الدفع</th>
                  <th className="py-3 px-4 text-left">المبلغ الأساسي</th>
                  <th className="py-3 px-4 text-left">الضريبة</th>
                  <th className="py-3 px-4 text-left">الإجمالي الصافي</th>
                  <th className="py-3 px-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-400">لا توجد مصروفات مسجلة</td>
                  </tr>
                ) : (
                  expenses.map(exp => (
                    <tr key={exp.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{exp.expenseNumber}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{new Date(exp.date).toLocaleDateString('ar-SA')}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-semibold text-slate-700">
                          {exp.category?.nameAr || 'مصروف عام'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{exp.beneficiary}</td>
                      <td className="py-3 px-4 text-xs">
                        {exp.paymentMethod === 'CASH' ? `نقداً (${exp.cashbox?.name || 'الخزينة'})` : `بنك (${exp.bank?.name || 'الحساب'})`}
                      </td>
                      <td className="py-3 px-4 text-left font-mono">{exp.amount.toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-left font-mono text-xs text-slate-500">{(exp.taxAmount || 0).toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-rose-600">{exp.totalAmount.toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedVoucherForPrint({
                            type: 'PAYMENT',
                            voucherNumber: exp.expenseNumber,
                            date: exp.date,
                            partyName: exp.beneficiary,
                            amount: exp.totalAmount,
                            description: exp.description || `سداد مصروف ${exp.category?.nameAr || ''}`,
                            paymentMethod: exp.paymentMethod,
                            cashbox: exp.cashbox
                          })}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="طباعة سند صرف"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Revenues */}
      {activeTab === 'revenues' && canManageExpenses && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6">
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">رقم السند</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">التصنيف</th>
                  <th className="py-3 px-4">الجهة / المصدر</th>
                  <th className="py-3 px-4">طريقة القبض</th>
                  <th className="py-3 px-4 text-left">المبلغ المستلم</th>
                  <th className="py-3 px-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revenues.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">لا توجد إيرادات مسجلة</td>
                  </tr>
                ) : (
                  revenues.map(rev => (
                    <tr key={rev.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{rev.revenueNumber}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{new Date(rev.date).toLocaleDateString('ar-SA')}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-semibold text-slate-700">
                          {rev.category?.nameAr || 'إيراد متنوع'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{rev.source}</td>
                      <td className="py-3 px-4 text-xs">
                        {rev.paymentMethod === 'CASH' ? `نقداً (${rev.cashbox?.name || 'الخزينة'})` : `بنك (${rev.bank?.name || 'الحساب'})`}
                      </td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-emerald-600">{rev.amount.toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedVoucherForPrint({
                            type: 'RECEIPT',
                            voucherNumber: rev.revenueNumber,
                            date: rev.date,
                            partyName: rev.source,
                            amount: rev.amount,
                            description: rev.description || `قبض إيراد ${rev.category?.nameAr || ''}`,
                            paymentMethod: rev.paymentMethod,
                            cashbox: rev.cashbox
                          })}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="طباعة سند قبض"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Cash Transactions */}
      {activeTab === 'cashbox' && canManageCashbox && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cashboxes.map(cb => (
              <div key={cb.id} className="p-4 rounded-xl border bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-900">{cb.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">فرع: {cb.branch?.name || 'المركز الرئيسي'}</p>
                </div>
                <div className="text-left">
                  <span className="text-xs text-slate-400 block">الرصيد الدفتري الحالي</span>
                  <span className="font-mono text-xl font-black text-emerald-700">{cb.balance?.toLocaleString()} ج.م</span>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">التاريخ والوقت</th>
                  <th className="py-3 px-4">نوع الحركة</th>
                  <th className="py-3 px-4">الطرف الثاني</th>
                  <th className="py-3 px-4">البيان</th>
                  <th className="py-3 px-4">الصندوق</th>
                  <th className="py-3 px-4 text-left">المبلغ</th>
                  <th className="py-3 px-4 text-center">طباعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashTransactions.map(tx => {
                  const isReceipt = tx.type === 'RECEIPT';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 text-xs font-mono text-slate-500">
                        {new Date(tx.date).toLocaleDateString('ar-SA')} {new Date(tx.date).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                          isReceipt ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {isReceipt ? 'قبض نقدي' : 'صرف نقدي'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{tx.partyName || '-'}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{tx.description || '-'}</td>
                      <td className="py-3 px-4 text-xs">{tx.cashbox?.name}</td>
                      <td className="py-3 px-4 text-left font-mono font-bold">
                        <span className={isReceipt ? 'text-emerald-700' : 'text-rose-600'}>
                          {isReceipt ? '+' : '-'}{tx.amount.toLocaleString()} ج.م
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedVoucherForPrint(tx)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="معاينة وطباعة"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Cash Shifts */}
      {activeTab === 'shifts' && canManageCashbox && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6">
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">رقم الوردية</th>
                  <th className="py-3 px-4">الصندوق</th>
                  <th className="py-3 px-4">وقت البدء</th>
                  <th className="py-3 px-4">وقت الإغلاق</th>
                  <th className="py-3 px-4 text-left">الرصيد الافتتاحي</th>
                  <th className="py-3 px-4 text-left">المتوقع دفترياً</th>
                  <th className="py-3 px-4 text-left">الفعلي بالجرد</th>
                  <th className="py-3 px-4 text-left">الفارق (عجز/فائض)</th>
                  <th className="py-3 px-4 text-center">الحالة / إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shifts.map(shift => {
                  const isOpen = shift.status === 'OPEN';
                  return (
                    <tr key={shift.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{shift.shiftNumber}</td>
                      <td className="py-3 px-4 text-xs font-semibold">{shift.cashbox?.name}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{new Date(shift.startTime).toLocaleString('ar-SA')}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{shift.endTime ? new Date(shift.endTime).toLocaleString('ar-SA') : 'جارية الآن...'}</td>
                      <td className="py-3 px-4 text-left font-mono">{shift.startCash.toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-slate-800">{shift.expectedCash.toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-left font-mono">{shift.actualCash !== null ? `${shift.actualCash.toLocaleString()} ج.م` : '-'}</td>
                      <td className="py-3 px-4 text-left font-mono font-bold">
                        {shift.difference === null ? (
                          '-'
                        ) : shift.difference === 0 ? (
                          <span className="text-emerald-600">0 (مطابق)</span>
                        ) : shift.difference > 0 ? (
                          <span className="text-blue-600">+{shift.difference} (فائض)</span>
                        ) : (
                          <span className="text-rose-600">{shift.difference} (عجز)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isOpen ? (
                          <button
                            onClick={() => {
                              setSelectedShiftToClose(shift);
                              setCloseShiftForm({ actualCash: shift.expectedCash.toString(), differenceReason: '', notes: '' });
                              setIsCloseShiftModalOpen(true);
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1 rounded-lg transition"
                          >
                            إغلاق الوردية
                          </button>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold">
                            مغلقة ومسوّاة
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Bank Accounts */}
      {activeTab === 'banks' && canManageBanks && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {banks.map(bank => (
              <div key={bank.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      {bank.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-1">آيبان: {bank.iban}</p>
                    <p className="text-xs text-slate-500 font-mono">رقم الحساب: {bank.accountNumber}</p>
                  </div>
                  <div className="text-left">
                    <span className="text-xs text-slate-400 block">الرصيد المتاح</span>
                    <span className="font-mono text-xl font-black text-blue-800">{bank.currentBalance.toLocaleString()} ج.م</span>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <span className="text-xs font-bold text-slate-600 block mb-2">آخر العمليات على هذا الحساب:</span>
                  <div className="space-y-1.5">
                    {bank.transactions?.length === 0 ? (
                      <p className="text-xs text-slate-400">لا توجد حركات حديثة</p>
                    ) : (
                      bank.transactions?.map((t: any) => (
                        <div key={t.id} className="flex justify-between text-xs bg-white p-2 rounded-lg border">
                          <span className="text-slate-700">{t.description || t.type}</span>
                          <span className={`font-mono font-bold ${t.type === 'DEPOSIT' || t.type === 'CARD_SETTLEMENT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {t.type === 'DEPOSIT' || t.type === 'CARD_SETTLEMENT' ? '+' : '-'}{t.amount.toLocaleString()} ج.م
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ArrowDownLeft className="w-5 h-5 text-rose-600" />
              تسجيل سند صرف مصروف جديد
            </h3>
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">بند المصروف:</label>
                  <select
                    required
                    value={expenseForm.categoryId}
                    onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                  >
                    <option value="">اختر التصنيف</option>
                    {expenseCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.nameAr}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الجهة / المستفيد:</label>
                  <input
                    type="text"
                    required
                    value={expenseForm.beneficiary}
                    onChange={(e) => setExpenseForm({ ...expenseForm, beneficiary: e.target.value })}
                    placeholder="مثال: شركة الكهرباء، المورد..."
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">المبلغ قبل الضريبة:</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={expenseForm.amount}
                    onChange={(e) => {
                      const amt = parseFloat(e.target.value) || 0;
                      setExpenseForm({ ...expenseForm, amount: e.target.value, taxAmount: (amt * 0.15).toFixed(2) });
                    }}
                    placeholder="0.00"
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الضريبة (15%):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={expenseForm.taxAmount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, taxAmount: e.target.value })}
                    placeholder="0.00"
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">طريقة الصرف:</label>
                  <select
                    value={expenseForm.paymentMethod}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                  >
                    <option value="CASH">نقداً من الخزينة</option>
                    <option value="BANK">تحويل بنكي / شيك</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {expenseForm.paymentMethod === 'CASH' ? 'الخزينة المحددة:' : 'الحساب البنكي:'}
                  </label>
                  {expenseForm.paymentMethod === 'CASH' ? (
                    <select
                      value={expenseForm.cashboxId}
                      onChange={(e) => setExpenseForm({ ...expenseForm, cashboxId: e.target.value })}
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                    >
                      {cashboxes.map(cb => (
                        <option key={cb.id} value={cb.id}>{cb.name}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={expenseForm.bankId}
                      onChange={(e) => setExpenseForm({ ...expenseForm, bankId: e.target.value })}
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                    >
                      {banks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">بيان المصروف وتفاصيله:</label>
                <input
                  type="text"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  placeholder="سداد فاتورة، صيانة دورية للورشة..."
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  صرف وقيد بالسجلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revenue Modal */}
      {isRevenueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-emerald-600" />
              تسجيل سند إيراد متنوع جديد
            </h3>
            <form onSubmit={handleCreateRevenue} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الجهة / المصدر:</label>
                <input
                  type="text"
                  required
                  value={revenueForm.source}
                  onChange={(e) => setRevenueForm({ ...revenueForm, source: e.target.value })}
                  placeholder="مثال: عمولة تسويق، بيع خردة / زيوت مستعملة..."
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">المبلغ المستلم:</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={revenueForm.amount}
                  onChange={(e) => setRevenueForm({ ...revenueForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">طريقة القبض:</label>
                  <select
                    value={revenueForm.paymentMethod}
                    onChange={(e) => setRevenueForm({ ...revenueForm, paymentMethod: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                  >
                    <option value="CASH">نقداً بالخزينة</option>
                    <option value="BANK">إيداع بحساب البنك</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">إيداع إلى:</label>
                  {revenueForm.paymentMethod === 'CASH' ? (
                    <select
                      value={revenueForm.cashboxId}
                      onChange={(e) => setRevenueForm({ ...revenueForm, cashboxId: e.target.value })}
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                    >
                      {cashboxes.map(cb => (
                        <option key={cb.id} value={cb.id}>{cb.name}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={revenueForm.bankId}
                      onChange={(e) => setRevenueForm({ ...revenueForm, bankId: e.target.value })}
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                    >
                      {banks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">بيان الإيراد وتفاصيله:</label>
                <input
                  type="text"
                  value={revenueForm.description}
                  onChange={(e) => setRevenueForm({ ...revenueForm, description: e.target.value })}
                  placeholder="تفاصيل إضافية..."
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsRevenueModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  حفظ وتوريد للخزينة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Voucher Modal */}
      {isVoucherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600" />
              إنشاء سند مالي (قبض / صرف)
            </h3>
            <form onSubmit={handleCreateVoucher} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">نوع السند:</label>
                  <select
                    value={voucherForm.type}
                    onChange={(e) => setVoucherForm({ ...voucherForm, type: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm font-bold bg-white outline-none"
                  >
                    <option value="RECEIPT">سند قبض (توريد نقدي)</option>
                    <option value="PAYMENT">سند صرف (دفعة نقدية)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الخزينة المعنية:</label>
                  <select
                    value={voucherForm.cashboxId}
                    onChange={(e) => setVoucherForm({ ...voucherForm, cashboxId: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                  >
                    {cashboxes.map(cb => (
                      <option key={cb.id} value={cb.id}>{cb.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {voucherForm.type === 'RECEIPT' ? 'استلمنا من السيد / السادة:' : 'اصرفوا للسيد / السادة:'}
                </label>
                <input
                  type="text"
                  required
                  value={voucherForm.partyName}
                  onChange={(e) => setVoucherForm({ ...voucherForm, partyName: e.target.value })}
                  placeholder="اسم الشخص أو الشركة..."
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">المبلغ الصافي:</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={voucherForm.amount}
                  onChange={(e) => setVoucherForm({ ...voucherForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono font-black text-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">وذلك لقاء (البيان):</label>
                <input
                  type="text"
                  required
                  value={voucherForm.description}
                  onChange={(e) => setVoucherForm({ ...voucherForm, description: e.target.value })}
                  placeholder="دفعة من حساب، أمانات، صيانة..."
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsVoucherModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-white rounded-xl text-sm font-bold shadow-md ${
                    voucherForm.type === 'RECEIPT' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  إصدار السند وتأكيد العملية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {isCloseShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              إغلاق وردية الكاشير وتعديل العجز والفائض
            </h3>
            <div className="bg-slate-50 p-3 rounded-xl mb-4 text-xs space-y-1">
              <div>رقم الوردية: <span className="font-bold">{selectedShiftToClose?.shiftNumber}</span></div>
              <div>الرصيد الدفتري المتوقع بالدرج: <span className="font-mono font-bold text-blue-700">{selectedShiftToClose?.expectedCash?.toLocaleString()} ج.م</span></div>
            </div>

            <form onSubmit={handleCloseShift} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">المبلغ الفعلي الموجود بالدرج بعد العد:</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={closeShiftForm.actualCash}
                  onChange={(e) => setCloseShiftForm({ ...closeShiftForm, actualCash: e.target.value })}
                  placeholder="0.00"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono font-black text-lg"
                />
              </div>

              {Number(closeShiftForm.actualCash) - (selectedShiftToClose?.expectedCash || 0) !== 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">سبب الفارق (العجز أو الزيادة):</label>
                  <input
                    type="text"
                    required
                    value={closeShiftForm.differenceReason}
                    onChange={(e) => setCloseShiftForm({ ...closeShiftForm, differenceReason: e.target.value })}
                    placeholder="مثال: فارق كسور هلالت، خطأ في رد المتبقي..."
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsCloseShiftModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  تأكيد إغلاق الوردية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Voucher Modal */}
      {selectedVoucherForPrint && (
        <PrintModal
          title={selectedVoucherForPrint.type === 'RECEIPT' ? 'سند قبض مالي' : 'سند صرف مالي'}
          isOpen={true}
          onClose={() => setSelectedVoucherForPrint(null)}
        >
          <CashVoucherPrint voucher={selectedVoucherForPrint} />
        </PrintModal>
      )}
    </div>
  );
};
