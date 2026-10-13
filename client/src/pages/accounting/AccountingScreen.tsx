import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, RefreshCw, RotateCcw, Scale } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

type AccountingTab = 'entries' | 'accounts' | 'trial' | 'ledger';
type EntryLine = { accountCode: string; side: 'debit' | 'credit'; amount: string; label: string };

const money = (value: number) => new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 2,
}).format(value || 0);

export const AccountingScreen: React.FC = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<AccountingTab>('entries');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [trial, setTrial] = useState<any>({ rows: [], totals: {} });
  const [ledger, setLedger] = useState<any>({ account: null, lines: [] });
  const [ledgerAccountId, setLedgerAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({ code: '', nameAr: '', nameEn: '', type: 'ASSET' });
  const [journalCode, setJournalCode] = useState('GEN');
  const [memo, setMemo] = useState('');
  const [entryLines, setEntryLines] = useState<EntryLine[]>([
    { accountCode: '', side: 'debit', amount: '', label: '' },
    { accountCode: '', side: 'credit', amount: '', label: '' },
  ]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [accountsRes, journalsRes, entriesRes, trialRes] = await Promise.all([
        api.accounting.getAccounts(),
        api.accounting.getJournals(),
        api.accounting.getEntries(),
        api.accounting.getTrialBalance(),
      ]);
      const loadedAccounts = accountsRes.data || [];
      setAccounts(loadedAccounts);
      setJournals(journalsRes.data || []);
      setEntries(entriesRes.data || []);
      setTrial(trialRes.data || { rows: [], totals: {} });
      setLedgerAccountId((current) => current || loadedAccounts[0]?.id || '');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر تحميل بيانات المحاسبة', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (tab !== 'ledger' || !ledgerAccountId) return;
    api.accounting.getLedger(ledgerAccountId)
      .then((response) => setLedger(response.data))
      .catch((error: any) => showToast(error.response?.data?.error || 'تعذر تحميل الأستاذ العام', 'error'));
  }, [tab, ledgerAccountId, showToast]);

  const submitEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    const lines = entryLines
      .filter((line) => Number(line.amount) > 0)
      .map((line) => ({
        accountCode: line.accountCode,
        [line.side]: Number(line.amount),
        label: line.label || undefined,
      }));
    if (!memo.trim() || lines.length < 2 || lines.some((line) => !line.accountCode)) {
      showToast('أدخل وصف القيد وسطرين محاسبيين مكتملين على الأقل', 'error');
      return;
    }
    try {
      setSaving(true);
      await api.accounting.createEntry({ journalCode, memo, lines });
      showToast('تم ترحيل القيد بنجاح', 'success');
      setShowEntryForm(false);
      setMemo('');
      setEntryLines([
        { accountCode: '', side: 'debit', amount: '', label: '' },
        { accountCode: '', side: 'credit', amount: '', label: '' },
      ]);
      await loadData();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر ترحيل القيد', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      await api.accounting.createAccount(accountForm);
      showToast('تمت إضافة الحساب', 'success');
      setShowAccountForm(false);
      setAccountForm({ code: '', nameAr: '', nameEn: '', type: 'ASSET' });
      await loadData();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر إضافة الحساب', 'error');
    } finally {
      setSaving(false);
    }
  };

  const reverseEntry = async (entry: any) => {
    if (!window.confirm(`هل تريد إنشاء قيد عكسي للقيد ${entry.number}؟`)) return;
    try {
      await api.accounting.reverseEntry(entry.id);
      showToast('تم إنشاء القيد العكسي', 'success');
      await loadData();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر عكس القيد', 'error');
    }
  };

  const tabs: { id: AccountingTab; label: string; icon: React.ElementType }[] = [
    { id: 'entries', label: 'القيود اليومية', icon: BookOpen },
    { id: 'accounts', label: 'دليل الحسابات', icon: Scale },
    { id: 'trial', label: 'ميزان المراجعة', icon: Scale },
    { id: 'ledger', label: 'الأستاذ العام', icon: BookOpen },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">المحاسبة العامة</h1>
          <p className="mt-1 text-sm text-slate-500">دليل الحسابات والقيود المزدوجة والتقارير المالية</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadData()} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
          <button type="button" onClick={() => setShowEntryForm((current) => !current)} className="flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> قيد يدوي
          </button>
          <button type="button" onClick={() => setShowAccountForm((current) => !current)} className="flex items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50">
            <Plus className="h-4 w-4" /> حساب جديد
          </button>
        </div>
      </div>

      {showAccountForm && (
        <form onSubmit={submitAccount} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
          <input required minLength={2} maxLength={20} pattern="[0-9.]+" title="أرقام ونقاط فقط" value={accountForm.code} onChange={(event) => setAccountForm((current) => ({ ...current, code: event.target.value }))} placeholder="رقم الحساب" className="rounded-lg border border-slate-200 p-2" />
          <input required maxLength={120} value={accountForm.nameAr} onChange={(event) => setAccountForm((current) => ({ ...current, nameAr: event.target.value }))} placeholder="اسم الحساب" className="rounded-lg border border-slate-200 p-2" />
          <select value={accountForm.type} onChange={(event) => setAccountForm((current) => ({ ...current, type: event.target.value }))} className="rounded-lg border border-slate-200 p-2">
            <option value="ASSET">أصول</option><option value="LIABILITY">التزامات</option><option value="EQUITY">حقوق ملكية</option><option value="INCOME">إيرادات</option><option value="EXPENSE">مصروفات</option>
          </select>
          <div className="flex gap-2"><button disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">حفظ</button><button type="button" onClick={() => setShowAccountForm(false)} className="rounded-lg px-3 py-2 text-sm text-slate-600">إلغاء</button></div>
        </form>
      )}

      {showEntryForm && (
        <form onSubmit={submitEntry} className="space-y-4 rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              دفتر اليومية
              <select value={journalCode} onChange={(event) => setJournalCode(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2">
                {journals.map((journal) => <option key={journal.id} value={journal.code}>{journal.nameAr}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              وصف القيد
              <input value={memo} onChange={(event) => setMemo(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-200 p-2" />
            </label>
          </div>
          <div className="space-y-2">
            {entryLines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[2fr_1fr_1fr_2fr]">
                <select aria-label="الحساب" value={line.accountCode} onChange={(event) => setEntryLines((current) => current.map((item, i) => i === index ? { ...item, accountCode: event.target.value } : item))} className="rounded-lg border border-slate-200 bg-white p-2">
                  <option value="">اختر الحساب</option>
                  {accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.code}>{account.code} - {account.nameAr}</option>)}
                </select>
                <select aria-label="نوع الحركة" value={line.side} onChange={(event) => setEntryLines((current) => current.map((item, i) => i === index ? { ...item, side: event.target.value as EntryLine['side'] } : item))} className="rounded-lg border border-slate-200 bg-white p-2">
                  <option value="debit">مدين</option><option value="credit">دائن</option>
                </select>
                <input aria-label="المبلغ" type="number" min="0.01" step="0.01" value={line.amount} onChange={(event) => setEntryLines((current) => current.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} placeholder="المبلغ" className="rounded-lg border border-slate-200 bg-white p-2" />
                <input aria-label="بيان السطر" value={line.label} onChange={(event) => setEntryLines((current) => current.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} placeholder="بيان السطر (اختياري)" className="rounded-lg border border-slate-200 bg-white p-2" />
              </div>
            ))}
            <button type="button" onClick={() => setEntryLines((current) => [...current, { accountCode: '', side: 'debit', amount: '', label: '' }])} className="text-sm font-semibold text-brand-700">+ إضافة سطر</button>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowEntryForm(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">إلغاء</button>
            <button disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'جارٍ الترحيل...' : 'ترحيل القيد'}</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-bold ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {loading ? <div className="rounded-2xl bg-white p-10 text-center text-slate-500">جارٍ تحميل البيانات...</div> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          {tab === 'accounts' && (
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">رقم الحساب</th><th className="p-3">اسم الحساب</th><th className="p-3">النوع</th><th className="p-3">الحالة</th></tr></thead>
              <tbody>{accounts.map((account) => <tr key={account.id} className="border-t border-slate-100"><td className="p-3 font-mono">{account.code}</td><td className="p-3 font-semibold">{account.nameAr}</td><td className="p-3">{account.type}</td><td className="p-3">{account.active ? 'نشط' : 'معطل'}</td></tr>)}</tbody>
            </table>
          )}
          {tab === 'entries' && (
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">رقم القيد</th><th className="p-3">التاريخ</th><th className="p-3">البيان</th><th className="p-3">اليومية</th><th className="p-3">المدين</th><th className="p-3">الدائن</th><th className="p-3">إجراء</th></tr></thead>
              <tbody>{entries.map((entry) => {
                const debit = entry.lines.reduce((sum: number, line: any) => sum + line.debit, 0);
                const credit = entry.lines.reduce((sum: number, line: any) => sum + line.credit, 0);
                return <tr key={entry.id} className="border-t border-slate-100"><td className="p-3 font-mono">{entry.number}</td><td className="p-3">{new Date(entry.date).toLocaleDateString('ar-EG')}</td><td className="p-3">{entry.memo}</td><td className="p-3">{entry.journal.nameAr}</td><td className="p-3">{money(debit)}</td><td className="p-3">{money(credit)}</td><td className="p-3"><button type="button" title="إنشاء قيد عكسي" onClick={() => void reverseEntry(entry)} className="rounded-lg p-2 text-amber-700 hover:bg-amber-50"><RotateCcw className="h-4 w-4" /></button></td></tr>;
              })}</tbody>
            </table>
          )}
          {tab === 'trial' && (
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">الحساب</th><th className="p-3">الرصيد الافتتاحي مدين</th><th className="p-3">الرصيد الافتتاحي دائن</th><th className="p-3">مدين الفترة</th><th className="p-3">دائن الفترة</th><th className="p-3">الرصيد الختامي مدين</th><th className="p-3">الرصيد الختامي دائن</th></tr></thead>
              <tbody>{trial.rows.map((row: any) => <tr key={row.account.id} className="border-t border-slate-100"><td className="p-3">{row.account.code} - {row.account.nameAr}</td><td className="p-3">{money(row.openingDebit)}</td><td className="p-3">{money(row.openingCredit)}</td><td className="p-3">{money(row.debit)}</td><td className="p-3">{money(row.credit)}</td><td className="p-3">{money(row.closingDebit)}</td><td className="p-3">{money(row.closingCredit)}</td></tr>)}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-black"><td className="p-3">الإجمالي</td><td /><td /><td className="p-3">{money(trial.totals.debit)}</td><td className="p-3">{money(trial.totals.credit)}</td><td className="p-3">{money(trial.totals.closingDebit)}</td><td className="p-3">{money(trial.totals.closingCredit)}</td></tr>
              </tbody>
            </table>
          )}
          {tab === 'ledger' && (
            <div>
              <div className="border-b border-slate-100 p-3">
                <select value={ledgerAccountId} onChange={(event) => setLedgerAccountId(event.target.value)} className="min-w-64 rounded-lg border border-slate-200 p-2">
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.nameAr}</option>)}
                </select>
              </div>
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">التاريخ</th><th className="p-3">رقم القيد</th><th className="p-3">البيان</th><th className="p-3">مدين</th><th className="p-3">دائن</th><th className="p-3">الرصيد</th></tr></thead>
                <tbody>{ledger.lines.map((line: any) => <tr key={line.id} className="border-t border-slate-100"><td className="p-3">{new Date(line.entry.date).toLocaleDateString('ar-EG')}</td><td className="p-3 font-mono">{line.entry.number}</td><td className="p-3">{line.label || line.entry.memo}</td><td className="p-3">{money(line.debit)}</td><td className="p-3">{money(line.credit)}</td><td className="p-3 font-semibold">{money(line.balance)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <p className="flex items-center gap-2 text-xs text-slate-500"><Scale className="h-4 w-4" /> ترحيل القيود آلياً مرتبط بفواتير المبيعات والمشتريات وحركات الخزينة والبنوك.</p>
    </div>
  );
};
