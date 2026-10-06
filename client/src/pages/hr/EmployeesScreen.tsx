import React, { useState, useEffect } from 'react';
import { 
  Users, UserCheck, Award, FileSpreadsheet, Plus, 
  Clock, CheckCircle2, DollarSign, Calendar, Search, 
  Briefcase, Phone, Mail, ShieldAlert
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const EmployeesScreen: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'commissions' | 'payroll'>('employees');

  // Data
  const [employees, setEmployees] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState('');

  // Modals
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
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
    hireDate: new Date().toISOString().split('T')[0]
  });

  const [checkInForm, setCheckInForm] = useState({
    employeeId: '',
    notes: ''
  });

  const [payrollForm, setPayrollForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [empRes, jobRes, brRes, attRes, comRes, payRes] = await Promise.all([
        api.master.getEmployees(),
        api.master.getJobs(),
        api.master.getBranches(),
        api.hr.getAttendance(),
        api.hr.getCommissions(),
        api.hr.getPayroll({ month: payrollForm.month, year: payrollForm.year })
      ]);
      setEmployees(empRes.data);
      setJobs(jobRes.data);
      setBranches(brRes.data);
      setAttendances(attRes.data);
      setCommissions(comRes.data);
      setPayrolls(payRes.data);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تحميل بيانات الموارد البشرية', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [payrollForm.month, payrollForm.year]);

  // KPIs
  const totalEmployees = employees.length;
  const techniciansCount = employees.filter(e => e.job?.nameAr?.includes('فني') || e.job?.nameAr?.includes('ميكانيك') || e.job?.nameAr?.includes('كهربائي')).length;
  const pendingCommissionsSum = commissions.filter(c => c.status === 'PENDING').reduce((sum, c) => sum + (c.amount || 0), 0);
  const currentMonthPayrollSum = payrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0);

  // Handle Add Employee
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.master.createEmployee({
        ...employeeForm,
        salary: parseFloat(employeeForm.salary) || 0,
        commissionRate: parseFloat(employeeForm.commissionRate) || 0,
        hireDate: new Date(employeeForm.hireDate),
      });
      showToast('تمت إضافة الموظف بنجاح', 'success');
      setIsEmployeeModalOpen(false);
      setEmployeeForm({
        name: '', phone: '', email: '', nationalId: '',
        jobId: '', branchId: '', salary: '', commissionRate: '0',
        hireDate: new Date().toISOString().split('T')[0]
      });
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل إضافة الموظف', 'error');
    }
  };

  // Handle Check-in
  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.hr.checkIn(checkInForm);
      showToast('تم تسجيل حضور الموظف بنجاح', 'success');
      setIsCheckInModalOpen(false);
      setCheckInForm({ employeeId: '', notes: '' });
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تسجيل الحضور', 'error');
    }
  };

  // Handle Check-out
  const handleCheckOut = async (attendanceId: string) => {
    try {
      await api.hr.checkOut({ attendanceId });
      showToast('تم تسجيل الانصراف وحساب ساعات العمل', 'success');
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تسجيل الانصراف', 'error');
    }
  };

  // Handle Generate Payroll
  const handleGeneratePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.hr.generatePayroll(payrollForm);
      showToast('تم توليد مسير الرواتب بنجاح', 'success');
      setIsGeneratePayrollModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل توليد مسير الرواتب', 'error');
    }
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
          <button
            onClick={() => setIsCheckInModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition"
          >
            <Clock className="w-4 h-4" />
            تسجيل حضور اليوم
          </button>
          <button
            onClick={() => setIsGeneratePayrollModalOpen(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            توليد مسير الرواتب
          </button>
          <button
            onClick={() => setIsEmployeeModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            إضافة موظف
          </button>
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
            <div className="text-2xl font-black text-amber-600 mt-1">{pendingCommissionsSum.toLocaleString()} ر.س</div>
            <span className="text-[11px] text-amber-600 font-medium">مستحقة عن أوامر الصيانة المنفذة</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">صافي مسير رواتب الشهر</span>
            <div className="text-2xl font-black text-purple-700 mt-1">{currentMonthPayrollSum.toLocaleString()} ر.س</div>
            <span className="text-[11px] text-purple-600 font-medium">شامل الراتب الأساسي والبدلات والعمولة</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6 pt-2 rounded-t-2xl overflow-x-auto">
        <button
          onClick={() => setActiveTab('employees')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'employees' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          دليل الموظفين ({employees.length})
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'attendance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          سجل الحضور والانصراف ({attendances.length})
        </button>
        <button
          onClick={() => setActiveTab('commissions')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'commissions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Award className="w-4 h-4" />
          عمولات الفنيين ({commissions.length})
        </button>
        <button
          onClick={() => setActiveTab('payroll')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'payroll' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          مسير الرواتب الشهرية ({payrolls.length})
        </button>
      </div>

      {/* Tab 1: Employees List */}
      {activeTab === 'employees' && (
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
                      {emp.salary.toLocaleString()} ر.س
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Attendance */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6">
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
                      {att.workHours ? `${att.workHours} ساعة` : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {!att.checkOut ? (
                        <button
                          onClick={() => handleCheckOut(att.id)}
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
      {activeTab === 'commissions' && (
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
                      <td className="py-3 px-4 text-left font-mono">{com.laborTotal?.toLocaleString()} ر.س</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-xs">{com.rate}%</td>
                      <td className="py-3 px-4 text-left font-mono font-black text-emerald-600">{com.amount?.toLocaleString()} ر.س</td>
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
      {activeTab === 'payroll' && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-4">
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
              {[2024, 2025, 2026, 2027].map(y => (
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
                  <th className="py-3 px-4 text-left">الأساسي</th>
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
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      لا يوجد مسير معتمد لهذا الشهر، اضغط "توليد مسير الرواتب" بالأعلى لحساب الاستحقاقات.
                    </td>
                  </tr>
                ) : (
                  payrolls.map(pay => (
                    <tr key={pay.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-900">{pay.employee?.name}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{pay.employee?.job?.nameAr}</td>
                      <td className="py-3 px-4 text-left font-mono">{pay.basicSalary.toLocaleString()} ر.س</td>
                      <td className="py-3 px-4 text-left font-mono text-slate-600">{(pay.allowances || 0).toLocaleString()} ر.س</td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-emerald-600">{(pay.commissions || 0).toLocaleString()} ر.س</td>
                      <td className="py-3 px-4 text-left font-mono text-rose-600">{(pay.deductions || 0).toLocaleString()} ر.س</td>
                      <td className="py-3 px-4 text-left font-mono font-black text-blue-700 text-base">{pay.netSalary.toLocaleString()} ر.س</td>
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
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              إضافة موظف / فني جديد
            </h3>
            <form onSubmit={handleCreateEmployee} className="space-y-4">
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الراتب الأساسي (ر.س):</label>
                  <input
                    type="number"
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

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  حفظ وتعيين الموظف
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
                  {employees.map(e => (
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
              يقوم النظام بحساب الراتب الأساسي + البدلات المستحقة + إضافة عمولات أوامر الصيانة المعلقة للفنيين آلياً
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
                    {[2024, 2025, 2026, 2027].map(y => (
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
