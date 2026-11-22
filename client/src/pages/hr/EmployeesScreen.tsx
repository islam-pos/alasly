import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Users, UserCheck, Award, FileSpreadsheet, Plus, 
  Clock, CheckCircle2, DollarSign, Calendar, Search, 
  Briefcase, Phone, Mail, ShieldAlert, Pencil, UserX, Camera
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const payrollYears = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 2 + index);

export const EmployeesScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canManageEmployees = hasPermission('manage_employees');
  const canManagePayroll = hasPermission('manage_payroll');
  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'commissions' | 'payroll'>('employees');

  // Data
  const [employees, setEmployees] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [standardMonthlyHours, setStandardMonthlyHours] = useState('208');
  const [savingHrSettings, setSavingHrSettings] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState('');

  // Modals
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [isGeneratePayrollModalOpen, setIsGeneratePayrollModalOpen] = useState(false);

  // Forms
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    phone: '',
    email: '',
    nationalId: '',
    jobId: '',
    branchId: '',
    salary: '',
    commissionRate: '0',
    hireDate: new Date().toISOString().split('T')[0],
    active: true,
  });

  const [checkInForm, setCheckInForm] = useState({
    employeeId: '',
    notes: ''
  });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedFace, setCapturedFace] = useState('');
  const [pendingCheckOutId, setPendingCheckOutId] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [payrollForm, setPayrollForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const empty = { data: [] };
      const [empRes, jobRes, brRes, attRes, comRes, payRes, hrSettingsRes] = await Promise.all([
        canManageEmployees ? api.master.getEmployees() : Promise.resolve(empty),
        canManageEmployees ? api.master.getJobs() : Promise.resolve(empty),
        canManageEmployees ? api.master.getBranches() : Promise.resolve(empty),
        canManageEmployees ? api.hr.getAttendance() : Promise.resolve(empty),
        canManagePayroll ? api.hr.getCommissions() : Promise.resolve(empty),
        canManagePayroll ? api.hr.getPayroll({ month: payrollForm.month, year: payrollForm.year }) : Promise.resolve(empty),
        canManagePayroll ? api.hr.getHrSettings() : Promise.resolve({ data: { standardMonthlyHours: 208 } })
      ]);
      setEmployees(empRes.data);
      setJobs(jobRes.data);
      setBranches(brRes.data);
      setAttendances(attRes.data);
      setCommissions(comRes.data);
      setPayrolls(payRes.data);
      setStandardMonthlyHours(String(hrSettingsRes.data.standardMonthlyHours));
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تحميل بيانات الموارد البشرية', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [payrollForm.month, payrollForm.year, canManageEmployees, canManagePayroll]);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab === 'attendance' && canManageEmployees) setActiveTab('attendance');
    else if (requestedTab === 'employees' && canManageEmployees) setActiveTab('employees');
    else if (requestedTab === 'commissions' && canManagePayroll) setActiveTab('commissions');
    else if (requestedTab === 'payroll' && canManagePayroll) setActiveTab('payroll');
    else if (canManageEmployees) setActiveTab('employees');
    else if (canManagePayroll) setActiveTab('payroll');
  }, [searchParams, canManageEmployees, canManagePayroll]);

  // KPIs
  const totalEmployees = employees.filter((employee) => employee.active).length;
  const techniciansCount = employees.filter(e => e.active && (e.job?.nameAr?.includes('فني') || e.job?.nameAr?.includes('ميكانيك') || e.job?.nameAr?.includes('كهربائي'))).length;
  const pendingCommissionsSum = commissions.filter(c => c.status === 'PENDING').reduce((sum, c) => sum + (c.amount || 0), 0);
  const currentMonthPayrollSum = payrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0);

  // Handle Add Employee
  const resetEmployeeForm = () => setEmployeeForm({
    name: '', phone: '', email: '', nationalId: '',
    jobId: '', branchId: '', salary: '', commissionRate: '0',
    hireDate: new Date().toISOString().split('T')[0], active: true,
  });

  const openEmployeeModal = (employee?: any) => {
    setEditingEmployeeId(employee?.id || null);
    setEmployeeForm(employee ? {
      name: employee.name || '',
      phone: employee.phone || '',
      email: employee.email || '',
      nationalId: employee.nationalId || '',
      jobId: employee.jobId || '',
      branchId: employee.branchId || '',
      salary: String(employee.salary ?? ''),
      commissionRate: String(employee.commissionRate ?? 0),
      hireDate: employee.hireDate ? new Date(employee.hireDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      active: employee.active !== false,
    } : {
      name: '', phone: '', email: '', nationalId: '',
      jobId: '', branchId: '', salary: '', commissionRate: '0',
      hireDate: new Date().toISOString().split('T')[0], active: true,
    });
    setIsEmployeeModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const employeeData = {
        ...employeeForm,
        salary: parseFloat(employeeForm.salary) || 0,
        commissionRate: parseFloat(employeeForm.commissionRate) || 0,
        hireDate: new Date(employeeForm.hireDate),
      };
      if (editingEmployeeId) {
        await api.master.updateEmployee(editingEmployeeId, employeeData);
      } else {
        await api.master.createEmployee(employeeData);
      }
      showToast(editingEmployeeId ? 'تم تعديل بيانات الموظف' : 'تمت إضافة الموظف بنجاح', 'success');
      setIsEmployeeModalOpen(false);
      setEditingEmployeeId(null);
      resetEmployeeForm();
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'تعذر حفظ بيانات الموظف', 'error');
    }
  };

  const handleDeleteEmployee = async (employee: any) => {
    if (!window.confirm(`هل تريد إيقاف الموظف ${employee.name}؟ ستظل سجلات الحضور والرواتب محفوظة.`)) return;
    try {
      await api.master.deleteEmployee(employee.id);
      showToast('تم إيقاف الموظف وتعطيل حسابه المرتبط إن وجد', 'success');
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'تعذر إيقاف الموظف', 'error');
    }
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  };

  const openCamera = async () => {
    setCameraError('');
    setCapturedFace('');
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError('تعذر فتح الكاميرا. اسمح بصلاحية الكاميرا ثم حاول مرة أخرى.');
    }
  };

  const captureFace = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('الكاميرا لم تصبح جاهزة بعد');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('تعذر تجهيز الصورة');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const faceImage = canvas.toDataURL('image/jpeg', 0.72);
    setCapturedFace(faceImage);
    if (pendingCheckOutId) {
      void api.hr.checkOut({
        attendanceId: pendingCheckOutId,
        faceImage,
        deviceName: navigator.userAgent,
      }).then(() => {
        showToast('تم تسجيل الانصراف وحساب ساعات العمل', 'success');
        setPendingCheckOutId('');
        stopCamera();
        setCapturedFace('');
        setCameraOpen(false);
        loadData();
      }).catch((error: any) => {
        showToast(error.response?.data?.error || 'فشل تسجيل الانصراف', 'error');
      });
    }
  };

  // Handle Check-in
  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!capturedFace) throw new Error('التقط صورة الوجه قبل بدء الوردية');
      await api.hr.checkIn({
        ...checkInForm,
        faceImage: capturedFace,
        deviceName: navigator.userAgent,
      });
      showToast('تم تسجيل حضور الموظف بنجاح', 'success');
      setIsCheckInModalOpen(false);
      setCheckInForm({ employeeId: '', notes: '' });
      stopCamera();
      setCapturedFace('');
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تسجيل الحضور', 'error');
    }
  };

  // Handle Check-out
  const handleCheckOut = async (attendanceId: string) => {
    try {
      if (!capturedFace) {
        setCameraOpen(true);
        showToast('التقط صورة الوجه لإنهاء الوردية', 'error');
        return;
      }
      await api.hr.checkOut({
        attendanceId,
        faceImage: capturedFace,
        deviceName: navigator.userAgent,
      });
      showToast('تم تسجيل الانصراف وحساب ساعات العمل', 'success');
      stopCamera();
      setCapturedFace('');
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تسجيل الانصراف', 'error');
    }
  };

  // Handle Generate Payroll
  const handleGeneratePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await api.hr.generatePayroll(payrollForm);
      showToast(result.data?.length ? 'تم توليد مسير الرواتب بنجاح' : 'المسير موجود مسبقاً؛ لم تتم إضافة سجلات مكررة', 'success');
      setIsGeneratePayrollModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل توليد مسير الرواتب', 'error');
    }
  };

  const handleSaveHrSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const hours = Number(standardMonthlyHours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 744) {
      showToast('يجب أن تكون ساعات العمل الشهرية بين 1 و744 ساعة', 'error');
      return;
    }
    try {
      setSavingHrSettings(true);
      const result = await api.hr.updateHrSettings({ standardMonthlyHours: hours });
      setStandardMonthlyHours(String(result.data.standardMonthlyHours));
      showToast('تم حفظ ساعات العمل الشهرية المعيارية', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل حفظ إعدادات الموارد البشرية', 'error');
    } finally {
      setSavingHrSettings(false);
    }
  };

  const formatWorkDuration = (minutes?: number | null, legacyHours?: number) => {
    const totalMinutes = typeof minutes === 'number' ? minutes : Math.round((legacyHours || 0) * 60);
    if (!totalMinutes) return '-';
    return `${Math.floor(totalMinutes / 60)} س ${totalMinutes % 60} د`;
  };

  // Filtered employees
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = !searchQuery || 
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.phone?.includes(searchQuery) ||
      emp.code?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesJob = !selectedJob || emp.jobId === selectedJob;
    return matchesSearch && matchesJob;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-blue-600" />
            شؤون الموظفين والفنيين (HR)
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            إدارة الموظفين، الحضور والانصراف، عمولات الفنيين ومسير الرواتب الشهري
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManageEmployees && <button
            onClick={() => setIsCheckInModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition"
          >
            <Clock className="w-4 h-4" />
            تسجيل حضور اليوم
          </button>}
          {canManagePayroll && <button
            onClick={() => setIsGeneratePayrollModalOpen(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            توليد مسير الرواتب
          </button>}
          {canManageEmployees && <button
            onClick={() => openEmployeeModal()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            إضافة موظف
          </button>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">إجمالي طاقم العمل</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{totalEmployees} موظف</div>
            <span className="text-[11px] text-slate-400">في مختلف الفروع والتخصصات</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">الفنيين والمهندسين</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">{techniciansCount} فني</div>
            <span className="text-[11px] text-emerald-600 font-medium">ميكانيكا، كهرباء، فحص، تكييف</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Briefcase className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">عمولات الفنيين المعلقة</span>
            <div className="text-2xl font-black text-amber-600 mt-1">{pendingCommissionsSum.toLocaleString()} ج.م</div>
            <span className="text-[11px] text-amber-600 font-medium">مستحقة عن أوامر الصيانة المنفذة</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">صافي مسير رواتب الشهر</span>
            <div className="text-2xl font-black text-purple-700 mt-1">{currentMonthPayrollSum.toLocaleString()} ج.م</div>
            <span className="text-[11px] text-purple-600 font-medium">شامل الراتب الأساسي والبدلات والعمولة</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6 pt-2 rounded-t-2xl overflow-x-auto">
        {canManageEmployees && <button
          onClick={() => setActiveTab('employees')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'employees' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          دليل الموظفين ({employees.length})
        </button>}
        {canManageEmployees && <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'attendance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          سجل الحضور والانصراف ({attendances.length})
        </button>}
        {canManagePayroll && <button
          onClick={() => setActiveTab('commissions')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'commissions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Award className="w-4 h-4" />
          عمولات الفنيين ({commissions.length})
        </button>}
        {canManagePayroll && <button
          onClick={() => setActiveTab('payroll')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'payroll' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          مسير الرواتب الشهرية ({payrolls.length})
        </button>}
      </div>

      {/* Tab 1: Employees List */}
      {activeTab === 'employees' && canManageEmployees && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، الكود، رقم الجوال..."
                className="w-full pr-9 pl-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <select
              value={selectedJob}
              onChange={(e) => setSelectedJob(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm bg-white outline-none"
            >
              <option value="">جميع المسميات الوظيفية</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.nameAr}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">الكود / الاسم</th>
                  <th className="py-3 px-4">المسمى الوظيفي</th>
                  <th className="py-3 px-4">الفرع</th>
                  <th className="py-3 px-4">بيانات التواصل</th>
                  <th className="py-3 px-4 text-left">الراتب الأساسي</th>
                  <th className="py-3 px-4 text-center">نسبة العمولة</th>
                  <th className="py-3 px-4 text-center">أوامر الصيانة المنجزة</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                  <th className="py-3 px-4 text-center">إدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{emp.name}</div>
                      <div className="text-xs font-mono text-slate-500">{emp.code}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs bg-blue-50 text-blue-800 font-semibold px-2 py-0.5 rounded">
                        {emp.job?.nameAr || 'موظف'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-700">{emp.branch?.name || 'المركز الرئيسي'}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div>{emp.phone || '-'}</div>
                      <div className="text-slate-400">{emp.email}</div>
                    </td>
                    <td className="py-3 px-4 text-left font-mono font-bold text-slate-800">
                      {emp.salary.toLocaleString()} ج.م
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-xs">
                      {emp.commissionRate > 0 ? (
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                          {emp.commissionRate}%
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-xs font-bold text-blue-600">
                      {emp._count?.assignedRepairs || 0}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${emp.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {emp.active ? 'على رأس العمل' : 'معطل'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button type="button" onClick={() => openEmployeeModal(emp)} className="rounded-lg border border-blue-200 p-2 text-blue-700 hover:bg-blue-50" title="تعديل الموظف">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleDeleteEmployee(emp)} disabled={!emp.active} className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50 disabled:opacity-40" title="إيقاف الموظف">
                          <UserX className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Attendance */}
      {activeTab === 'attendance' && canManageEmployees && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div>
              <h3 className="font-black text-emerald-900">وردية الموظف</h3>
              <p className="mt-1 text-xs text-emerald-700">ابدأ الوردية بالكاميرا، وأمنع الانصراف بدون صورة وجه جديدة.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCheckInForm({ employeeId: checkInForm.employeeId, notes: '' });
                setCapturedFace('');
                setIsCheckInModalOpen(true);
                void openCamera();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow"
            >
              <Camera className="h-5 w-5" /> بدء وردية الموظف
            </button>
          </div>
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">الموظف</th>
                  <th className="py-3 px-4">الوظيفة</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">وقت الحضور</th>
                  <th className="py-3 px-4">وقت الانصراف</th>
                  <th className="py-3 px-4 text-center">ساعات العمل</th>
                  <th className="py-3 px-4 text-center">الحالة / إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendances.map(att => (
                  <tr key={att.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-bold text-slate-900">{att.employee?.name}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{att.employee?.job?.nameAr}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{new Date(att.date).toLocaleDateString('ar-SA')}</td>
                    <td className="py-3 px-4 text-xs font-mono text-emerald-700 font-bold">
                      {att.checkIn ? new Date(att.checkIn).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-rose-700 font-bold">
                      {att.checkOut ? new Date(att.checkOut).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                      {formatWorkDuration(att.workMinutes, att.workHours)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {!att.checkOut ? (
                        <button
                          onClick={() => {
                            setCapturedFace('');
                            setCameraOpen(true);
                            setPendingCheckOutId(att.id);
                            void openCamera();
                          }}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-3 py-1 rounded-lg transition"
                        >
                          تسجيل انصراف
                        </button>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold">
                          حاضر ومنصرف
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Commissions */}
      {activeTab === 'commissions' && canManagePayroll && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6">
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">الفني المكرم</th>
                  <th className="py-3 px-4">أمر الإصلاح</th>
                  <th className="py-3 px-4">المركبة والعميل</th>
                  <th className="py-3 px-4 text-left">مبلغ شغل اليد الخاضع للعمولة</th>
                  <th className="py-3 px-4 text-center">نسبة العمولة</th>
                  <th className="py-3 px-4 text-left">مبلغ العمولة المستحق</th>
                  <th className="py-3 px-4 text-center">حالة الصرف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">لا توجد عمولات مسجلة حالياً</td>
                  </tr>
                ) : (
                  commissions.map(com => (
                    <tr key={com.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-900">{com.employee?.name}</td>
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{com.repairOrder?.orderNumber}</td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-semibold text-slate-800">
                          {com.repairOrder?.vehicle?.make} {com.repairOrder?.vehicle?.model} ({com.repairOrder?.vehicle?.plateNumber})
                        </div>
                        <div className="text-slate-400">{com.repairOrder?.customer?.name}</div>
                      </td>
                      <td className="py-3 px-4 text-left font-mono">{com.laborTotal?.toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-xs">{com.rate}%</td>
                      <td className="py-3 px-4 text-left font-mono font-black text-emerald-600">{com.amount?.toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                          com.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {com.status === 'PAID' ? 'تم الصرف' : 'معلقة بالمسير'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Payroll */}
      {activeTab === 'payroll' && canManagePayroll && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-4">
          <form onSubmit={handleSaveHrSettings} className="flex flex-wrap items-end gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex-1 min-w-52">
              <label className="block text-xs font-bold text-slate-700 mb-1">ساعات العمل المعيارية للشهر</label>
              <input
                type="number"
                min="1"
                max="744"
                step="0.01"
                required
                value={standardMonthlyHours}
                onChange={(e) => setStandardMonthlyHours(e.target.value)}
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm font-mono"
              />
            </div>
            <p className="flex-1 min-w-60 text-xs leading-5 text-slate-600">
              أجر الساعة = الراتب الشهري ÷ هذه القيمة. الأجر الأساسي للمسير يساوي أجر الساعة × دقائق الحضور المكتملة؛ تُقرّب المبالغ فقط إلى منزلتين عشريتين.
            </p>
            <button type="submit" disabled={savingHrSettings} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
              {savingHrSettings ? 'جارٍ الحفظ...' : 'حفظ الإعداد'}
            </button>
          </form>
          <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border">
            <span className="text-xs font-bold text-slate-700">تصفية حسب شهر المسير:</span>
            <select
              value={payrollForm.month}
              onChange={(e) => setPayrollForm({ ...payrollForm, month: parseInt(e.target.value) })}
              className="border rounded-lg px-3 py-1.5 text-xs bg-white font-bold outline-none"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>شهر {m}</option>
              ))}
            </select>
            <select
              value={payrollForm.year}
              onChange={(e) => setPayrollForm({ ...payrollForm, year: parseInt(e.target.value) })}
              className="border rounded-lg px-3 py-1.5 text-xs bg-white font-bold outline-none"
            >
              {payrollYears.map(y => (
                <option key={y} value={y}>سنة {y}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">الموظف</th>
                  <th className="py-3 px-4">المسمى الوظيفي</th>
                  <th className="py-3 px-4 text-center">وقت الحضور الفعلي</th>
                  <th className="py-3 px-4 text-left">أجر الساعات</th>
                  <th className="py-3 px-4 text-left">البدلات</th>
                  <th className="py-3 px-4 text-left">العمولات المكتسبة</th>
                  <th className="py-3 px-4 text-left">الخصومات</th>
                  <th className="py-3 px-4 text-left font-bold text-slate-900">صافي المستحق</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payrolls.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-400">
                      لا يوجد مسير معتمد لهذا الشهر، اضغط "توليد مسير الرواتب" بالأعلى لحساب الاستحقاقات.
                    </td>
                  </tr>
                ) : (
                  payrolls.map(pay => (
                    <tr key={pay.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-900">{pay.employee?.name}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{pay.employee?.job?.nameAr}</td>
                      <td className="py-3 px-4 text-center font-mono text-xs">{formatWorkDuration(pay.attendedMinutes)}</td>
                      <td className="py-3 px-4 text-left font-mono">{pay.basicSalary.toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-left font-mono text-slate-600">{(pay.allowances || 0).toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-emerald-600">{(pay.commissions || 0).toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-left font-mono text-rose-600">{(pay.deductions || 0).toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-left font-mono font-black text-blue-700 text-base">{pay.netSalary.toLocaleString()} ج.م</td>
                      <td className="py-3 px-4 text-center">
                        <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-full font-bold">
                          معتمد للمراجعة
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              {editingEmployeeId ? 'تعديل بيانات الموظف' : 'إضافة موظف / فني جديد'}
            </h3>
            <form onSubmit={handleSaveEmployee} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الاسم الكامل:</label>
                  <input
                    type="text"
                    required
                    value={employeeForm.name}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                    placeholder="اسم الموظف..."
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">رقم الهوية / الإقامة:</label>
                  <input
                    type="text"
                    required
                    value={employeeForm.nationalId}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, nationalId: e.target.value })}
                    placeholder="10 أو 2XXXXXXXXX"
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">المسمى الوظيفي:</label>
                  <select
                    required
                    value={employeeForm.jobId}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, jobId: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                  >
                    <option value="">اختر الوظيفة</option>
                    {jobs.map(j => (
                      <option key={j.id} value={j.id}>{j.nameAr}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الفرع المخصص:</label>
                  <select
                    required
                    value={employeeForm.branchId}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, branchId: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                  >
                    <option value="">اختر الفرع</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">رقم الجوال:</label>
                  <input
                    type="text"
                    required
                    value={employeeForm.phone}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                    placeholder="05XXXXXXXX"
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">البريد الإلكتروني:</label>
                  <input
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                    placeholder="name@example.com"
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الراتب الشهري الأساسي (قابل للتعديل) (ج.م):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={employeeForm.salary}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, salary: e.target.value })}
                    placeholder="0.00"
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">نسبة العمولة على شغل اليد (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={employeeForm.commissionRate}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, commissionRate: e.target.value })}
                    placeholder="0"
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono"
                  />
                </div>
              </div>

              {editingEmployeeId && (
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={employeeForm.active}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, active: e.target.checked })}
                  />
                  الموظف على رأس العمل
                </label>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setIsEmployeeModalOpen(false);
                    setEditingEmployeeId(null);
                  }}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  {editingEmployeeId ? 'حفظ التعديلات' : 'حفظ وتعيين الموظف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check In Modal */}
      {isCheckInModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              تسجيل حضور موظف اليوم
            </h3>
            <form onSubmit={handleCheckIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">اختر الموظف:</label>
                <select
                  required
                  value={checkInForm.employeeId}
                  onChange={(e) => setCheckInForm({ ...checkInForm, employeeId: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                >
                  <option value="">اختر من القائمة</option>
                  {employees.filter((employee) => employee.active).map(e => (
                    <option key={e.id} value={e.id}>{e.name} - ({e.job?.nameAr})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ملاحظات (اختياري):</label>
                <input
                  type="text"
                  value={checkInForm.notes}
                  onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                  placeholder="ملاحظات الحضور..."
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">صورة الوجه لبدء الوردية *</span>
                  <button type="button" onClick={openCamera} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                    <Camera className="h-4 w-4" /> فتح الكاميرا
                  </button>
                </div>
                {cameraOpen && (
                  <div className="space-y-2">
                    <video ref={videoRef} muted playsInline className="aspect-video w-full rounded-xl bg-slate-900 object-cover" />
                    {cameraError && <p className="text-xs font-bold text-rose-600">{cameraError}</p>}
                    <button type="button" onClick={captureFace} className="w-full rounded-xl bg-brand-600 py-2 text-xs font-bold text-white">التقاط صورة الوجه</button>
                  </div>
                )}
                {capturedFace && (
                  <div className="flex items-center gap-3">
                    <img src={capturedFace} alt="صورة حضور الوردية" className="h-16 w-16 rounded-xl object-cover" />
                    <span className="text-xs font-bold text-emerald-700">تم الالتقاط وجاهز للتسجيل</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsCheckInModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  تأكيد الحضور
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Payroll Modal */}
      {isGeneratePayrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              توليد مسير رواتب وعمولات الشهر
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              يحتسب النظام أجر الساعات الفعلية وفق الراتب الشهري وساعات العمل المعيارية، ويضيف العمولات المعلقة دون بدل تجريبي.
            </p>
            <form onSubmit={handleGeneratePayroll} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الشهر:</label>
                  <select
                    value={payrollForm.month}
                    onChange={(e) => setPayrollForm({ ...payrollForm, month: parseInt(e.target.value) })}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                  >
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <option key={m} value={m}>شهر {m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">السنة:</label>
                  <select
                    value={payrollForm.year}
                    onChange={(e) => setPayrollForm({ ...payrollForm, year: parseInt(e.target.value) })}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white outline-none"
                  >
                    {payrollYears.map(y => (
                      <option key={y} value={y}>سنة {y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsGeneratePayrollModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  بدء التوليد التلقائي
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
