import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ContactRound, Megaphone, Landmark, ShieldCheck, Users, Building2 } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

type Tab = 'appointments' | 'crm' | 'campaigns' | 'assets' | 'tax';

export const OperationalHub: React.FC = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('appointments');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [tax, setTax] = useState<any>({ enabled: false, environment: 'SANDBOX' });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, l, c, f, cu, ve, br, tx] = await Promise.all([
        api.operational.getAppointments(),
        api.operational.getLeads(),
        api.operational.getCampaigns(),
        api.operational.getAssets(),
        api.master.getCustomers(),
        api.master.getVehicles(),
        api.master.getBranches(),
        api.operational.getTaxSetting(),
      ]);
      setAppointments(a.data || []);
      setLeads(l.data || []);
      setCampaigns(c.data || []);
      setAssets(f.data || []);
      setCustomers(cu.data || []);
      setVehicles(ve.data || []);
      setBranches(br.data || []);
      setTax(tx.data || tx);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر تحميل وحدة العمليات', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const submitAppointment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.operational.createAppointment({
        customerId: form.get('customerId'),
        vehicleId: form.get('vehicleId'),
        branchId: form.get('branchId') || null,
        startsAt: new Date(String(form.get('startsAt'))).toISOString(),
        endsAt: new Date(String(form.get('endsAt'))).toISOString(),
        serviceName: form.get('serviceName'),
        notes: form.get('notes'),
      });
      showToast('تم حجز الموعد', 'success');
      event.currentTarget.reset();
      await load();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر حجز الموعد', 'error');
    }
  };

  const submitLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.operational.createLead({
        name: form.get('name'), phone: form.get('phone'), source: form.get('source'),
        interest: form.get('interest'), nextFollowUp: form.get('nextFollowUp'),
      });
      showToast('تمت إضافة فرصة البيع', 'success');
      event.currentTarget.reset();
      await load();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر إضافة العميل المحتمل', 'error');
    }
  };

  const submitCampaign = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.operational.createCampaign({
        name: form.get('name'), channel: form.get('channel'), segment: form.get('segment'),
        message: form.get('message'), status: 'DRAFT',
      });
      showToast('تم حفظ الحملة', 'success');
      event.currentTarget.reset();
      await load();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر حفظ الحملة', 'error');
    }
  };

  const submitAsset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.operational.createAsset({
        assetCode: form.get('assetCode'), name: form.get('name'), category: form.get('category'),
        purchaseDate: form.get('purchaseDate'), purchaseCost: form.get('purchaseCost'),
        salvageValue: form.get('salvageValue'), usefulLifeMonths: form.get('usefulLifeMonths'),
        location: form.get('location'), serialNumber: form.get('serialNumber'),
      });
      showToast('تمت إضافة الأصل', 'success');
      event.currentTarget.reset();
      await load();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر إضافة الأصل', 'error');
    }
  };

  const saveTax = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.operational.updateTaxSetting({
        enabled: form.get('enabled') === 'on',
        environment: form.get('environment'),
        taxpayerRin: form.get('taxpayerRin'),
        activityCode: form.get('activityCode'),
        branchId: form.get('branchId'),
      });
      showToast('تم حفظ إعدادات ضريبة ETA', 'success');
      await load();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر حفظ إعدادات الضريبة', 'error');
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'appointments', label: 'الحجوزات والصيانة', icon: CalendarDays },
    { id: 'crm', label: 'CRM والعملاء المحتملون', icon: ContactRound },
    { id: 'campaigns', label: 'الحملات والخصومات', icon: Megaphone },
    { id: 'assets', label: 'الأصول والإهلاك', icon: Building2 },
    { id: 'tax', label: 'ضريبة ETA الاختيارية', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-black text-slate-900">العمليات المتقدمة والربط الخارجي</h1>
        <p className="mt-1 text-sm text-slate-500">حجوزات، CRM، حملات، أصول ثابتة، وتكامل ضريبي اختياري.</p>
      </div>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === id ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">جارٍ تحميل البيانات...</div> : (
        <>
          {tab === 'appointments' && (
            <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <form onSubmit={submitAppointment} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-black">حجز موعد جديد</h2>
                <select name="customerId" required className="w-full rounded-xl border p-2.5"><option value="">اختر العميل</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <select name="vehicleId" required className="w-full rounded-xl border p-2.5"><option value="">اختر السيارة</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber} - {v.make} {v.model}</option>)}</select>
                <select name="branchId" className="w-full rounded-xl border p-2.5"><option value="">الفرع الرئيسي</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                <input name="startsAt" type="datetime-local" required className="w-full rounded-xl border p-2.5" />
                <input name="endsAt" type="datetime-local" required className="w-full rounded-xl border p-2.5" />
                <input name="serviceName" required placeholder="نوع الخدمة" className="w-full rounded-xl border p-2.5" />
                <textarea name="notes" placeholder="ملاحظات" className="w-full rounded-xl border p-2.5" />
                <button className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white">حجز الموعد</button>
              </form>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b p-4 font-black">المواعيد المجدولة</div>
                {appointments.length ? appointments.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between border-b p-4 text-sm">
                    <div><b>{item.appointmentNumber}</b> — {item.customer?.name} — {item.vehicle?.plateNumber}<div className="mt-1 text-xs text-slate-500">{new Date(item.startsAt).toLocaleString('ar-EG')} | {item.serviceName}</div></div>
                    <div className="flex gap-2">
                      <button onClick={async () => { try { await api.operational.createRepairFromAppointment(item.id); showToast('تم إنشاء أمر الإصلاح', 'success'); await load(); } catch (e: any) { showToast(e.response?.data?.error || 'تعذر التحويل', 'error'); } }} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800">تحويل لأمر إصلاح</button>
                    </div>
                  </div>
                )) : <div className="p-8 text-center text-sm text-slate-500">لا توجد مواعيد مجدولة</div>}
              </div>
            </div>
          )}

          {tab === 'crm' && (
            <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <form onSubmit={submitLead} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-black">عميل محتمل جديد</h2>
                <input name="name" required placeholder="الاسم" className="w-full rounded-xl border p-2.5" />
                <input name="phone" required placeholder="رقم الهاتف" className="w-full rounded-xl border p-2.5" />
                <select name="source" className="w-full rounded-xl border p-2.5"><option value="MANUAL">يدوي</option><option value="WHATSAPP">واتساب</option><option value="CALL">مكالمة</option><option value="WEBSITE">الموقع</option></select>
                <input name="interest" placeholder="الخدمة المطلوبة" className="w-full rounded-xl border p-2.5" />
                <input name="nextFollowUp" type="datetime-local" className="w-full rounded-xl border p-2.5" />
                <button className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white">إضافة فرصة</button>
              </form>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b p-4 font-black">العملاء المحتملون والمتابعة</div>
                {leads.map((lead) => <div key={lead.id} className="border-b p-4 text-sm"><b>{lead.name}</b> — {lead.phone}<div className="text-xs text-slate-500">{lead.status} | {lead.interest || 'بدون خدمة محددة'}</div></div>)}
                {!leads.length && <div className="p-8 text-center text-sm text-slate-500">لا توجد فرص مضافة</div>}
              </div>
            </div>
          )}

          {tab === 'campaigns' && (
            <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <form onSubmit={submitCampaign} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-black">حملة تسويقية جديدة</h2>
                <input name="name" required placeholder="اسم الحملة" className="w-full rounded-xl border p-2.5" />
                <select name="channel" className="w-full rounded-xl border p-2.5"><option value="WHATSAPP">واتساب</option><option value="SMS">رسائل نصية</option></select>
                <select name="segment" className="w-full rounded-xl border p-2.5"><option value="ALL">جميع العملاء النشطين</option><option value="WHATSAPP">المشتركون بواتساب فقط</option></select>
                <textarea name="message" required placeholder="نص الرسالة" className="min-h-32 w-full rounded-xl border p-2.5" />
                <button className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white">حفظ الحملة</button>
              </form>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                {campaigns.map((campaign) => <div key={campaign.id} className="mb-3 rounded-xl border p-4"><div className="flex justify-between"><b>{campaign.name}</b><button onClick={async () => { try { const r = await api.operational.sendCampaign(campaign.id); showToast(r.data?.queued ? `تمت جدولة الحملة لـ ${r.data.queued} عميل` : 'تمت جدولة الحملة', 'success'); await load(); } catch (e: any) { showToast(e.response?.data?.error || 'تعذر إرسال الحملة', 'error'); } }} className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">جدولة الإرسال</button></div><div className="mt-2 text-xs text-slate-500">{campaign.status} | {campaign.channel}</div></div>)}
                {!campaigns.length && <div className="p-8 text-center text-sm text-slate-500">لا توجد حملات محفوظة</div>}
              </div>
            </div>
          )}

          {tab === 'assets' && (
            <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <form onSubmit={submitAsset} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-black">أصل ثابت جديد</h2>
                <input name="assetCode" required placeholder="كود الأصل" className="w-full rounded-xl border p-2.5" />
                <input name="name" required placeholder="اسم الأصل" className="w-full rounded-xl border p-2.5" />
                <input name="category" required placeholder="الفئة" className="w-full rounded-xl border p-2.5" />
                <input name="purchaseDate" type="date" required className="w-full rounded-xl border p-2.5" />
                <input name="purchaseCost" type="number" min="0" step="0.01" required placeholder="التكلفة" className="w-full rounded-xl border p-2.5" />
                <input name="salvageValue" type="number" min="0" step="0.01" placeholder="قيمة الخردة" className="w-full rounded-xl border p-2.5" />
                <input name="usefulLifeMonths" type="number" min="1" required placeholder="العمر بالشهور" className="w-full rounded-xl border p-2.5" />
                <input name="location" placeholder="الموقع" className="w-full rounded-xl border p-2.5" />
                <input name="serialNumber" placeholder="الرقم التسلسلي" className="w-full rounded-xl border p-2.5" />
                <button className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white">إضافة الأصل</button>
              </form>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex justify-between"><b>سجل الأصول</b><button onClick={async () => { const r = await api.operational.depreciateAssets(); showToast(`تم حساب إهلاك ${r.data?.processed || 0} أصل`, 'success'); await load(); }} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">تسجيل إهلاك شهري</button></div>
                {assets.map((asset) => <div key={asset.id} className="mb-2 rounded-xl border p-4 text-sm"><b>{asset.assetCode} — {asset.name}</b><div className="text-xs text-slate-500">{asset.category} | تكلفة {asset.purchaseCost} | مجمع الإهلاك {asset.accumulatedDepreciation}</div></div>)}
                {!assets.length && <div className="p-8 text-center text-sm text-slate-500">لا توجد أصول مسجلة</div>}
              </div>
            </div>
          )}

          {tab === 'tax' && (
            <form onSubmit={saveTax} className="max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-start gap-3"><Landmark className="mt-1 h-6 w-6 text-amber-600" /><div><h2 className="font-black">تكامل ضريبة ETA اختياري</h2><p className="text-sm text-slate-500">يبقى غير مفعل افتراضيًا ولا يغير الفواتير المحلية.</p></div></div>
              <label className="flex items-center gap-3"><input name="enabled" type="checkbox" defaultChecked={tax.enabled} /><span className="font-bold">تفعيل تكامل ETA بعد استلام الاعتماد</span></label>
              <select name="environment" defaultValue={tax.environment} className="w-full rounded-xl border p-3"><option value="SANDBOX">Sandbox للاختبار</option><option value="PRODUCTION">Production</option></select>
              <input name="taxpayerRin" defaultValue={tax.taxpayerRin || ''} placeholder="Taxpayer RIN" className="w-full rounded-xl border p-3" dir="ltr" />
              <input name="activityCode" defaultValue={tax.activityCode || ''} placeholder="Activity code" className="w-full rounded-xl border p-3" dir="ltr" />
              <select name="branchId" defaultValue={tax.branchId || ''} className="w-full rounded-xl border p-3"><option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">لا يتم إرسال أي مستند حتى إدخال الاعتماد واختبار التوقيع الرقمي رسميًا.</div>
              <button className="rounded-xl bg-brand-600 px-5 py-3 font-bold text-white">حفظ إعدادات الضريبة</button>
            </form>
          )}
        </>
      )}
    </div>
  );
};
