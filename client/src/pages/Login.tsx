import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Lock, User as UserIcon, ArrowLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      error('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setSubmitting(true);
    try {
      await login({ username, password });
      success('تم تسجيل الدخول بنجاح');
      navigate('/');
    } catch (err: any) {
      error(err.message || 'فشل تسجيل الدخول');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = (u: string, p: string = 'admin123') => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 selection:bg-brand-500 selection:text-white">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-slate-100 relative overflow-hidden">
        {/* Background accent */}
        <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-brand-600 via-amber-500 to-emerald-500"></div>

        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-brand-600 to-brand-800 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand-500/30">
            <Wrench className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">نظام المحترف AutoCare</h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            ERP إدارة مركز صيانة السيارات ومبيعات قطع الغيار
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المستخدم</label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              />
              <UserIcon className="w-5 h-5 text-slate-400 absolute right-3 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">كلمة المرور</label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              />
              <Lock className="w-5 h-5 text-slate-400 absolute right-3 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-lg shadow-brand-500/25 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 mt-2"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <span>تسجيل الدخول إلى النظام</span>
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Logins Section */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center mb-3">
            تجربة فورية بحسابات النظام التجريبية (اختر الدور):
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin')}
              className={`p-2 rounded-xl border text-xs font-bold text-right transition-all flex items-center justify-between ${
                username === 'admin'
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>المدير العام (Admin)</span>
              {username === 'admin' && <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />}
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('workshop')}
              className={`p-2 rounded-xl border text-xs font-bold text-right transition-all flex items-center justify-between ${
                username === 'workshop'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>مدير الورشة</span>
              {username === 'workshop' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('cashier')}
              className={`p-2 rounded-xl border text-xs font-bold text-right transition-all flex items-center justify-between ${
                username === 'cashier'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>كاشير المبيعات</span>
              {username === 'cashier' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('store')}
              className={`p-2 rounded-xl border text-xs font-bold text-right transition-all flex items-center justify-between ${
                username === 'store'
                  ? 'bg-purple-50 border-purple-300 text-purple-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>أمين المستودع</span>
              {username === 'store' && <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />}
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('accountant')}
              className={`col-span-2 p-2 rounded-xl border text-xs font-bold text-right transition-all flex items-center justify-between ${
                username === 'accountant'
                  ? 'bg-teal-50 border-teal-300 text-teal-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>المحاسب المالي (Accountant)</span>
              {username === 'accountant' && <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
