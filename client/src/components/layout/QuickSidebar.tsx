import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Zap,
  ShoppingCart,
  Wrench,
  Receipt,
  FileSpreadsheet,
  PackageMinus,
  ArrowDownLeft,
  ArrowUpRight,
  UserPlus,
  PackagePlus,
  Warehouse,
  Car,
} from 'lucide-react';
import { api } from '../../services/api';

export const QuickSidebar: React.FC = () => {
  const location = useLocation();
  const [support, setSupport] = useState({
    supportTitle: 'الدعم الفني والخدمات',
    supportDescription: 'مركز صيانة متكامل 24/7 مع نظام فحص إلكتروني دقيق.',
    supportPhoneLabel: 'الرقم الموحد',
    supportPhone: '920000000',
  });

  useEffect(() => {
    const cachedCompany = localStorage.getItem('alasly-print-company');
    if (cachedCompany) {
      try {
        const company = JSON.parse(cachedCompany);
        setSupport({
          supportTitle: company.supportTitle || 'الدعم الفني والخدمات',
          supportDescription: company.supportDescription || 'مركز صيانة متكامل 24/7 مع نظام فحص إلكتروني دقيق.',
          supportPhoneLabel: company.supportPhoneLabel || 'الرقم الموحد',
          supportPhone: company.supportPhone || '920000000',
        });
      } catch (error) {
        console.error('Failed to read cached company support details:', error);
      }
    }

    const loadSupport = () => {
      api.master.getCompany()
        .then(({ data }) => {
          const details = {
            supportTitle: data.supportTitle || 'الدعم الفني والخدمات',
            supportDescription: data.supportDescription || 'مركز صيانة متكامل 24/7 مع نظام فحص إلكتروني دقيق.',
            supportPhoneLabel: data.supportPhoneLabel || 'الرقم الموحد',
            supportPhone: data.supportPhone || '920000000',
          };
          setSupport(details);
          localStorage.setItem('alasly-print-company', JSON.stringify(data));
        })
        .catch((error) => console.error('Failed to load company support details:', error));
    };
    loadSupport();
    window.addEventListener('alasly-company-updated', loadSupport);
    return () => window.removeEventListener('alasly-company-updated', loadSupport);
  }, []);

  const shortcuts = [
    { label: 'فاتورة بيع (POS)', to: '/pos', icon: ShoppingCart, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'فتح أمر إصلاح', to: '/workshop/job-cards?action=new', icon: Wrench, color: 'text-amber-600 bg-amber-50' },
    { label: 'فاتورة صيانة', to: '/sales?type=MAINTENANCE', icon: Receipt, color: 'text-blue-600 bg-blue-50' },
    { label: 'فاتورة مشتريات', to: '/purchases?action=new', icon: FileSpreadsheet, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'صرف قطع للورشة', to: '/warehouses?action=issue', icon: PackageMinus, color: 'text-rose-600 bg-rose-50' },
    { label: 'سند قبض', to: '/financials?action=receipt', icon: ArrowDownLeft, color: 'text-teal-600 bg-teal-50' },
    { label: 'سند صرف', to: '/financials?action=payment', icon: ArrowUpRight, color: 'text-orange-600 bg-orange-50' },
    { label: 'إضافة عميل', to: '/customers?action=new', icon: UserPlus, color: 'text-sky-600 bg-sky-50' },
    { label: 'إضافة صنف', to: '/items?action=new', icon: PackagePlus, color: 'text-violet-600 bg-violet-50' },
    { label: 'المخزون', to: '/warehouses', icon: Warehouse, color: 'text-slate-600 bg-slate-100' },
    { label: 'سيارات الورشة', to: '/workshop/job-cards?filter=in_shop', icon: Car, color: 'text-red-600 bg-red-50' },
  ];

  return (
    <aside className="w-56 flex-shrink-0 hidden xl:block bg-white border-l border-slate-200 h-[calc(100vh-6.5rem)] sticky top-28 overflow-y-auto p-3 select-none">
      <div className="flex items-center gap-2 px-3 py-2 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
        <Zap className="w-3.5 h-3.5 text-amber-500" />
        اختصارات العمليات السريعة
      </div>

      <div className="space-y-1">
        {shortcuts.map((sc, i) => {
          const Icon = sc.icon;
          const isActive = location.pathname === sc.to;

          return (
            <Link
              key={i}
              to={sc.to}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all group ${
                isActive
                  ? 'bg-brand-50 text-brand-700 font-bold border border-brand-200 shadow-sm'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className={`p-1.5 rounded-lg ${sc.color} group-hover:scale-110 transition-transform`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="truncate">{sc.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 p-3 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl shadow-sm text-center">
        <div className="text-xs font-bold mb-1 text-slate-200">{support.supportTitle}</div>
        <div className="text-[11px] text-slate-400 leading-relaxed mb-2">
          {support.supportDescription}
        </div>
        <div className="text-[10px] text-amber-400 font-mono font-bold">{support.supportPhoneLabel}: {support.supportPhone}</div>
      </div>
    </aside>
  );
};
