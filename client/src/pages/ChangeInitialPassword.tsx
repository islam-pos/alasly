import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const ChangeInitialPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { completeLogin } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      error('كلمتا المرور غير متطابقتين');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.changeInitialPassword(password);
      if (!response.token || !response.user || response.user.mustChangePassword) {
        throw new Error('تعذر إكمال تغيير كلمة المرور');
      }
      completeLogin(response);
      success('تم تغيير كلمة المرور بنجاح');
      navigate('/', { replace: true });
    } catch (err) {
      error(err instanceof Error ? err.message : 'تعذر تغيير كلمة المرور');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <h1 className="text-xl font-black text-slate-900">غيّر كلمة المرور المؤقتة</h1>
        <p className="mt-2 text-sm text-slate-600">
          يجب تعيين كلمة مرور جديدة قبل استخدام النظام. استخدم من 12 إلى 15 خانة من الأحرف الإنجليزية والأرقام، ولا تستخدم كلمة admin.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block space-y-1.5 text-sm font-bold text-slate-700">
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
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left"
              dir="ltr"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-bold text-slate-700">
            تأكيد كلمة المرور الجديدة
            <input
              type="password"
              required
              minLength={12}
              maxLength={15}
              pattern="[A-Za-z0-9]{12,15}"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left"
              dir="ltr"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-brand-600 px-4 py-3 font-bold text-white disabled:opacity-50"
          >
            {submitting ? 'جارٍ التغيير...' : 'حفظ كلمة المرور والدخول'}
          </button>
        </form>
      </div>
    </div>
  );
};
