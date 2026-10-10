import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Car, User, Package, FileText, Wrench, Building2, X, ArrowLeft } from 'lucide-react';
import { api } from '../../services/api';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>({
    vehicles: [],
    customers: [],
    items: [],
    jobCards: [],
    invoices: [],
    suppliers: [],
  });

  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults({ vehicles: [], customers: [], items: [], jobCards: [], invoices: [], suppliers: [] });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ vehicles: [], customers: [], items: [], jobCards: [], invoices: [], suppliers: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.globalSearch(query);
        setResults(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const handleSelect = (url: string) => {
    onClose();
    navigate(url);
  };

  const hasResults =
    results.vehicles.length > 0 ||
    results.customers.length > 0 ||
    results.items.length > 0 ||
    results.jobCards.length > 0 ||
    results.invoices.length > 0 ||
    results.suppliers.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <Search className="w-5 h-5 text-slate-400 ml-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث برقم اللوحة، رقم الشاسيه VIN، اسم العميل، الجوال، الصنف، الفاتورة، أمر الإصلاح..."
            className="flex-1 bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 text-sm md:text-base font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs bg-slate-200 text-slate-600 px-2.5 py-1 rounded-md hover:bg-slate-300 font-mono mr-1"
          >
            ESC
          </button>
        </div>

        {/* Results Area */}
        <div className="overflow-y-auto p-4 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin ml-2"></div>
              جاري البحث اللحظي...
            </div>
          )}

          {!loading && query.length > 0 && !hasResults && (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">لم يتم العثور على أي نتائج مطابقة لـ "{query}"</p>
              <p className="text-slate-400 text-xs mt-1">تأكد من كتابة أرقام اللوحة أو الحروف بشكل صحيح</p>
            </div>
          )}

          {!loading && !query && (
            <div className="py-8 px-4 text-center text-slate-400 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-lg mx-auto text-xs text-slate-500">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                  <Car className="w-4 h-4 text-brand-600" />
                  <span>لوحة: أ ب ج 1234</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-600" />
                  <span>أمر إصلاح: JC-2026-001</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600" />
                  <span>صنف: فحمات، كاسترول</span>
                </div>
              </div>
            </div>
          )}

          {/* 1. Vehicles Results (Section 21 Highlight) */}
          {results.vehicles.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                <Car className="w-4 h-4 text-brand-600" />
                السيارات والمركبات ({results.vehicles.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {results.vehicles.map((v: any) => (
                  <div
                    key={v.id}
                    onClick={() => handleSelect(`/vehicles/${v.id}`)}
                    className="p-3.5 bg-slate-50 hover:bg-brand-50/70 border border-slate-100 hover:border-brand-200 rounded-xl cursor-pointer transition-all flex items-start justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-bold text-slate-800 group-hover:text-brand-700">
                        <span className="bg-brand-600 text-white text-xs px-2 py-0.5 rounded font-mono">
                          {v.plateNumber}
                        </span>
                        <span>{v.make} {v.model} {v.year}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                        <span>المالك: {v.customer?.name}</span>
                        <span>•</span>
                        <span>العداد: {v.currentOdometer.toLocaleString()} كم</span>
                      </div>
                      {v.vin && <div className="text-[10px] text-slate-400 font-mono mt-0.5">VIN: {v.vin}</div>}
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:-translate-x-1 transition-all" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Job Cards Results */}
          {results.jobCards.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                <Wrench className="w-4 h-4 text-amber-600" />
                أوامر الإصلاح Job Cards ({results.jobCards.length})
              </div>
              <div className="space-y-2">
                {results.jobCards.map((j: any) => (
                  <div
                    key={j.id}
                    onClick={() => handleSelect(`/workshop/job-cards/${j.id}`)}
                    className="p-3 bg-slate-50 hover:bg-amber-50/70 border border-slate-100 hover:border-amber-200 rounded-xl cursor-pointer transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded text-xs">
                        {j.orderNumber}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-slate-800 group-hover:text-amber-900">
                          {j.customer?.name} - {j.vehicle?.make} {j.vehicle?.model} ({j.vehicle?.plateNumber})
                        </div>
                        <div className="text-xs text-slate-500 line-clamp-1">{j.customerComplaint}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2.5 py-1 bg-slate-200 text-slate-700 font-medium rounded-full">
                        {j.status}
                      </span>
                      <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-amber-700 group-hover:-translate-x-1 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Items Results */}
          {results.items.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                <Package className="w-4 h-4 text-emerald-600" />
                قطع الغيار والأصناف ({results.items.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {results.items.map((it: any) => (
                  <div
                    key={it.id}
                    onClick={() => handleSelect(`/items`)}
                    className="p-3 bg-slate-50 hover:bg-emerald-50/70 border border-slate-100 hover:border-emerald-200 rounded-xl cursor-pointer transition-all flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-800 group-hover:text-emerald-800 line-clamp-1">
                        {it.nameAr}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[11px] bg-slate-200 px-1.5 py-0.5 rounded">{it.sku}</span>
                        <span>المخزون: {it.totalQuantity}</span>
                        <span className="font-bold text-emerald-600">{it.sellPrice} ر.س</span>
                      </div>
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 group-hover:-translate-x-1 transition-all" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Customers Results */}
          {results.customers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                <User className="w-4 h-4 text-blue-600" />
                العملاء ({results.customers.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {results.customers.map((c: any) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelect(`/customers`)}
                    className="p-3 bg-slate-50 hover:bg-blue-50/70 border border-slate-100 hover:border-blue-200 rounded-xl cursor-pointer transition-all flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-800 group-hover:text-blue-800">{c.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {c.phone} • {c.customerType === 'COMPANY' ? 'شركة / أسطول' : 'فرد'}
                      </div>
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-blue-700 group-hover:-translate-x-1 transition-all" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Invoices Results */}
          {results.invoices.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                <FileText className="w-4 h-4 text-purple-600" />
                الفواتير ({results.invoices.length})
              </div>
              <div className="space-y-2">
                {results.invoices.map((inv: any) => (
                  <div
                    key={inv.id}
                    onClick={() => handleSelect(`/sales`)}
                    className="p-3 bg-slate-50 hover:bg-purple-50/70 border border-slate-100 hover:border-purple-200 rounded-xl cursor-pointer transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-purple-700 bg-purple-100 px-2 py-1 rounded text-xs">
                        {inv.invoiceNumber}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">
                          {inv.customer?.name || 'عميل نقدي'} - {inv.grandTotal} ر.س
                        </div>
                        <div className="text-xs text-slate-400">
                          {new Date(inv.date).toLocaleDateString('ar-SA')} • {inv.invoiceType}
                        </div>
                      </div>
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-purple-700 group-hover:-translate-x-1 transition-all" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.suppliers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                الموردون ({results.suppliers.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {results.suppliers.map((supplier: any) => (
                  <button
                    key={supplier.id}
                    type="button"
                    onClick={() => handleSelect('/suppliers')}
                    className="p-3 bg-slate-50 hover:bg-indigo-50/70 border border-slate-100 hover:border-indigo-200 rounded-xl text-right transition-all"
                  >
                    <span className="block text-sm font-bold text-slate-800">{supplier.name}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {supplier.code} • {supplier.company || supplier.phone}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
