import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import type { NotificationIntegrationInput, NotificationIntegrationStatus, NotificationOptions } from '../../types/notifications';

const optionLabels: { key: keyof NotificationOptions; label: string; description: string }[] = [
  { key: 'userActivity', label: 'نشاط المستخدمين', description: 'عمليات الدخول والإنشاء والتعديل المسجلة في سجل الرقابة.' },
  { key: 'sales', label: 'المبيعات', description: 'إجمالي وقيمة فواتير البيع الجديدة.' },
  { key: 'profits', label: 'الأرباح التقديرية', description: 'ربح الفاتورة قبل المصروفات، محسوباً من أسعار التكلفة المسجلة.' },
  { key: 'invoices', label: 'الفواتير', description: 'إشعارات فواتير البيع والمشتريات المعتمدة.' },
  { key: 'shortages', label: 'النواقص', description: 'طلبات النواقص، والأصناف التي وصلت إلى الحد الأدنى بعد البيع.' },
  { key: 'updates', label: 'تعديلات البيانات', description: 'عمليات التعديل المسجلة على بيانات النظام والمخزون والمنشأة.' },
  { key: 'shiftSummary', label: 'ملخص نهاية الوردية', description: 'ملخص المبيعات والأرباح التقديرية والمصروفات والنواقص يومياً.' },
];

const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500';

export const NotificationIntegrations: React.FC = () => {
  const { showToast } = useToast();
  const [status, setStatus] = useState<NotificationIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'whatsapp' | 'telegram' | null>(null);
  const [whatsapp, setWhatsapp] = useState({
    accessToken: '',
    phoneNumberId: '',
    apiVersion: 'v23.0',
    recipientPhone: '',
    templateName: 'system_event_alert_ar',
    templateLanguage: 'ar',
  });
  const [telegram, setTelegram] = useState({ botToken: '', chatId: '' });

  useEffect(() => {
    api.settings.getNotificationIntegrations()
      .then((response) => {
        const current = response.data;
        setStatus(current);
        setWhatsapp({
          accessToken: '',
          phoneNumberId: current.whatsapp.phoneNumberId,
          apiVersion: current.whatsapp.apiVersion,
          recipientPhone: current.whatsapp.recipientPhone,
          templateName: current.whatsapp.templateName || 'system_event_alert_ar',
          templateLanguage: current.whatsapp.templateLanguage,
        });
        setTelegram({ botToken: '', chatId: current.telegram.chatId });
      })
      .catch((error: { response?: { data?: { error?: string } } }) => {
        showToast(error.response?.data?.error || 'تعذر تحميل إعدادات الربط', 'error');
      })
      .finally(() => setLoading(false));
  }, [showToast]);

  const persist = async () => {
    if (!status) return;
    setSaving(true);
    try {
      const input: NotificationIntegrationInput = {
        whatsapp,
        telegram,
        options: status.options,
        shiftEndTime: '23:00',
        timeZone: 'Africa/Cairo',
      };
      const response = await api.settings.saveNotificationIntegrations(input);
      setStatus(response.data);
      setWhatsapp((current) => ({
        ...current,
        accessToken: '',
        phoneNumberId: response.data.whatsapp.phoneNumberId,
        apiVersion: response.data.whatsapp.apiVersion,
        recipientPhone: response.data.whatsapp.recipientPhone,
        templateName: response.data.whatsapp.templateName,
        templateLanguage: response.data.whatsapp.templateLanguage,
      }));
      setTelegram((current) => ({ ...current, botToken: '', chatId: response.data.telegram.chatId }));
      showToast('تم حفظ إعدادات التنبيهات بأمان', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'تعذر حفظ إعدادات الربط', 'error');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (channel: 'whatsapp' | 'telegram') => {
    setTesting(channel);
    try {
      const response = await api.settings.testNotificationIntegration(
        channel,
        channel === 'whatsapp' ? whatsapp : telegram,
      );
      showToast(`تم الاتصال وإرسال رسالة اختبار${response.data.account ? ` إلى ${response.data.account}` : ''}`, 'success');
      const refreshed = await api.settings.getNotificationIntegrations();
      setStatus(refreshed.data);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'فشل اختبار الاتصال', 'error');
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center rounded-b-2xl border bg-white p-12"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }
  if (!status) return null;

  const updateOption = (key: keyof NotificationOptions, value: boolean) => {
    setStatus((current) => current ? { ...current, options: { ...current.options, [key]: value } } : current);
  };

  return (
    <div className="space-y-5 rounded-b-2xl border border-slate-200 border-t-0 bg-white p-5 md:p-6">
      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p>بيانات الدخول تُشفّر قبل حفظها ولا يعيدها النظام إلى المتصفح. إعداد وربط القنوات متاح لمدير النظام فقط.</p>
      </div>
      {status.credentialsResetRequired && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
          تعذر فك تشفير رمز قناة بعد تغيير مفتاح النظام. أدخل رمز القناة المتأثرة مجدداً ثم احفظ الإعدادات؛ لن تُعاد الرموز القديمة إلى المتصفح.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-bold text-slate-900"><MessageCircle className="h-5 w-5 text-emerald-600" /> WhatsApp Business</h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.whatsapp.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {status.whatsapp.connected ? 'مُعدّ' : 'غير مكتمل'}
            </span>
          </div>
          <label className="block space-y-1 text-xs font-semibold text-slate-600">
            رمز الوصول الدائم
            <input type="password" autoComplete="new-password" value={whatsapp.accessToken} onChange={(event) => setWhatsapp({ ...whatsapp, accessToken: event.target.value })} placeholder={status.whatsapp.connected ? 'محفوظ ومشفّر — اتركه فارغاً للإبقاء عليه' : 'أدخل Access Token'} className={inputClass} dir="ltr" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs font-semibold text-slate-600">
              Phone Number ID
              <input value={whatsapp.phoneNumberId} onChange={(event) => setWhatsapp({ ...whatsapp, phoneNumberId: event.target.value })} className={inputClass} dir="ltr" />
            </label>
            <label className="block space-y-1 text-xs font-semibold text-slate-600">
              رقم المستلم بصيغة دولية
              <input value={whatsapp.recipientPhone} onChange={(event) => setWhatsapp({ ...whatsapp, recipientPhone: event.target.value })} placeholder="2010xxxxxxxx" className={inputClass} dir="ltr" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs font-semibold text-slate-600">
              اسم القالب المعتمد للتنبيه
              <input value={whatsapp.templateName} onChange={(event) => setWhatsapp({ ...whatsapp, templateName: event.target.value })} className={inputClass} dir="ltr" />
            </label>
            <label className="block space-y-1 text-xs font-semibold text-slate-600">
              لغة القالب
              <input value={whatsapp.templateLanguage} onChange={(event) => setWhatsapp({ ...whatsapp, templateLanguage: event.target.value })} placeholder="ar" className={inputClass} dir="ltr" />
            </label>
          </div>
          <p className="text-xs leading-5 text-slate-500">يلزم أن يكون المستلم موافقاً على استقبال الرسائل، وأن يعتمد Meta قالباً بالاسم واللغة المحددين يحتوي متغيرين نصيين في نص الرسالة؛ لا تُرسل التنبيهات خارج نافذة المحادثة برسائل حرة.</p>
          <button type="button" disabled={testing !== null} onClick={() => testConnection('whatsapp')} className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
            {testing === 'whatsapp' ? 'جارٍ الاختبار وإرسال رسالة فعلية...' : 'اختبار الاتصال وإرسال رسالة'}
          </button>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-bold text-slate-900"><Send className="h-5 w-5 text-sky-600" /> Telegram Bot</h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.telegram.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {status.telegram.connected ? 'مُعدّ' : 'غير مكتمل'}
            </span>
          </div>
          <label className="block space-y-1 text-xs font-semibold text-slate-600">
            Bot Token
            <input type="password" autoComplete="new-password" value={telegram.botToken} onChange={(event) => setTelegram({ ...telegram, botToken: event.target.value })} placeholder={status.telegram.connected ? 'محفوظ ومشفّر — اتركه فارغاً للإبقاء عليه' : 'أدخل رمز البوت'} className={inputClass} dir="ltr" />
          </label>
          <label className="block space-y-1 text-xs font-semibold text-slate-600">
            Chat ID للمستلم أو المجموعة
            <input value={telegram.chatId} onChange={(event) => setTelegram({ ...telegram, chatId: event.target.value })} placeholder="رقم المحادثة أو المجموعة" className={inputClass} dir="ltr" />
          </label>
          <p className="text-xs leading-5 text-slate-500">ابدأ محادثة مع البوت أو أضفه إلى المجموعة قبل الاختبار، ثم أدخل Chat ID الصحيح.</p>
          <button type="button" disabled={testing !== null} onClick={() => testConnection('telegram')} className="rounded-xl border border-sky-200 px-4 py-2 text-sm font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50">
            {testing === 'telegram' ? 'جارٍ الاختبار وإرسال رسالة فعلية...' : 'اختبار الاتصال وإرسال رسالة'}
          </button>
        </section>
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200 p-5">
        <div>
          <h3 className="font-bold text-slate-900">التنبيهات والملخص</h3>
          <p className="mt-1 text-xs text-slate-500">تُرسل إلى كل قناة اكتمل إعدادها، ويمكن تفعيل الفئات المطلوبة فقط.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {optionLabels.map((option) => (
            <label key={option.key} className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3">
              <input type="checkbox" checked={status.options[option.key]} onChange={(event) => updateOption(option.key, event.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
              <span>
                <span className="block text-sm font-bold text-slate-800">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          موعد ملخص الوردية ثابت على {status.shiftEndTime} بتوقيت القاهرة (Africa/Cairo).
        </div>
      </section>

      <button type="button" disabled={saving} onClick={persist} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        حفظ إعدادات الربط والتنبيهات
      </button>
    </div>
  );
};
