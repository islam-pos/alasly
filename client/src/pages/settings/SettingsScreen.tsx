import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Settings, Building, ShieldCheck, History, 
  Save, Plus, MapPin, Phone, Mail, CheckCircle2, Printer,
  Users, Key, FileText, Search, MessageCircle
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { NotificationIntegrations } from './NotificationIntegrations';
import {
  defaultPrintSettings,
  parsePrintSettings,
  type OutputPrintSettings,
  type PrintSettings,
} from '../../utils/printSettings';

const invoicePrintFieldLabels: { key: keyof PrintSettings['invoiceFields']; label: string }[] = [
  { key: 'companyAddress', label: 'عنوان المنشأة' },
  { key: 'companyPhone', label: 'هاتف المنشأة' },
  { key: 'companyTaxNumber', label: 'الرقم الضريبي للمنشأة' },
  { key: 'commercialRegister', label: 'السجل التجاري' },
  { key: 'invoiceDate', label: 'تاريخ ووقت الفاتورة' },
  { key: 'customerName', label: 'اسم العميل' },
  { key: 'customerPhone', label: 'هاتف العميل' },
  { key: 'customerTaxNumber', label: 'الرقم الضريبي للعميل' },
  { key: 'vehicleDetails', label: 'بيانات المركبة' },
  { key: 'paymentMethod', label: 'طريقة الدفع' },
  { key: 'itemCode', label: 'كود الصنف' },
  { key: 'quantity', label: 'الكمية' },
  { key: 'unitPrice', label: 'سعر الوحدة' },
  { key: 'lineTotal', label: 'إجمالي كل بند' },
  { key: 'subtotal', label: 'المجموع الفرعي' },
  { key: 'discount', label: 'الخصم' },
  { key: 'grandTotal', label: 'الإجمالي النهائي' },
  { key: 'footer', label: 'تذييل الفاتورة' },
];

export const SettingsScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { user } = useAuth();
  const canManageSettings = user?.role === 'admin' || user?.permissions?.includes('manage_settings') === true;
  const canManageRoles = canManageSettings;
  const canViewAuditLogs = user?.role === 'admin' || user?.permissions?.includes('view_audit_logs') === true;
  const [activeTab, setActiveTab] = useState<'company' | 'branches' | 'rbac' | 'users' | 'audit' | 'integrations'>('company');
  const [loading, setLoading] = useState(true);

  // Data states
  const [company, setCompany] = useState<any>({});
  const [branches, setBranches] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<any[]>([]);
  const [userPasswords, setUserPasswords] = useState<Record<string, string>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    username: '',
    fullName: '',
    password: '',
    email: '',
    phone: '',
    roleId: '',
    employeeId: '',
    active: true,
    customPermissions: false,
    permissions: [] as string[],
  });
  const [savingUser, setSavingUser] = useState(false);

  // Modals & forms
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [branchForm, setBranchForm] = useState({
    name: '',
    code: '',
    phone: '',
    address: '',
    city: 'القاهرة'
  });

  const [auditFilterAction, setAuditFilterAction] = useState('');

  const getRolePermissions = (role: any): string[] => {
    try {
      const value = JSON.parse(role.permissions || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const handlePricePermissionChange = (roleId: string, enabled: boolean) => {
    setRoles((currentRoles) => currentRoles.map((role) => {
      if (role.id !== roleId) return role;
      const rolePermissions = getRolePermissions(role).filter((permission) => permission !== 'manage_item_prices');
      if (enabled) rolePermissions.push('manage_item_prices');
      return { ...role, permissions: JSON.stringify(rolePermissions) };
    }));
  };

  const handleSaveRolePermissions = async (role: any) => {
    try {
      const updatedRole = await api.updateRolePermissions(role.id, getRolePermissions(role));
      setRoles((currentRoles) => currentRoles.map((currentRole) =>
        currentRole.id === role.id ? updatedRole : currentRole,
      ));
      showToast('تم حفظ صلاحية الأسعار للدور بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل حفظ صلاحيات الدور', 'error');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const empty = { data: {} as any };
      const [compRes, brRes, rRes, permRes, logRes] = await Promise.all([
        canManageSettings ? api.master.getCompany() : Promise.resolve(empty),
        canManageSettings ? api.master.getBranches() : Promise.resolve({ data: [] }),
        canManageSettings ? api.master.getRoles() : Promise.resolve({ data: [] }),
        canManageSettings ? api.settings.getPermissions() : Promise.resolve({ data: [] }),
        canViewAuditLogs ? api.settings.getAuditLogs({ action: auditFilterAction }) : Promise.resolve({ data: [] })
      ]);
      if (canManageSettings) {
        const printSettings = parsePrintSettings(compRes.data.printSettings || defaultPrintSettings);
        setCompany({ ...compRes.data, printSettings });
        localStorage.setItem('alasly-print-settings', JSON.stringify(printSettings));
        localStorage.setItem('alasly-print-company', JSON.stringify(compRes.data));
      }
      setBranches(brRes.data);
      setRoles(rRes.data);
      setPermissions(permRes.data);
      setAuditLogs(logRes.data);
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل الإعدادات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [auditFilterAction, canManageSettings, canViewAuditLogs]);

  useEffect(() => {
    switch (searchParams.get('tab')) {
      case 'company':
        if (canManageSettings) setActiveTab('company');
        break;
      case 'branches':
        if (canManageSettings) setActiveTab('branches');
        break;
      case 'rbac':
        if (canManageSettings) setActiveTab('rbac');
        break;
      case 'users':
        if (user?.role === 'admin') setActiveTab('users');
        break;
      case 'audit':
        if (canViewAuditLogs) setActiveTab('audit');
        break;
      case 'integrations':
        if (user?.role === 'admin') setActiveTab('integrations');
        break;
    }
    if (!canManageSettings && canViewAuditLogs) setActiveTab('audit');
  }, [searchParams, user?.role, canViewAuditLogs, canManageSettings]);

  useEffect(() => {
    if (activeTab !== 'users') return;
    Promise.all([api.getUsers(), api.master.getEmployees()])
      .then(([usersRes, employeesRes]) => {
        setUsers(usersRes.data);
        setEmployeeOptions(employeesRes.data);
      })
      .catch((err: any) => showToast(err.response?.data?.error || 'فشل تحميل المستخدمين', 'error'));
  }, [activeTab]);

  // Save Company Settings
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const printSettings = parsePrintSettings(company.printSettings);
      const response = await api.master.updateCompany({
        name: company.name,
        nameEn: company.nameEn,
        logoUrl: company.logoUrl,
        taxNumber: company.taxNumber,
        commercialRegister: company.commercialRegister,
        phone: company.phone,
        mobile: company.mobile,
        email: company.email,
        website: company.website,
        currency: 'EGP',
        currencySymbol: 'ج.م',
        city: company.city,
        country: company.country,
        address: company.address,
        invoiceHeader: company.invoiceHeader,
        invoiceFooter: company.invoiceFooter,
        termsAndConditions: company.termsAndConditions,
        supportTitle: company.supportTitle,
        supportDescription: company.supportDescription,
        supportPhoneLabel: company.supportPhoneLabel,
        supportPhone: company.supportPhone,
        printSettings: JSON.stringify(printSettings),
      });
      const savedCompany = { ...response.data, printSettings };
      setCompany(savedCompany);
      localStorage.setItem('alasly-print-settings', JSON.stringify(printSettings));
      localStorage.setItem('alasly-print-company', JSON.stringify(savedCompany));
      window.dispatchEvent(new Event('alasly-company-updated'));
      showToast('تم حفظ بيانات المنشأة بنجاح', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل حفظ البيانات', 'error');
    }
  };

  // Add Branch
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createBranch(branchForm);
      showToast('تمت إضافة الفرع بنجاح', 'success');
      setIsBranchModalOpen(false);
      setBranchForm({ name: '', code: '', phone: '', address: '', city: 'القاهرة' });
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل إضافة الفرع', 'error');
    }
  };

  const handleResetUserPassword = async (e: React.FormEvent, userId: string) => {
    e.preventDefault();
    const password = userPasswords[userId] || '';
    try {
      setSavingUserId(userId);
      await api.resetUserPassword(userId, password);
      setUserPasswords((current) => ({ ...current, [userId]: '' }));
      showToast('تم تغيير كلمة المرور بنجاح', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل تغيير كلمة المرور', 'error');
    } finally {
      setSavingUserId(null);
    }
  };

  const openUserModal = (account?: any) => {
    setEditingUserId(account?.id || null);
    setUserForm({
      username: account?.username || '',
      fullName: account?.fullName || '',
      password: '',
      email: account?.email || '',
      phone: account?.phone || '',
      roleId: account?.role?.id || roles[0]?.id || '',
      employeeId: account?.employee?.id || '',
      active: account?.active ?? true,
      customPermissions: account?.permissionOverrides != null,
      permissions: account?.permissions || [],
    });
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const data = {
      username: userForm.username,
      fullName: userForm.fullName,
      ...(userForm.password ? { password: userForm.password } : {}),
      email: userForm.email || null,
      phone: userForm.phone || null,
      roleId: userForm.roleId,
      employeeId: userForm.employeeId || null,
      active: userForm.active,
      permissionOverrides: userForm.customPermissions ? userForm.permissions : null,
    };

    try {
      setSavingUser(true);
      if (editingUserId) {
        const updateData = { ...data };
        delete updateData.password;
        await api.updateUser(editingUserId, updateData);
      } else {
        await api.createUser(data);
      }
      const response = await api.getUsers();
      setUsers(response.data);
      setIsUserModalOpen(false);
      showToast(editingUserId ? 'تم تحديث المستخدم وصلاحياته' : 'تم إنشاء المستخدم', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'تعذر حفظ المستخدم', 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (account: any) => {
    if (!window.confirm(`هل تريد حذف حساب ${account.fullName}؟`)) return;
    try {
      await api.deleteUser(account.id);
      setUsers((current) => current.filter((item) => item.id !== account.id));
      showToast('تم حذف المستخدم', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'تعذر حذف المستخدم', 'error');
    }
  };

  const updateOutputSetting = (
    output: 'barcode' | 'documents',
    key: keyof OutputPrintSettings,
    value: OutputPrintSettings[keyof OutputPrintSettings],
  ) => {
    const current = parsePrintSettings(company.printSettings);
    setCompany({
      ...company,
      printSettings: { ...current, [output]: { ...current[output], [key]: value } },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Settings className="w-7 h-7 text-blue-600" />
            إعدادات النظام والرقابة
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            ملف المنشأة الضريبي، الفروع، صلاحيات المستخدمين، وسجل العمليات والرقابة (Audit Log)
          </p>
        </div>
        {activeTab === 'branches' && canManageSettings && (
          <button
            onClick={() => setIsBranchModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            إضافة فرع جديد
          </button>
        )}
        {activeTab === 'users' && user?.role === 'admin' && (
          <button
            onClick={() => openUserModal()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            إضافة مستخدم
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6 pt-2 rounded-t-2xl overflow-x-auto">
        {canManageSettings && <button
          onClick={() => setActiveTab('company')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'company' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          بيانات المركز
        </button>}
        {canManageSettings && <button
          onClick={() => setActiveTab('branches')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'branches' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          الفروع والمستودعات ({branches.length})
        </button>}
        {canManageSettings && <button
          onClick={() => setActiveTab('rbac')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'rbac' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          الأدوار والصلاحيات (RBAC)
        </button>}
        {user?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            المستخدمون والصلاحيات
          </button>
        )}
        {canViewAuditLogs && (
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'audit' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            سجل الرقابة والعمليات ({auditLogs.length})
          </button>
        )}
        {user?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('integrations')}
            className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'integrations' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            ربط التنبيهات
          </button>
        )}
      </div>

      {/* Tab 1: Company Settings */}
      {activeTab === 'company' && canManageSettings && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6">
          <form onSubmit={handleSaveCompany} className="max-w-3xl space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المركز (بالعربية):</label>
                <input
                  type="text"
                  required
                  value={company.name || ''}
                  onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المركز (بالإنجليزية):</label>
                <input
                  type="text"
                  value={company.nameEn || ''}
                  onChange={(e) => setCompany({ ...company, nameEn: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الرقم الضريبي (15 رقماً):</label>
                <input
                  type="text"
                  required
                  value={company.taxNumber || ''}
                  onChange={(e) => setCompany({ ...company, taxNumber: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono font-bold text-blue-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم السجل التجاري (C.R):</label>
                <input
                  type="text"
                  value={company.commercialRegister || ''}
                  onChange={(e) => setCompany({ ...company, commercialRegister: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف / الجوال:</label>
                <input
                  type="text"
                  value={company.phone || ''}
                  onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني:</label>
                <input
                  type="email"
                  value={company.email || ''}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  dir="ltr"
                />
              </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المدينة:</label>
                <input
                  type="text"
                  value={company.city || ''}
                  onChange={(e) => setCompany({ ...company, city: e.target.value })}
                  placeholder="القاهرة"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الدولة:</label>
                <input
                  type="text"
                  value={company.country || ''}
                  onChange={(e) => setCompany({ ...company, country: e.target.value })}
                  placeholder="جمهورية مصر العربية"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">العنوان الوطني / التفصيلي:</label>
              <input
                type="text"
                value={company.address || ''}
                onChange={(e) => setCompany({ ...company, address: e.target.value })}
                placeholder="القاهرة، جمهورية مصر العربية"
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                <span className="mb-1 block">رقم الجوال</span>
                <input value={company.mobile || ''} onChange={(e) => setCompany({ ...company, mobile: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                <span className="mb-1 block">الموقع الإلكتروني</span>
                <input value={company.website || ''} onChange={(e) => setCompany({ ...company, website: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" dir="ltr" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                <span className="mb-1 block">رابط شعار المنشأة</span>
                <input value={company.logoUrl || ''} onChange={(e) => setCompany({ ...company, logoUrl: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" dir="ltr" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                <span className="mb-1 block">رمز العملة</span>
                <input value="ج.م" readOnly className="w-full rounded-xl border bg-slate-100 px-3 py-2 text-sm font-normal" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                <span className="mb-1 block">رمز العملة الدولي</span>
                <input value="EGP" readOnly className="w-full rounded-xl border bg-slate-100 px-3 py-2 text-sm font-normal" dir="ltr" />
              </label>
            </div>

            <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-bold text-slate-900">نصوص الفواتير</h3>
              <label className="block text-xs font-bold text-slate-700">
                <span className="mb-1 block">عنوان الفاتورة</span>
                <textarea value={company.invoiceHeader || ''} onChange={(e) => setCompany({ ...company, invoiceHeader: e.target.value })} rows={2} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                <span className="mb-1 block">تذييل الفاتورة</span>
                <textarea value={company.invoiceFooter || ''} onChange={(e) => setCompany({ ...company, invoiceFooter: e.target.value })} rows={2} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                <span className="mb-1 block">الشروط والأحكام</span>
                <textarea value={company.termsAndConditions || ''} onChange={(e) => setCompany({ ...company, termsAndConditions: e.target.value })} rows={3} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" />
              </label>
            </section>

            <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-bold text-slate-900">بيانات بطاقة الدعم الفني</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  <span className="mb-1 block">عنوان البطاقة</span>
                  <input value={company.supportTitle || ''} onChange={(e) => setCompany({ ...company, supportTitle: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  <span className="mb-1 block">رقم التواصل</span>
                  <input value={company.supportPhone || ''} onChange={(e) => setCompany({ ...company, supportPhone: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  <span className="mb-1 block">وصف رقم التواصل</span>
                  <input value={company.supportPhoneLabel || ''} onChange={(e) => setCompany({ ...company, supportPhoneLabel: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                </label>
              </div>
              <label className="block text-xs font-bold text-slate-700">
                <span className="mb-1 block">نص البطاقة</span>
                <textarea value={company.supportDescription || ''} onChange={(e) => setCompany({ ...company, supportDescription: e.target.value })} rows={2} className="w-full rounded-xl border px-3 py-2 text-sm font-normal" />
              </label>
            </section>

            <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-blue-700" />
                <div>
                  <h3 className="font-bold text-slate-900">إعدادات الطباعة المستقلة</h3>
                  <p className="text-xs text-slate-500">اضبط الباركود والمستندات بشكل مستقل. اختيار الطابعة الفعلية متاح من نافذة الطباعة بالمتصفح.</p>
                </div>
              </div>

              {([
                { key: 'barcode', title: 'طباعة الباركود', settings: company.printSettings?.barcode },
                { key: 'documents', title: 'الفواتير والتقارير', settings: company.printSettings?.documents },
              ] as const).map(({ key, title, settings }) => (
                <div key={key} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-bold text-slate-800">{title}</h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-bold text-slate-700">
                  <span className="block">نوع الطابعة</span>
                  <select
                    value={settings?.printerType || defaultPrintSettings[key].printerType}
                    onChange={(e) => updateOutputSetting(key, 'printerType', e.target.value as PrintSettings['printerType'])}
                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm font-normal"
                  >
                    <option value="STANDARD">عادية (ليزر / نفث حبر)</option>
                    <option value="THERMAL">حرارية</option>
                  </select>
                </label>

                <label className="space-y-1 text-xs font-bold text-slate-700">
                  <span className="block">مقاس الورق</span>
                  <select
                    value={settings?.paperSize || defaultPrintSettings[key].paperSize}
                    onChange={(e) => updateOutputSetting(key, 'paperSize', e.target.value as PrintSettings['paperSize'])}
                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm font-normal"
                  >
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="THERMAL_80">حراري 80 مم</option>
                    <option value="THERMAL_58">حراري 58 مم</option>
                  </select>
                </label>
              </div>
                </div>
              ))}

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={company.printSettings?.showCompanyName ?? true}
                  onChange={(e) => setCompany({
                    ...company,
                    printSettings: { ...parsePrintSettings(company.printSettings), showCompanyName: e.target.checked },
                  })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                إظهار اسم المنشأة على المطبوعات
              </label>

              <div>
                <h4 className="mb-2 text-xs font-bold text-slate-700">الحقول الظاهرة في الفاتورة</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {invoicePrintFieldLabels.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={company.printSettings?.invoiceFields?.[key] ?? true}
                        onChange={(e) => {
                          const current = parsePrintSettings(company.printSettings);
                          setCompany({
                            ...company,
                            printSettings: {
                              ...current,
                              invoiceFields: { ...current.invoiceFields, [key]: e.target.checked },
                            },
                          });
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <div className="pt-4 border-t">
              <button
                type="submit"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md transition"
              >
                <Save className="w-4 h-4" />
                حفظ التعديلات
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Branches */}
      {activeTab === 'branches' && canManageSettings && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {branches.map(b => (
              <div key={b.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">{b.name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">كود الفرع: {b.code}</p>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    نشط
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div>المدينة والعنوان: <span className="font-semibold text-slate-800">{b.city} - {b.address}</span></div>
                  <div>الهاتف: <span className="font-semibold text-slate-800">{b.phone || '-'}</span></div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t text-center text-xs">
                  <div className="bg-white p-2 rounded-lg border">
                    <span className="text-slate-400 block text-[10px]">المستودعات</span>
                    <span className="font-bold text-slate-800">{b.warehouses?.length || 0}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border">
                    <span className="text-slate-400 block text-[10px]">الصناديق</span>
                    <span className="font-bold text-slate-800">{b.cashboxes?.length || 0}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border">
                    <span className="text-slate-400 block text-[10px]">الموظفين</span>
                    <span className="font-bold text-slate-800">{b._count?.employees || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: RBAC Roles & Permissions */}
      {activeTab === 'rbac' && canManageSettings && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roles.map(r => (
              <div key={r.id} className="p-4 rounded-xl border bg-slate-50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-slate-900">{r.nameAr}</h4>
                  <span className="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">
                    {r.name}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">{r.description || 'صلاحيات مخصصة للنظام'}</p>
                <div className="text-xs text-slate-600 flex items-center justify-between border-t pt-2">
                  <span>عدد المستخدمين المربوطين:</span>
                  <span className="font-bold font-mono">{r._count?.users || 0} مستخدم</span>
                </div>
                <div className="mt-3 border-t pt-3 space-y-3">
                  <label className="flex items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={r.name === 'admin' || getRolePermissions(r).includes('manage_item_prices')}
                      disabled={!canManageRoles || r.name === 'admin'}
                      onChange={(event) => handlePricePermissionChange(r.id, event.target.checked)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <span>عرض وتعديل أسعار الشراء والبيع في المخزون</span>
                  </label>
                  {canManageRoles && r.name !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => handleSaveRolePermissions(r)}
                      className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                    >
                      <Save className="w-3.5 h-3.5" />
                      حفظ صلاحية الأسعار
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border rounded-xl p-5">
            <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600" />
              مصفوفة الصلاحيات المتاحة بالنظام
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {permissions.map((p: any) => (
                <div key={p.key} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-medium text-slate-800">{p.name}</span>
                  <span className="mr-auto text-[10px] text-slate-400">({p.group})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && user?.role === 'admin' && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-4">
          <p className="text-sm text-slate-600">
            أنشئ الحسابات، اربطها بالموظفين، وحدد الصلاحيات الفردية أو استخدم صلاحيات الدور. كلمات المرور لا تقل عن 16 بايت.
          </p>
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">المستخدم</th>
                  <th className="py-3 px-4">الدور</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">الموظف</th>
                  <th className="py-3 px-4">الصلاحيات</th>
                  <th className="py-3 px-4">إدارة الحساب</th>
                  <th className="py-3 px-4">تعيين كلمة مرور جديدة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((account) => (
                  <tr key={account.id}>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{account.fullName}</div>
                      <div className="text-xs text-slate-500" dir="ltr">{account.username}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">{account.role?.nameAr || account.role?.name || '-'}</td>
                    <td className="py-3 px-4 text-xs">{account.active ? 'نشط' : 'معطل'}</td>
                    <td className="py-3 px-4 text-xs">{account.employee?.name || '-'}</td>
                    <td className="py-3 px-4 text-xs">{account.permissionOverrides != null ? 'مخصصة' : 'من الدور'}</td>
                    <td className="py-3 px-4">
                      <div className="flex min-w-[10rem] gap-2">
                        <button
                          type="button"
                          onClick={() => openUserModal(account)}
                          className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                        >
                          تعديل وصلاحيات
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(account)}
                          disabled={account.id === user?.id}
                          className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <form onSubmit={(e) => handleResetUserPassword(e, account.id)} className="flex min-w-[24rem] gap-2">
                        <input
                          type="password"
                          required
                          minLength={16}
                          maxLength={72}
                          autoComplete="new-password"
                          value={userPasswords[account.id] || ''}
                          onChange={(e) => setUserPasswords((current) => ({ ...current, [account.id]: e.target.value }))}
                          placeholder="16 حرفًا على الأقل"
                          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs"
                          dir="ltr"
                        />
                        <button
                          type="submit"
                          disabled={savingUserId === account.id}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {savingUserId === account.id ? 'جارٍ الحفظ...' : 'حفظ'}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">لا يوجد مستخدمون</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Audit Logs */}
      {activeTab === 'audit' && canViewAuditLogs && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700">تصفية حسب نوع الإجراء:</span>
            <select
              value={auditFilterAction}
              onChange={(e) => setAuditFilterAction(e.target.value)}
              className="border rounded-xl px-3 py-1.5 text-xs bg-slate-50 outline-none"
            >
              <option value="">جميع العمليات</option>
              <option value="LOGIN">تسجيل الدخول (LOGIN)</option>
              <option value="CREATE">إنشاء (CREATE)</option>
              <option value="UPDATE">تعديل (UPDATE)</option>
              <option value="APPROVE">اعتماد (APPROVE)</option>
              <option value="TRANSFER">تحويل مخزني (TRANSFER)</option>
              <option value="STOCKTAKING">جرد (STOCKTAKING)</option>
              <option value="CLOSE_SHIFT">إغلاق وردية (CLOSE_SHIFT)</option>
            </select>
          </div>

          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b text-xs">
                <tr>
                  <th className="py-3 px-4">التاريخ والوقت</th>
                  <th className="py-3 px-4">المستخدم</th>
                  <th className="py-3 px-4">نوع الإجراء</th>
                  <th className="py-3 px-4">الكيان المتأثر</th>
                  <th className="py-3 px-4">تفاصيل العملية</th>
                  <th className="py-3 px-4">عنوان IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">لا توجد سجلات رقابة مسجلة</td>
                  </tr>
                ) : (
                  auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 text-xs font-mono text-slate-500">
                        {new Date(log.createdAt).toLocaleDateString('ar-SA')} {new Date(log.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 text-xs font-bold text-slate-900">
                        {log.user?.fullName || log.user?.username || 'النظام'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-slate-100 text-slate-800">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-600">{log.entity}</td>
                      <td className="py-3 px-4 text-xs text-slate-700 max-w-md truncate">{log.details || '-'}</td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-400">{log.ipAddress || '127.0.0.1'}</td>
                    </tr>
                  ))
                )}

              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'integrations' && user?.role === 'admin' && <NotificationIntegrations />}

      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSaveUser} className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{editingUserId ? 'تعديل حساب وصلاحيات المستخدم' : 'إنشاء مستخدم جديد'}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-slate-700">
                اسم المستخدم
                <input required value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" dir="ltr" />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">
                الاسم الكامل
                <input required value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </label>
              {!editingUserId && (
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  كلمة المرور (16 إلى 72 بايت)
                  <input required minLength={16} maxLength={72} autoComplete="new-password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" dir="ltr" />
                </label>
              )}
              <label className="space-y-1 text-xs font-semibold text-slate-700">
                الدور
                <select required value={userForm.roleId} onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })} className="w-full rounded-lg border bg-white px-3 py-2 text-sm">
                  <option value="">اختر الدور</option>
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.nameAr || role.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">
                ربط بموظف
                <select value={userForm.employeeId} onChange={(e) => setUserForm({ ...userForm, employeeId: e.target.value })} className="w-full rounded-lg border bg-white px-3 py-2 text-sm">
                  <option value="">بدون ربط</option>
                  {employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">
                البريد الإلكتروني
                <input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" dir="ltr" />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">
                الهاتف
                <input value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" dir="ltr" />
              </label>
            </div>
            {editingUserId && (
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={userForm.active} onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })} disabled={editingUserId === user?.id} />
                الحساب نشط
              </label>
            )}
            <section className="space-y-3 rounded-xl border p-4">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <input type="checkbox" checked={userForm.customPermissions} onChange={(e) => {
                  const rolePermissions = roles.find((role) => role.id === userForm.roleId)?.permissions || '[]';
                  let parsedRolePermissions: string[] = [];
                  try {
                    const parsed: unknown = JSON.parse(rolePermissions);
                    if (Array.isArray(parsed) && parsed.every((permission) => typeof permission === 'string')) {
                      parsedRolePermissions = parsed;
                    }
                  } catch (error) {
                    console.error('Failed to parse role permissions:', error);
                  }
                  setUserForm({
                    ...userForm,
                    customPermissions: e.target.checked,
                    permissions: e.target.checked && !userForm.permissions.length ? parsedRolePermissions : userForm.permissions,
                  });
                }} />
                تخصيص الصلاحيات لهذا المستخدم بدلًا من صلاحيات الدور
              </label>
              {userForm.customPermissions && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {permissions.map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={userForm.permissions.includes(permission.key)}
                        onChange={(e) => setUserForm({
                          ...userForm,
                          permissions: e.target.checked
                            ? [...userForm.permissions, permission.key]
                            : userForm.permissions.filter((item) => item !== permission.key),
                        })}
                      />
                      {permission.name}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-500">يظل ربط WhatsApp وTelegram متاحًا لمدير النظام فقط.</p>
            </section>
            <div className="flex justify-end gap-2 border-t pt-4">
              <button type="button" onClick={() => setIsUserModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">إلغاء</button>
              <button type="submit" disabled={savingUser} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                {savingUser ? 'جارٍ الحفظ...' : 'حفظ المستخدم'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Branch Modal */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              إضافة فرع جديد
            </h3>
            <form onSubmit={handleCreateBranch} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">اسم الفرع:</label>
                <input
                  type="text"
                  required
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder="مثال: فرع الإسكندرية - وسط البلد"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">كود الفرع:</label>
                  <input
                    type="text"
                    required
                    value={branchForm.code}
                    onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                    placeholder="ALX-01"
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">المدينة:</label>
                  <input
                    type="text"
                    required
                    value={branchForm.city}
                    onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">رقم الهاتف:</label>
                <input
                  type="text"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                  placeholder="012XXXXXXX"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">العنوان:</label>
                <input
                  type="text"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  placeholder="القاهرة، جمهورية مصر العربية"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  حفظ الفرع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
