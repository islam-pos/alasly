import React, { useState, useEffect } from 'react';
import { 
  Settings, Building, ShieldCheck, History, 
  Save, Plus, MapPin, Phone, Mail, CheckCircle2, 
  Users, Key, FileText, Search
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const SettingsScreen: React.FC = () => {
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canManageRoles = hasPermission('manage_settings');
  const [activeTab, setActiveTab] = useState<'company' | 'branches' | 'rbac' | 'audit'>('company');
  const [loading, setLoading] = useState(true);

  // Data states
  const [company, setCompany] = useState<any>({});
  const [branches, setBranches] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Modals & forms
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [branchForm, setBranchForm] = useState({
    name: '',
    code: '',
    phone: '',
    address: '',
    city: 'الرياض'
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
      const [compRes, brRes, rRes, permRes, logRes] = await Promise.all([
        api.getCompany(),
        api.getBranches(),
        api.getRoles(),
        api.getPermissionsList(),
        api.getAuditLogs({ action: auditFilterAction })
      ]);
      setCompany(compRes);
      setBranches(brRes);
      setRoles(rRes);
      setPermissions(permRes);
      setAuditLogs(logRes);
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل الإعدادات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [auditFilterAction]);

  // Save Company Settings
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateCompany(company);
      showToast('تم حفظ بيانات المنشأة والضريبة بنجاح', 'success');
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
      setBranchForm({ name: '', code: '', phone: '', address: '', city: 'الرياض' });
      loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'فشل إضافة الفرع', 'error');
    }
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
        {activeTab === 'branches' && (
          <button
            onClick={() => setIsBranchModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            إضافة فرع جديد
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6 pt-2 rounded-t-2xl overflow-x-auto">
        <button
          onClick={() => setActiveTab('company')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'company' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          بيانات المركز والضريبة
        </button>
        <button
          onClick={() => setActiveTab('branches')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'branches' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          الفروع والمستودعات ({branches.length})
        </button>
        <button
          onClick={() => setActiveTab('rbac')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'rbac' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          الأدوار والصلاحيات (RBAC)
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-4 px-4 font-bold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === 'audit' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          سجل الرقابة والعمليات ({auditLogs.length})
        </button>
      </div>

      {/* Tab 1: Company Settings */}
      {activeTab === 'company' && (
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
                <span className="text-[11px] text-slate-400">مطلوب للاعتماد مع فواتير الزكاة والضريبة والجمارك</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم السجل التجاري (C.R):</label>
                <input
                  type="text"
                  value={company.crNumber || ''}
                  onChange={(e) => setCompany({ ...company, crNumber: e.target.value })}
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

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نسبة ضريبة القيمة المضافة الافتراضية:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={company.vatRate || 15}
                    onChange={(e) => setCompany({ ...company, vatRate: parseFloat(e.target.value) || 15 })}
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono font-bold"
                  />
                  <span className="font-bold text-slate-600">%</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">العنوان الوطني / التفصيلي:</label>
              <input
                type="text"
                value={company.address || ''}
                onChange={(e) => setCompany({ ...company, address: e.target.value })}
                placeholder="الرياض - حي الصناعية القديمة - شارع المنتزه..."
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
              />
            </div>

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
      {activeTab === 'branches' && (
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
      {activeTab === 'rbac' && (
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

      {/* Tab 4: Audit Logs */}
      {activeTab === 'audit' && (
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
                  placeholder="مثال: فرع جدة - طريق المدينة"
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
                    placeholder="JED-01"
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
                  placeholder="حي النعيم - شارع حراء..."
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
