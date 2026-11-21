import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, Car, ReceiptText, Wrench } from 'lucide-react';
import { api } from '../services/api';

export const CustomerPortal: React.FC = () => {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api.getPublicCustomerPortal(token).then((result) => setData(result.data)).catch((e) => setError(e.response?.data?.error || e.message));
  }, [token]);

  if (error) return <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-100 p-6"><div className="rounded-2xl bg-white p-8 text-center text-rose-700 shadow">{error}</div></div>;
  if (!data) return <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-100">جارٍ تحميل بوابة العميل...</div>;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl bg-slate-900 p-6 text-white"><h1 className="text-2xl font-black">بوابة العميل — {data.customer.name}</h1><p className="mt-1 text-sm text-slate-300">سياراتك، الصيانة، المواعيد والفواتير</p></header>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl bg-white p-5"><h2 className="mb-3 flex items-center gap-2 font-black"><Car className="h-5 w-5 text-brand-600" />السيارات</h2>{data.vehicles.map((v: any) => <div key={v.id} className="border-b py-3 text-sm"><b>{v.plateNumber}</b> — {v.make} {v.model}<div className="text-xs text-slate-500">العداد: {v.currentOdometer?.toLocaleString()} كم</div></div>)}</section>
          <section className="rounded-2xl bg-white p-5"><h2 className="mb-3 flex items-center gap-2 font-black"><CalendarDays className="h-5 w-5 text-amber-600" />المواعيد</h2>{data.appointments.map((a: any) => <div key={a.id} className="border-b py-3 text-sm"><b>{a.serviceName}</b><div className="text-xs text-slate-500">{new Date(a.startsAt).toLocaleString('ar-EG')} | {a.status}</div></div>)}</section>
        </div>
        <section className="rounded-2xl bg-white p-5"><h2 className="mb-3 flex items-center gap-2 font-black"><Wrench className="h-5 w-5 text-blue-600" />أوامر الإصلاح</h2>{data.repairOrders.map((r: any) => <div key={r.id} className="border-b py-3 text-sm"><b>{r.orderNumber}</b> — {r.vehicle?.plateNumber}<div className="text-xs text-slate-500">{r.status} | الإجمالي: {r.grandTotal?.toLocaleString()} ج.م</div></div>)}</section>
        <section className="rounded-2xl bg-white p-5"><h2 className="mb-3 flex items-center gap-2 font-black"><ReceiptText className="h-5 w-5 text-emerald-600" />الفواتير</h2>{data.invoices.map((i: any) => <div key={i.id} className="border-b py-3 text-sm"><b>{i.invoiceNumber}</b><div className="text-xs text-slate-500">{i.status} | الإجمالي: {i.grandTotal?.toLocaleString()} ج.م | المتبقي: {i.remainingAmount?.toLocaleString()} ج.م</div></div>)}</section>
      </div>
    </div>
  );
};
