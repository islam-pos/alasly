import React, { useState, useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Users,
  Car,
  Search,
  Plus,
  Phone,
  Building2,
  Calendar,
  CreditCard,
  ChevronLeft,
  X,
  Check,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const CustomersVehicles: React.FC = () => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'customers' | 'vehicles'>(
    location.pathname === '/vehicles' ? 'vehicles' : 'customers',
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [whatsappEdits, setWhatsappEdits] = useState<Record<string, { number: string; optIn: boolean }>>({});
  const [savingWhatsappId, setSavingWhatsappId] = useState<string | null>(null);

  // Forms
  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    mobile: '',
    whatsappNumber: '',
    whatsappOptIn: false,
    email: '',
    address: 'القاهرة',
    taxNumber: '',
    customerType: 'INDIVIDUAL',
    creditLimit: 5000,
    alsoSupplier: false,
  });

  const [vehicleForm, setVehicleForm] = useState({
    customerId: '',
    plateNumber: '',
    vin: '',
    make: 'تويوتا',
    model: '',
    year: 2023,
    color: 'أبيض',
    engineType: 'بنزين',
    currentOdometer: 0,
  });

  const [submitting, setSubmitting] = useState(false);
  const [searchParams] = useSearchParams();
  const { success, error } = useToast();
  const { hasPermission } = useAuth();
  const canViewVehicles = hasPermission('manage_workshop') || hasPermission('manage_sales');
  const canManageCustomers = canViewVehicles || hasPermission('manage_purchases');

  useEffect(() => {
    setActiveTab(location.pathname === '/vehicles' ? 'vehicles' : 'customers');
    loadData();
  }, [location.pathname]);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setCustomerModalOpen(true);
    }
  }, [searchParams]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cusRes, vehRes] = await Promise.all([
        api.getCustomers(),
        canViewVehicles && location.pathname === '/vehicles' ? api.getVehicles() : Promise.resolve({ data: [] }),
      ]);
      setCustomers(cusRes.data);
      setVehicles(vehRes.data);
      if (cusRes.data.length > 0) setVehicleForm((prev) => ({ ...prev, customerId: cusRes.data[0].id }));
    } catch (err) {
      console.error(err);
      error('تعذر تحميل بيانات العملاء أو المركبات');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name || !customerForm.phone) {
      error('اسم العميل ورقم الهاتف حقول إلزامية');
      return;
    }

    setSubmitting(true);
    try {
      await api.createCustomer(customerForm);
      success('تمت إضافة العميل بنجاح');
      setCustomerModalOpen(false);
      setCustomerForm({
        name: '',
        phone: '',
        mobile: '',
        whatsappNumber: '',
        whatsappOptIn: false,
        email: '',
        address: 'القاهرة',
        taxNumber: '',
        customerType: 'INDIVIDUAL',
        creditLimit: 5000,
        alsoSupplier: false,
      });
      loadData();
    } catch (err: any) {
      error(err.message || 'فشل حفظ العميل');
    } finally {
      setSubmitting(false);
    }
  };

  const saveCustomerWhatsapp = async (customer: any) => {
    const values = whatsappEdits[customer.id] || {
      number: customer.whatsappNumber || '',
      optIn: Boolean(customer.whatsappOptIn),
    };
    try {
      setSavingWhatsappId(customer.id);
      const response = await api.updateCustomer(customer.id, {
        whatsappNumber: values.number || null,
        whatsappOptIn: values.optIn,
      });
      setCustomers((current) => current.map((entry) => entry.id === customer.id
        ? { ...entry, ...response.data }
        : entry));
      setWhatsappEdits((current) => {
        const next = { ...current };
        delete next[customer.id];
        return next;
      });
      success('تم حفظ رقم واتساب العميل');
    } catch (err: any) {
      error(err.message || 'تعذر حفظ رقم واتساب العميل');
    } finally {
      setSavingWhatsappId(null);
    }
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleForm.customerId || !vehicleForm.plateNumber || !vehicleForm.make || !vehicleForm.model) {
      error('يرجى ملء المالك، رقم اللوحة، الماركة والموديل');
      return;
    }

    setSubmitting(true);
    try {
      await api.createVehicle({
        ...vehicleForm,
        year: parseInt(String(vehicleForm.year)),
        currentOdometer: parseInt(String(vehicleForm.currentOdometer)),
      });
      success('تمت إضافة السيارة بنجاح!');
      setVehicleModalOpen(false);
      loadData();
    } catch (err: any) {
      error(err.message || 'فشل حفظ السيارة');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredVehicles = vehicles.filter(
    (v) =>
      v.plateNumber.includes(searchQuery) ||
      v.make.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.customer && v.customer.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (v.vin && v.vin.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-600" />
            <span>سجل العملاء والسيارات والأسطول (Customers & Fleet)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة بيانات العملاء، حساباتهم، السيارات المرتبطة بكل عميل وسجلات الفحص والصيانة
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManageCustomers && <button
            onClick={() => setCustomerModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة عميل</span>
          </button>}
          {canViewVehicles && <button
            onClick={() => setVehicleModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-md shadow-slate-900/20"
          >
            <Car className="w-4 h-4" />
            <span>إضافة سيارة</span>
          </button>}
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'customers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              العملاء ({customers.length})
            </button>
            {canViewVehicles && <button
              onClick={() => setActiveTab('vehicles')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'vehicles' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              السيارات والأسطول ({vehicles.length})
            </button>}
          </div>

          <div className="w-full sm:w-80 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'customers'
                  ? 'بحث باسم العميل، الهاتف، الكود...'
                  : 'بحث برقم اللوحة، الماركة، الموديل، المالك...'
              }
              className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-brand-500 outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          </div>
        </div>
      </div>

      {/* Content Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {activeTab === 'customers' ? (
          /* Customers Table */
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                <tr>
                  <th className="p-3.5">كود العميل</th>
                  <th className="p-3.5">اسم العميل</th>
                  <th className="p-3.5">النوع</th>
                  <th className="p-3.5">الجوال والهاتف</th>
                  <th className="p-3.5">واتساب وموافقة الإرسال</th>
                  <th className="p-3.5">السيارات المرتبطة</th>
                  <th className="p-3.5">الرصيد المالي الحالي</th>
                  <th className="p-3.5">الحد الائتماني</th>
                  <th className="p-3.5 text-center">أوامر الصيانة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-slate-700">{c.code}</td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">{c.name}</div>
                      {c.supplier && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">مورد وعميل</span>}
                      {c.taxNumber && (
                        <div className="text-[10px] text-slate-400 font-mono">الرقم الضريبي: {c.taxNumber}</div>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.customerType === 'COMPANY'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {c.customerType === 'COMPANY' ? 'شركة / أسطول' : 'فرد'}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-600">{c.phone}</td>
                    <td className="p-3.5">
                      {(() => {
                        const values = whatsappEdits[c.id] || {
                          number: c.whatsappNumber || '',
                          optIn: Boolean(c.whatsappOptIn),
                        };
                        return (
                          <div className="flex min-w-48 flex-col gap-1">
                            <input
                              type="tel"
                              value={values.number}
                              onChange={(event) => setWhatsappEdits((current) => ({
                                ...current,
                                [c.id]: { ...values, number: event.target.value },
                              }))}
                              placeholder="+201XXXXXXXXX"
                              dir="ltr"
                              className="rounded-md border px-2 py-1 font-mono"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-1 text-[10px]">
                                <input
                                  type="checkbox"
                                  checked={values.optIn}
                                  onChange={(event) => setWhatsappEdits((current) => ({
                                    ...current,
                                    [c.id]: { ...values, optIn: event.target.checked },
                                  }))}
                                />
                                وافق على الرسائل
                              </label>
                              <button
                                type="button"
                                disabled={savingWhatsappId === c.id}
                                onClick={() => saveCustomerWhatsapp(c)}
                                className="rounded bg-blue-50 px-2 py-1 font-bold text-blue-700 disabled:opacity-50"
                              >
                                حفظ
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap gap-1">
                        {c.vehicles?.map((v: any) => (
                          <Link
                            key={v.id}
                            to={`/vehicles/${v.id}`}
                            className="bg-slate-100 hover:bg-brand-50 hover:text-brand-700 px-2 py-0.5 rounded text-[11px] font-mono font-bold text-slate-700"
                          >
                            {v.plateNumber}
                          </Link>
                        ))}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`font-bold font-mono text-xs ${
                          c.currentBalance > 0
                            ? 'text-rose-600'
                            : c.currentBalance < 0
                            ? 'text-blue-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {c.currentBalance.toLocaleString()} ر.س
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-500">{c.creditLimit.toLocaleString()} ر.س</td>
                    <td className="p-3.5 text-center font-bold text-brand-600">
                      {c._count?.repairOrders || 0} أمر
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Vehicles Table */
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                <tr>
                  <th className="p-3.5">رقم اللوحة</th>
                  <th className="p-3.5">السيارة والموديل</th>
                  <th className="p-3.5">المالك</th>
                  <th className="p-3.5">سنة الصنع</th>
                  <th className="p-3.5">العداد الحالي</th>
                  <th className="p-3.5">رقم الشاسيه VIN</th>
                  <th className="p-3.5">مرات الصيانة</th>
                  <th className="p-3.5 text-center">الملف الكامل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredVehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <span className="bg-slate-900 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg">
                        {v.plateNumber}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-900">
                      {v.make} {v.model}
                    </td>
                    <td className="p-3.5 text-slate-700 font-bold">{v.customer?.name}</td>
                    <td className="p-3.5 font-mono text-slate-600">{v.year}</td>
                    <td className="p-3.5 font-mono font-bold text-slate-900">
                      {v.currentOdometer.toLocaleString()} كم
                    </td>
                    <td className="p-3.5 font-mono text-slate-400 text-[11px]">{v.vin || '-'}</td>
                    <td className="p-3.5 font-bold text-brand-700">{v._count?.repairOrders || 0}</td>
                    <td className="p-3.5 text-center">
                      <Link
                        to={`/vehicles/${v.id}`}
                        className="px-3 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold rounded-lg text-xs"
                      >
                        بروفايل السيارة
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-600" />
                <span>إضافة عميل جديد</span>
              </h3>
              <button onClick={() => setCustomerModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم العميل *</label>
                <input
                  type="text"
                  required
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                  placeholder="الاسم الكامل أو اسم الشركة"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">نوع العميل</label>
                  <select
                    value={customerForm.customerType}
                    onChange={(e) => setCustomerForm({ ...customerForm, customerType: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="INDIVIDUAL">فرد</option>
                    <option value="COMPANY">شركة / أسطول</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الجوال *</label>
                  <input
                    type="text"
                    required
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    placeholder="05XXXXXXXX"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الرقم الضريبي (اختياري)</label>
                <input
                  type="text"
                  value={customerForm.taxNumber}
                  onChange={(e) => setCustomerForm({ ...customerForm, taxNumber: e.target.value })}
                  placeholder="3XXXXXXXXXXXXXX"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم واتساب العميل</label>
                <input
                  type="tel"
                  value={customerForm.whatsappNumber}
                  onChange={(e) => setCustomerForm({ ...customerForm, whatsappNumber: e.target.value })}
                  placeholder="+201XXXXXXXXX"
                  dir="ltr"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={customerForm.whatsappOptIn} onChange={(e) => setCustomerForm({ ...customerForm, whatsappOptIn: e.target.checked })} className="h-4 w-4" />
                وافق العميل على استلام الفواتير عبر واتساب
              </label>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الحد الائتماني (ر.س)</label>
                <input
                  type="number"
                  value={customerForm.creditLimit}
                  onChange={(e) => setCustomerForm({ ...customerForm, creditLimit: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={customerForm.alsoSupplier}
                  onChange={(e) => setCustomerForm({ ...customerForm, alsoSupplier: e.target.checked })}
                  className="h-4 w-4 accent-brand-600"
                />
                تسجيل هذا العميل كمورد أيضًا
              </label>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ العميل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {vehicleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Car className="w-5 h-5 text-brand-600" />
                <span>إضافة سيارة جديدة لعميل</span>
              </h3>
              <button onClick={() => setVehicleModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">المالك *</label>
                <select
                  value={vehicleForm.customerId}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, customerId: e.target.value })}
                  required
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم اللوحة *</label>
                  <input
                    type="text"
                    required
                    value={vehicleForm.plateNumber}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })}
                    placeholder="مثلاً: أ ب ج 1234"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الماركة *</label>
                  <input
                    type="text"
                    required
                    value={vehicleForm.make}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                    placeholder="تويوتا، هيونداي..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الموديل *</label>
                  <input
                    type="text"
                    required
                    value={vehicleForm.model}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                    placeholder="كامري، سوناتا..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">سنة الصنع</label>
                  <input
                    type="number"
                    value={vehicleForm.year}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, year: parseInt(e.target.value) || 2023 })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">العداد الحالي (كم)</label>
                  <input
                    type="number"
                    value={vehicleForm.currentOdometer}
                    onChange={(e) =>
                      setVehicleForm({ ...vehicleForm, currentOdometer: parseInt(e.target.value) || 0 })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الهيكل VIN</label>
                  <input
                    type="text"
                    value={vehicleForm.vin}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, vin: e.target.value })}
                    placeholder="17 حرف ورقم"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ السيارة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVehicleModalOpen(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
