import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, Mail, Wrench } from 'lucide-react';
import { api } from '../services/api';

const tokenFromFragment = () => new URLSearchParams(window.location.hash.slice(1)).get('token') || '';

export const PasswordReset: React.FC = () => {
  const [token] = useState(tokenFromFragment);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    if (token && password !== confirmation) {
      setErrorMessage('كلمتا المرور غير متطابقتين');
      return;
    }
    if (token && password.toLowerCase() === 'admin') {
      setErrorMessage('اختر كلمة مرور مختلفة عن admin');
      return;
    }

    setSubmitting(true);
    try {
      const response = token
        ? await api.completePasswordReset(token, password)
        : await api.requestPasswordReset(email);
      setMessage(response.message);
      if (token) {
        setPassword('');
        setConfirmation('');
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إكمال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <main className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-lg">
            {token ? <Lock className="h-7 w-7" /> : <Mail className="h-7 w-7" />}
          </div>
          <h1 className="text-2xl font-black text-slate-900">{token ? 'تعيين كلمة مرور جديدة' : 'استعادة كلمة المرور'}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {token
              ? 'اختر كلمة مرور جديدة لحسابك.'
              : 'أدخل البريد المسجل بحسابك. سيراجع مدير النظام طلب الاستعادة قبل إرسال رابط التعيين.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!token ? (
            <label className="block text-sm font-bold text-slate-700">
              البريد الإلكتروني
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                dir="ltr"
              />
            </label>
          ) : (
            <>
              <label className="block text-sm font-bold text-slate-700">
                كلمة المرور الجديدة
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={15}
                  pattern="[A-Za-z0-9]{12,15}"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  dir="ltr"
                />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                تأكيد كلمة المرور
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={15}
                  pattern="[A-Za-z0-9]{12,15}"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  dir="ltr"
                />
              </label>
            </>
          )}

          {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
          {errorMessage && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-500/25 disabled:opacity-50"
          >
            <span>{submitting ? 'جارٍ الإرسال...' : token ? 'حفظ كلمة المرور' : 'إرسال طلب الموافقة'}</span>
            <ArrowLeft className="h-4 w-4" />
          </button>
        </form>

        <Link to="/login" className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-brand-700">
          <Wrench className="h-4 w-4" /> العودة لتسجيل الدخول
        </Link>
      </main>
    </div>
  );
};