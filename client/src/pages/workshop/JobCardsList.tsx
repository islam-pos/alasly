import React, { useRef, useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  ImagePlus,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { getWorkshopEmployeesForRole, toWorkshopEmployeeOption } from '../../utils/workshopEmployees';

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
  const [employeeLoadError, setEmployeeLoadError] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [manualCustomerOpen, setManualCustomerOpen] = useState(false);
  const [manualVehicleOpen, setManualVehicleOpen] = useState(false);
  const [manualCustomer, setManualCustomer] = useState({ name: '', phone: '', mobile: '' });
  const [manualVehicle, setManualVehicle] = useState({ plateNumber: '', make: '', model: '', year: String(new Date().getFullYear()), vin: '', currentOdometer: '0', color: '' });
  const [odometer, setOdometer] = useState<number>(0);
  const [fuelLevel, setFuelLevel] = useState('50%');
  const [technicianId, setTechnicianId] = useState('');
  const [serviceAdvisorId, setServiceAdvisorId] = useState('');
  const [complaint, setComplaint] = useState('');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [intakePhotos, setIntakePhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const intakePhotoInputRef = useRef<HTMLInputElement>(null);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
    const [cusRes, vehRes, empRes] = await Promise.allSettled([
      api.getCustomers(),
      api.getVehicles(),
      api.getWorkshopEmployees(),
    ]);
    if (cusRes.status === 'fulfilled') setCustomers(cusRes.value.data || []);
    else console.error('Could not load workshop customers:', cusRes.reason);
    if (vehRes.status === 'fulfilled') setVehicles(vehRes.value.data || []);
    else console.error('Could not load workshop vehicles:', vehRes.reason);
    if (empRes.status === 'fulfilled') {
      setEmployees(Array.isArray(empRes.value.data) ? empRes.value.data : []);
      setEmployeeLoadError('');
    } else {
      console.error('Could not load workshop employees:', empRes.reason);
      setEmployees([]);
      setEmployeeLoadError('تعذر تحميل قائمة الموظفين. يمكنك فتح أمر الإصلاح دون إسناد، ثم مراجعة الاتصال أو صلاحية الموظفين.');
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

  const createManualCustomer = async () => {
    if (!manualCustomer.name.trim() || !manualCustomer.phone.trim()) {
      error('اسم العميل ورقم الهاتف مطلوبان');
      return;
    }
    try {
      const res = await api.createCustomer({
        name: manualCustomer.name.trim(),
        phone: manualCustomer.phone.trim(),
        mobile: manualCustomer.mobile.trim() || null,
        customerType: 'INDIVIDUAL',
      });
      const customer = res.data?.id ? res.data : res;
      setCustomers((current) => [customer, ...current]);
      setSelectedCustomerId(customer.id);
      setManualCustomerOpen(false);
      setManualCustomer({ name: '', phone: '', mobile: '' });
      success('تمت إضافة العميل بنجاح');
    } catch (err: any) {
      error(err.message || 'تعذر إضافة العميل');
    }
  };

  const createManualVehicle = async () => {
    if (!selectedCustomerId) {
      error('اختر العميل أو أضف عميلًا أولاً');
      return;
    }
    if (!manualVehicle.plateNumber.trim() || !manualVehicle.make.trim() || !manualVehicle.model.trim()) {
      error('رقم اللوحة والماركة والموديل مطلوبة');
      return;
    }
    try {
      const res = await api.createVehicle({
        customerId: selectedCustomerId,
        plateNumber: manualVehicle.plateNumber.trim(),
        make: manualVehicle.make.trim(),
        model: manualVehicle.model.trim(),
        year: Number(manualVehicle.year) || new Date().getFullYear(),
        vin: manualVehicle.vin.trim() || null,
        currentOdometer: parseInt(manualVehicle.currentOdometer) || 0,
        color: manualVehicle.color.trim() || null,
      });
      const vehicle = res.data?.id ? res.data : res;
      setVehicles((current) => [vehicle, ...current]);
      setSelectedVehicleId(vehicle.id);
      setOdometer(vehicle.currentOdometer || 0);
      setManualVehicleOpen(false);
      setManualVehicle({ plateNumber: '', make: '', model: '', year: String(new Date().getFullYear()), vin: '', currentOdometer: '0', color: '' });
      success('تمت إضافة السيارة واختيارها للأمر');
    } catch (err: any) {
      error(err.message || 'تعذر إضافة السيارة');
    }
  };

  const handleIntakePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (intakePhotos.length + files.length > 20) {
      error('الحد الأقصى 20 صورة عند استقبال السيارة');
      return;
    }
    const invalidFile = files.find((file) =>
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024,
    );
    if (invalidFile) {
      error('استخدم صور JPG أو PNG أو WebP لا يتجاوز حجم كل منها 3 ميجابايت');
      return;
    }
    setIntakePhotos((current) => [...current, ...files]);
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
      if (intakePhotos.length) {
        let uploaded = 0;
        try {
          for (const file of intakePhotos) {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(new Error(`تعذرت قراءة الصورة ${file.name}`));
              reader.onload = () => typeof reader.result === 'string'
                ? resolve(reader.result)
                : reject(new Error(`تعذر تجهيز الصورة ${file.name}`));
              reader.readAsDataURL(file);
            });
            await api.uploadRepairAttachment(res.id, { fileName: file.name, dataUrl });
            uploaded += 1;
          }
        } catch {
          error(`تم فتح أمر الإصلاح ${res.orderNumber}، لكن تعذر رفع الصور (${uploaded} من ${intakePhotos.length}). يمكنك إكمال رفعها من تبويب صور السيارة.`);
          setNewModalOpen(false);
          setIntakePhotos([]);
          loadJobCards();
          navigate(`/workshop/job-cards/${res.id}`);
          return;
        }
      }
      success(intakePhotos.length
        ? `تم فتح أمر الإصلاح رقم ${res.orderNumber} وحفظ ${intakePhotos.length} صورة للاستلام`
        : `تم فتح أمر الإصلاح رقم ${res.orderNumber} بنجاح`);
      setNewModalOpen(false);
      // Reset
      setComplaint('');
      setIntakeNotes('');
      setIntakePhotos([]);
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
      jc.vehicle?.vin?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      jc.technician?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      jc.serviceAdvisor?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${jc.vehicle?.make || ''} ${jc.vehicle?.model || ''}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      jc.customerComplaint.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  const customerOptions = customers.map((customer) => ({
    value: customer.id,
    label: `${customer.name} (${customer.phone})`,
    searchText: `${customer.mobile || ''} ${customer.phone || ''}`,
  }));
  const customerVehicles = vehicles.filter((vehicle) => vehicle.customerId === selectedCustomerId);
  const vehicleOptions = customerVehicles.map((vehicle) => ({
    value: vehicle.id,
    label: `${vehicle.plateNumber} - ${vehicle.make} ${vehicle.model} (${vehicle.year})`,
    searchText: `${vehicle.plateNumber} ${vehicle.make} ${vehicle.model} ${vehicle.year} ${vehicle.vin || ''}`,
  }));
  const technicianRoster = getWorkshopEmployeesForRole(employees, 'technician');
  const advisorRoster = getWorkshopEmployeesForRole(employees, 'serviceAdvisor');
  const technicianOptions = technicianRoster.employees.map(toWorkshopEmployeeOption);
  const advisorOptions = advisorRoster.employees.map(toWorkshopEmployeeOption);
  const fuelOptions = [
    { value: '0%', label: 'خزان فارغ (0%)' },
    { value: '25%', label: 'ربع (25%)' },
    { value: '50%', label: 'نصف (50%)' },
    { value: '75%', label: 'ثلاثة أرباع (75%)' },
    { value: '100%', label: 'خزان ممتلئ (100%)' },
  ];

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
                      {jc.grandTotal ? `${jc.grandTotal.toLocaleString()} ج.م` : '-'}
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
                onClick={() => {
                  setNewModalOpen(false);
                  setIntakePhotos([]);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateJobCard} className="space-y-4 text-xs">
              {manualCustomerOpen && (
                <div className="grid grid-cols-1 gap-2 rounded-2xl border border-brand-200 bg-brand-50 p-4 md:grid-cols-3">
                  <input value={manualCustomer.name} onChange={(e) => setManualCustomer({ ...manualCustomer, name: e.target.value })} placeholder="اسم العميل *" className="rounded-xl border p-2.5" />
                  <input value={manualCustomer.phone} onChange={(e) => setManualCustomer({ ...manualCustomer, phone: e.target.value })} placeholder="رقم الهاتف *" className="rounded-xl border p-2.5" />
                  <input value={manualCustomer.mobile} onChange={(e) => setManualCustomer({ ...manualCustomer, mobile: e.target.value })} placeholder="رقم موبايل إضافي" className="rounded-xl border p-2.5" />
                  <div className="flex gap-2 md:col-span-3">
                    <button type="button" onClick={() => setManualCustomerOpen(false)} className="rounded-xl border px-4 py-2">إلغاء</button>
                    <button type="button" onClick={createManualCustomer} className="rounded-xl bg-brand-600 px-4 py-2 font-bold text-white">حفظ العميل واختياره</button>
                  </div>
                </div>
              )}
              {manualVehicleOpen && (
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 md:grid-cols-3">
                  <input value={manualVehicle.plateNumber} onChange={(e) => setManualVehicle({ ...manualVehicle, plateNumber: e.target.value })} placeholder="رقم اللوحة *" className="rounded-xl border p-2.5" />
                  <input value={manualVehicle.make} onChange={(e) => setManualVehicle({ ...manualVehicle, make: e.target.value })} placeholder="الماركة *" className="rounded-xl border p-2.5" />
                  <input value={manualVehicle.model} onChange={(e) => setManualVehicle({ ...manualVehicle, model: e.target.value })} placeholder="الموديل *" className="rounded-xl border p-2.5" />
                  <input type="number" value={manualVehicle.year} onChange={(e) => setManualVehicle({ ...manualVehicle, year: e.target.value })} placeholder="سنة الصنع" className="rounded-xl border p-2.5" />
                  <input value={manualVehicle.vin} onChange={(e) => setManualVehicle({ ...manualVehicle, vin: e.target.value })} placeholder="رقم الشاسيه VIN" className="rounded-xl border p-2.5" />
                  <input type="number" value={manualVehicle.currentOdometer} onChange={(e) => setManualVehicle({ ...manualVehicle, currentOdometer: e.target.value })} placeholder="قراءة العداد" className="rounded-xl border p-2.5" />
                  <input value={manualVehicle.color} onChange={(e) => setManualVehicle({ ...manualVehicle, color: e.target.value })} placeholder="اللون" className="rounded-xl border p-2.5" />
                  <div className="flex gap-2 md:col-span-2">
                    <button type="button" onClick={() => setManualVehicleOpen(false)} className="rounded-xl border px-4 py-2">إلغاء</button>
                    <button type="button" onClick={createManualVehicle} className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white">حفظ السيارة واختيارها</button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Customer */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block font-bold text-slate-700">العميل *</label>
                    <button type="button" onClick={() => setManualCustomerOpen(true)} className="text-[11px] font-black text-brand-700">+ إضافة عميل يدويًا</button>
                  </div>
                  <SearchableSelect
                    options={customerOptions}
                    value={selectedCustomerId}
                    onChange={handleCustomerChange}
                    placeholder="ابحث واختر العميل *"
                    allowClear
                  />
                </div>

                {/* Vehicle */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block font-bold text-slate-700">السيارة *</label>
                    <button type="button" disabled={!selectedCustomerId} onClick={() => setManualVehicleOpen(true)} className="text-[11px] font-black text-brand-700 disabled:text-slate-300">+ إضافة سيارة يدويًا</button>
                  </div>
                  <SearchableSelect
                    options={vehicleOptions}
                    value={selectedVehicleId}
                    onChange={(vehicleId) => {
                      setSelectedVehicleId(vehicleId);
                      const veh = vehicles.find((v) => v.id === vehicleId);
                      if (veh) setOdometer(veh.currentOdometer || 0);
                    }}
                    placeholder={selectedCustomerId ? 'ابحث باللوحة أو الماركة أو الموديل أو VIN' : 'اختر العميل أولاً'}
                    disabled={!selectedCustomerId}
                    allowClear
                  />
                </div>

                {/* Current Odometer */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">قراءة العداد الحالية (كم)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={odometer}
                    onChange={(e) => setOdometer(parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>

                {/* Fuel Level */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">مستوى الوقود</label>
                  <SearchableSelect
                    options={fuelOptions}
                    value={fuelLevel}
                    onChange={setFuelLevel}
                    placeholder="اختر أو اكتب مستوى الوقود"
                    allowCustom
                    allowClear
                  />
                </div>

                {/* Technician */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الفني المكلف بالعمل</label>
                  <SearchableSelect
                    options={technicianOptions}
                    value={technicianId}
                    onChange={setTechnicianId}
                    placeholder={technicianOptions.length ? 'ابحث واختر الفني أو عيّنه لاحقاً' : 'لا يوجد موظفون نشطون للاختيار'}
                    allowClear
                  />
                  {technicianRoster.usedFallback && <p className="mt-1 text-[10px] leading-4 text-amber-700">لم يُعثر على مسمى فني واضح؛ تظهر كل الأسماء النشطة كحل بديل. يُفضّل تحديث المسمى أو القسم في ملف الموظف.</p>}
                </div>

                {/* Service Advisor */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">مهندس الاستقبال</label>
                  <SearchableSelect
                    options={advisorOptions}
                    value={serviceAdvisorId}
                    onChange={setServiceAdvisorId}
                    placeholder={advisorOptions.length ? 'ابحث واختر مهندس الاستقبال' : 'لا يوجد موظفون نشطون للاختيار'}
                    allowClear
                  />
                  {advisorRoster.usedFallback && <p className="mt-1 text-[10px] leading-4 text-amber-700">لم يُعثر على مسمى استقبال واضح؛ تظهر كل الأسماء النشطة كحل بديل. يُفضّل تحديث المسمى أو القسم في ملف الموظف.</p>}
                </div>
              </div>
              {employeeLoadError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{employeeLoadError}</p>}
              {!employeeLoadError && technicianRoster.employees.length === 0 && advisorRoster.employees.length === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">لا توجد سجلات موظفين نشطة. يمكنك إسناد الفني ومهندس الاستقبال بعد إنشاء أمر الإصلاح.</p>}

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

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="block font-bold text-slate-700">صور حالة السيارة عند الاستلام</label>
                    <p className="mt-1 text-[11px] text-slate-500">التقط صور الخدوش والأضرار والحالة الخارجية قبل بدء الصيانة. حتى 20 صورة، JPG أو PNG أو WebP، بحد 3 ميجابايت للصورة.</p>
                  </div>
                  <input
                    ref={intakePhotoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    multiple
                    onChange={handleIntakePhotoChange}
                    className="hidden"
                    aria-label="اختيار صور السيارة عند الاستلام"
                  />
                  <button
                    type="button"
                    onClick={() => intakePhotoInputRef.current?.click()}
                    disabled={intakePhotos.length >= 20 || submitting}
                    className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-2 font-bold text-brand-700 disabled:opacity-50"
                  >
                    <ImagePlus className="h-4 w-4" />
                    إضافة صور
                  </button>
                </div>
                {intakePhotos.length > 0 && (
                  <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                    {intakePhotos.map((file, index) => (
                      <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="truncate text-slate-700" title={file.name}>
                          {file.name} · {(file.size / 1024).toFixed(0)} ك.ب
                        </span>
                        <button
                          type="button"
                          onClick={() => setIntakePhotos((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                          disabled={submitting}
                          aria-label={`إزالة الصورة ${file.name}`}
                          className="shrink-0 rounded-lg p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
                      <span>{intakePhotos.length ? 'فتح الأمر وحفظ صور الاستلام' : 'فتح أمر الإصلاح ومباشرة الفحص'}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewModalOpen(false);
                    setIntakePhotos([]);
                  }}
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
