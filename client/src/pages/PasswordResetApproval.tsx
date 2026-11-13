import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import { api } from '../services/api';

const tokenFromFragment = () => new URLSearchParams(window.location.hash.slice(1)).get('token') || '';

export const PasswordResetApproval: React.FC = () => {
  const [token] = useState(tokenFromFragment);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const decide = async (decision: 'approve' | 'reject') => {
    setSubmitting(true);
    setErrorMessage('');
    try {
      const response = await api.decidePasswordReset(token, decision);
      setMessage(response.message);
      window.history.replaceState(null, '', window.location.pathname);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر معالجة الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <main className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <h1 className="text-2xl font-black text-slate-900">موافقة إعادة تعيين كلمة المرور</h1>
        <p className="mt-2 text-sm text-slate-600">اعتمد الطلب أو ارفضه. الموافقة ترسل رابطاً مؤقتاً إلى البريد المسجل للحساب.</p>
        {message && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {errorMessage && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</p>}
        {!message && token && (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void decide('approve')}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> موافقة
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void decide('reject')}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-3 font-bold text-white disabled:opacity-50"
            >
              <X className="h-4 w-4" /> رفض
            </button>
          </div>
        )}
        {!token && !message && <p role="alert" className="mt-5 text-sm text-rose-800">الرابط غير صالح أو لا يحتوي على رمز الموافقة.</p>}
        <Link to="/login" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-brand-700">
          العودة لتسجيل الدخول <ArrowLeft className="h-4 w-4" />
        </Link>
      </main>
    </div>
  );
};