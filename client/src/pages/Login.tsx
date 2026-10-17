import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Lock, User as UserIcon, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaStep, setMfaStep] = useState<'login' | 'verify' | 'enroll'>('login');
  const [setupToken, setSetupToken] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, completeLogin } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaStep === 'login' && (!username || !password)) {
      error('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setSubmitting(true);
    try {
      if (mfaStep === 'enroll') {
        const response = await api.enableMfa(setupToken, mfaSecret, mfaCode);
        completeLogin(response);
        success('تم تفعيل المصادقة الثنائية وتسجيل الدخول بنجاح');
        navigate('/');
        return;
      }
      const response = await login({
        username,
        password,
        ...(mfaStep === 'verify' ? { mfaCode } : {}),
      });
      if (response.mfaSetupRequired) {
        setSetupToken(response.setupToken);
        const setup = await api.setupMfa(response.setupToken);
        setMfaSecret(setup.secret);
        setQrCodeDataUrl(setup.qrCodeDataUrl);
        setMfaStep('enroll');
        success('امسح رمز QR بتطبيق المصادقة ثم أدخل الرمز الظاهر لإكمال الإعداد');
      } else if (response.mfaRequired) {
        setMfaStep('verify');
        setMfaCode('');
      } else if (response.token) {
        success('تم تسجيل الدخول بنجاح');
        navigate('/');
      } else {
        throw new Error('استجابة تسجيل الدخول غير مكتملة');
      }
    } catch (err: any) {
      error(err.message || 'فشل تسجيل الدخول');
    } finally {
      setSubmitting(false);
    }
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

        {mfaStep === 'enroll' && (
          <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
            <p className="mb-3 text-sm font-bold text-slate-800">إعداد المصادقة الثنائية لمدير النظام</p>
            {qrCodeDataUrl && <img src={qrCodeDataUrl} alt="رمز إعداد المصادقة الثنائية" className="mx-auto mb-3 h-44 w-44" />}
            <p className="text-xs text-slate-600">أو أدخل المفتاح يدوياً في تطبيق Authenticator</p>
            <code className="mt-1 inline-block select-all rounded bg-white px-2 py-1 text-sm font-bold tracking-widest">{mfaSecret}</code>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mfaStep !== 'enroll' && (
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
          )}

          {mfaStep !== 'enroll' && (
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
          )}

            {mfaStep !== 'login' && (
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  {mfaStep === 'enroll' ? 'رمز التطبيق لإكمال التفعيل' : 'رمز المصادقة الثنائية'}
                </label>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center font-mono text-lg tracking-[0.4em] text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-lg shadow-brand-500/25 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 mt-2"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <span>{mfaStep === 'enroll' ? 'تفعيل المصادقة وإكمال الدخول' : mfaStep === 'verify' ? 'التحقق والدخول' : 'تسجيل الدخول إلى النظام'}</span>
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
};
