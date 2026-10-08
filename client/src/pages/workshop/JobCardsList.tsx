import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Wrench,
  Search,
  Plus,
  Car,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Filter,
  ArrowLeft,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const JobCardsList: React.FC = () => {
  const [jobCards, setJobCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [newModalOpen, setNewModalOpen] = useState(false);

  // New Job Card Form State
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [odometer, setOdometer] = useState<number>(0);
  const [fuelLevel, setFuelLevel] = useState('50%');
  const [technicianId, setTechnicianId] = useState('');
  const [serviceAdvisorId, setServiceAdvisorId] = useState('');
  const [complaint, setComplaint] = useState('');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [searchParams] = useSearchParams();
  const { success, error } = useToast();

  useEffect(() => {
    loadJobCards();
    loadLookups();
    if (searchParams.get('action') === 'new') {
      setNewModalOpen(true);
    }
  }, [searchParams]);

  const loadJobCards = async () => {
    setLoading(true);
    try {
      const res = await api.getJobCards();
      setJobCards(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLookups = async () => {
    try {
      const [cusRes, vehRes, empRes] = await Promise.all([
        api.getCustomers(),
        api.getVehicles(),
        api.getEmployees(),
      ]);
      setCustomers(cusRes.data);
      setVehicles(vehRes.data);
      setEmployees(empRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const customerVehicles = vehicles.filter((v) => v.customerId === customerId);
    if (customerVehicles.length > 0) {
      setSelectedVehicleId(customerVehicles[0].id);
      setOdometer(customerVehicles[0].currentOdometer || 0);
    } else {
      setSelectedVehicleId('');
      setOdometer(0);
    }
  };

  const handleCreateJobCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !selectedVehicleId || !complaint) {
      error('يرجى اختيار العميل، السيارة وكتابة شكوى العميل');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customerId: selectedCustomerId,
        vehicleId: selectedVehicleId,
        currentOdometer: odometer,
        fuelLevel,
        technicianId: technicianId || null,
        serviceAdvisorId: serviceAdvisorId || null,
        customerComplaint: complaint,
        intakeNotes,
      };

      const res = await api.createJobCard(payload);
      success(`تم فتح أمر الإصلاح رقم ${res.orderNumber} بنجاح`);
      setNewModalOpen(false);
      // Reset
      setComplaint('');
      setIntakeNotes('');
      loadJobCards();
    } catch (err: any) {
      error(err.message || 'فشل فتح أمر الإصلاح');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'NEW':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">جديد</span>;
      case 'PENDING_INSPECTION':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">بانتظار الفحص</span>;
      case 'PENDING_APPROVAL':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">بانتظار موافقة العميل</span>;
      case 'APPROVED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">معتمد للعمل</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 animate-pulse">قيد الإصلاح</span>;
      case 'WAITING_PARTS':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">بانتظار قطع الغيار</span>;
      case 'READY_FOR_DELIVERY':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">جاهز للتسليم</span>;
      case 'CLOSED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">مغلق ومفوتر</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  const filteredCards = jobCards.filter((jc) => {
    const matchesStatus = statusFilter === 'ALL' || jc.status === statusFilter;
    const matchesQuery =
      !searchQuery ||
      jc.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      jc.customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      jc.vehicle?.plateNumber.includes(searchQuery) ||
      jc.customerComplaint.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-brand-600" />
            <span>إدارة أوامر الإصلاح والصيانة (Job Cards)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            متابعة دورة صيانة السيارات في الورشة من لحظة الاستقبال وحتى التسليم والفوترة
          </p>
        </div>

        <button
          onClick={() => setNewModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>فتح أمر إصلاح جديد</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="البحث برقم أمر الإصلاح، اسم العميل، رقم اللوحة..."
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-brand-500 outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { key: 'ALL', label: 'الكل' },
              { key: 'NEW', label: 'جديد' },
              { key: 'PENDING_APPROVAL', label: 'بانتظار الموافقة' },
              { key: 'IN_PROGRESS', label: 'قيد الإصلاح' },
              { key: 'READY_FOR_DELIVERY', label: 'جاهز للتسليم' },
              { key: 'CLOSED', label: 'مغلق' },
            ].map((st) => (
              <button
                key={st.key}
                onClick={() => setStatusFilter(st.key)}
                className={`px-3 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
                  statusFilter === st.key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <tr>
                <th className="p-3.5">رقم الأمر</th>
                <th className="p-3.5">السيارة واللوحة</th>
                <th className="p-3.5">العميل</th>
                <th className="p-3.5">شكوى العميل</th>
                <th className="p-3.5">الفني المسؤول</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">الإجمالي</th>
                <th className="p-3.5">التاريخ</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    جاري تحميل أوامر الإصلاح...
                  </td>
                </tr>
              ) : filteredCards.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400">
                    لا توجد أوامر إصلاح مطابقة
                  </td>
                </tr>
              ) : (
                filteredCards.map((jc) => (
                  <tr key={jc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-brand-700">
                      <Link to={`/workshop/job-cards/${jc.id}`} className="hover:underline">
                        {jc.orderNumber}
                      </Link>
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold flex items-center gap-1.5">
                        <span className="bg-slate-900 text-white text-[11px] px-1.5 py-0.5 rounded font-mono">
                          {jc.vehicle?.plateNumber}
                        </span>
                        <span>{jc.vehicle?.make} {jc.vehicle?.model}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        العداد: {jc.currentOdometer.toLocaleString()} كم
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">{jc.customer?.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{jc.customer?.phone}</div>
                    </td>
                    <td className="p-3.5 max-w-xs">
                      <div className="truncate text-slate-600">{jc.customerComplaint}</div>
                    </td>
                    <td className="p-3.5 text-slate-600">
                      {jc.technician ? jc.technician.name : <span className="text-slate-400">غير محدد</span>}
                    </td>
                    <td className="p-3.5">{statusBadge(jc.status)}</td>
                    <td className="p-3.5 font-bold text-slate-900">
                      {jc.grandTotal ? `${jc.grandTotal.toLocaleString()} ر.س` : '-'}
                    </td>
                    <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                      {new Date(jc.createdAt).toLocaleDateString('ar-SA')}
                    </td>
                    <td className="p-3.5 text-center">
                      <Link
                        to={`/workshop/job-cards/${jc.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-50 text-brand-700 hover:bg-brand-100 rounded-lg font-bold text-xs transition-colors"
                      >
                        <span>فتح الملف</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Job Card Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Wrench className="w-5 h-5 text-brand-600" />
                <span>فتح أمر إصلاح جديد (Job Card)</span>
              </h3>
              <button
                onClick={() => setNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateJobCard} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Customer */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">العميل *</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="">-- اختر العميل --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Vehicle */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">السيارة *</label>
                  <select
                    value={selectedVehicleId}
                    onChange={(e) => {
                      setSelectedVehicleId(e.target.value);
                      const veh = vehicles.find((v) => v.id === e.target.value);
                      if (veh) setOdometer(veh.currentOdometer || 0);
                    }}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="">-- اختر السيارة --</option>
                    {(selectedCustomerId
                      ? vehicles.filter((v) => v.customerId === selectedCustomerId)
                      : vehicles
                    ).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber} - {v.make} {v.model} ({v.year})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Current Odometer */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">قراءة العداد الحالية (كم)</label>
                  <input
                    type="number"
                    value={odometer}
                    onChange={(e) => setOdometer(parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>

                {/* Fuel Level */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">مستوى الوقود</label>
                  <select
                    value={fuelLevel}
                    onChange={(e) => setFuelLevel(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="0%">خزان فارغ (0%)</option>
                    <option value="25%">ربع (25%)</option>
                    <option value="50%">نصف (50%)</option>
                    <option value="75%">ثلاثة أرباع (75%)</option>
                    <option value="100%">خزان ممتلئ (100%)</option>
                  </select>
                </div>

                {/* Technician */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الفني المكلف بالعمل</label>
                  <select
                    value={technicianId}
                    onChange={(e) => setTechnicianId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="">-- تعيين لاحقاً --</option>
                    {employees
                      .filter((emp) => emp.department === 'الورشة')
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.job?.name})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Service Advisor */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">مهندس الاستقبال</label>
                  <select
                    value={serviceAdvisorId}
                    onChange={(e) => setServiceAdvisorId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="">-- مهندس الاستقبال --</option>
                    {employees
                      .filter((emp) => emp.department === 'الاستقبال' || emp.department === 'الإدارة الفنية')
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Customer Complaint */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">شكوى العميل وأعطال السيارة *</label>
                <textarea
                  rows={3}
                  value={complaint}
                  onChange={(e) => setComplaint(e.target.value)}
                  required
                  placeholder="سجل شكوى العميل بالتفصيل: مثلاً صوت ونه مع الفرامل، تفتفة عند السرعة العالية، نقص ماء الرديتر..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              {/* Intake Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات الاستقبال وحالة هيكل السيارة</label>
                <textarea
                  rows={2}
                  value={intakeNotes}
                  onChange={(e) => setIntakeNotes(e.target.value)}
                  placeholder="خدوش سابقة، كسر في الأنوار، أغراض شخصية داخل السيارة..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-500/20"
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>فتح أمر الإصلاح ومباشرة الفحص</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setNewModalOpen(false)}
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
