import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Wrench,
  Car,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Package,
  DollarSign,
  Printer,
  History,
  Check,
  X,
  ChevronRight,
  ShieldAlert,
  CreditCard,
  Plus,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const JobCardDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [availableItems, setAvailableItems] = useState<any[]>([]);

  // Modals
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [cashPaid, setCashPaid] = useState<number>(0);
  const [cardPaid, setCardPaid] = useState<number>(0);
  const [finalDiscount, setFinalDiscount] = useState<number>(0);
  const [submittingInvoice, setSubmittingInvoice] = useState(false);

  // Estimate Form State
  const [estimateItems, setEstimateItems] = useState<any[]>([
    { type: 'PART', description: '', quantity: 1, unitPrice: 0, itemId: '' },
    { type: 'LABOR', description: '', quantity: 1, unitPrice: 0 },
  ]);
  const [estimateDiscount, setEstimateDiscount] = useState<number>(0);
  const [savingEstimate, setSavingEstimate] = useState(false);

  // Inspection state
  const [inspectionData, setInspectionData] = useState<any>({
    engineCheck: 'GOOD',
    oilsCheck: 'GOOD',
    brakesCheck: 'GOOD',
    tiresCheck: 'GOOD',
    batteryCheck: 'GOOD',
    electricalCheck: 'GOOD',
    acCheck: 'GOOD',
    suspensionCheck: 'GOOD',
    coolingCheck: 'GOOD',
    computerScanCheck: 'GOOD',
    inspectorNotes: '',
  });
  const [savingInspection, setSavingInspection] = useState(false);

  const { success, error } = useToast();

  useEffect(() => {
    if (id) {
      loadDetails();
      api.getItems().then(setAvailableItems).catch(console.error);
    }
  }, [id]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const res = await api.getJobCardById(id!);
      setData(res);
      if (res.jobCard.inspections && res.jobCard.inspections.length > 0) {
        setInspectionData(res.jobCard.inspections[0]);
      }
    } catch (err: any) {
      error(err.message || 'فشل تحميل بيانات أمر الإصلاح');
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-sm font-medium">جاري تحميل تفاصيل أمر الإصلاح والملفات المرفقة...</div>
      </div>
    );
  }

  const { jobCard, auditLogs } = data;

  // Workflow progress steps (Section 23)
  const steps = [
    { key: 'NEW', label: 'استقبال' },
    { key: 'PENDING_INSPECTION', label: 'فحص' },
    { key: 'PENDING_APPROVAL', label: 'موافقة العميل' },
    { key: 'IN_PROGRESS', label: 'قيد الإصلاح' },
    { key: 'READY_FOR_DELIVERY', label: 'جاهز للتسليم' },
    { key: 'CLOSED', label: 'مغلق ومفوتر' },
  ];

  const getStepIndex = (status: string) => {
    switch (status) {
      case 'NEW': return 0;
      case 'PENDING_INSPECTION': return 1;
      case 'PENDING_APPROVAL': return 2;
      case 'APPROVED':
      case 'IN_PROGRESS':
      case 'WAITING_PARTS': return 3;
      case 'COMPLETED':
      case 'READY_FOR_DELIVERY': return 4;
      case 'CLOSED': return 5;
      default: return 0;
    }
  };

  const currentStepIdx = getStepIndex(jobCard.status);

  // Status transition handler
  const handleUpdateStatus = async (newStatus: string) => {
    try {
      await api.updateJobCardStatus(jobCard.id, newStatus);
      success(`تم تحديث حالة أمر الإصلاح إلى: ${newStatus}`);
      loadDetails();
    } catch (err: any) {
      error(err.message || 'فشل تحديث الحالة');
    }
  };

  // Save Inspection
  const handleSaveInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInspection(true);
    try {
      await api.saveInspection(jobCard.id, inspectionData);
      success('تم حفظ وتحديث تقرير الفحص الفني بنجاح');
      loadDetails();
    } catch (err: any) {
      error(err.message || 'فشل حفظ الفحص');
    } finally {
      setSavingInspection(false);
    }
  };

  // Save Estimate
  const handleSaveEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEstimate(true);
    try {
      await api.createEstimate(jobCard.id, {
        items: estimateItems.filter((i) => i.description.trim()),
        discount: estimateDiscount,
      });
      success('تم إنشاء عرض السعر (Estimate) بنجاح');
      loadDetails();
    } catch (err: any) {
      error(err.message || 'فشل إنشاء عرض السعر');
    } finally {
      setSavingEstimate(false);
    }
  };

  // Approve Estimate (Customer Approval Action)
  const handleApproveEstimate = async (estimateId: string, approved: boolean) => {
    try {
      await api.approveEstimate(jobCard.id, estimateId, approved);
      success(approved ? 'تم تسجيل موافقة العميل واعتماد العمل!' : 'تم تسجيل رفض العميل');
      loadDetails();
    } catch (err: any) {
      error(err.message || 'فشل تسجيل موافقة العميل');
    }
  };

  // Issue Part to workshop
  const handleIssuePart = async (partId: string) => {
    try {
      await api.issuePartToWorkshop(jobCard.id, { partId, quantity: 1 });
      success('تم صرف القطعة للورشة بنجاح وخصمها من المخزون');
      loadDetails();
    } catch (err: any) {
      error(err.message || 'فشل صرف القطعة');
    }
  };

  // Generate Final Invoice
  const handleGenerateInvoice = async () => {
    setSubmittingInvoice(true);
    try {
      const res = await api.generateJobCardInvoice(jobCard.id, {
        paymentMethod,
        cashPaid,
        cardPaid,
        discount: finalDiscount,
      });
      success(`تم إصدار فاتورة الصيانة النهائية ${res.invoiceNumber} وإغلاق أمر الإصلاح!`);
      setInvoiceModalOpen(false);
      loadDetails();
    } catch (err: any) {
      error(err.message || 'فشل إصدار الفاتورة النهائية');
    } finally {
      setSubmittingInvoice(false);
    }
  };

  const tabs = [
    { id: 1, label: 'بيانات الاستقبال' },
    { id: 2, label: 'شكوى العميل' },
    { id: 3, label: 'الفحص الفني (10 نقاط)' },
    { id: 4, label: 'عرض السعر (Estimate)' },
    { id: 5, label: 'طلبات قطع الغيار' },
    { id: 6, label: 'أجور اليد والخدمات' },
    { id: 7, label: 'القطع المصروفة' },
    { id: 8, label: 'الصور والمرفقات' },
    { id: 9, label: 'المدفوعات والفوترة' },
    { id: 10, label: 'سجل العمليات (Audit)' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Banner with Key Data (Section 23) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600 font-black">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 font-mono tracking-tight">
                  {jobCard.orderNumber}
                </h1>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-brand-100 text-brand-800">
                  {jobCard.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                تاريخ الدخول: {new Date(jobCard.createdAt).toLocaleString('ar-SA')}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {jobCard.status !== 'CLOSED' && jobCard.status !== 'CANCELLED' && (
              <>
                {jobCard.status === 'NEW' && (
                  <button
                    onClick={() => handleUpdateStatus('PENDING_INSPECTION')}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20"
                  >
                    بدء الفحص الفني
                  </button>
                )}
                {jobCard.status === 'APPROVED' && (
                  <button
                    onClick={() => handleUpdateStatus('IN_PROGRESS')}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-600/20"
                  >
                    بدء العمل والإصلاح
                  </button>
                )}
                {jobCard.status === 'IN_PROGRESS' && (
                  <button
                    onClick={() => handleUpdateStatus('READY_FOR_DELIVERY')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20"
                  >
                    اكتمال الإصلاح وجاهزة للتسليم
                  </button>
                )}
                {jobCard.status === 'READY_FOR_DELIVERY' && (
                  <button
                    onClick={() => setInvoiceModalOpen(true)}
                    className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-md shadow-slate-900/20 flex items-center gap-1.5"
                  >
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>إصدار فاتورة الصيانة النهائية</span>
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => window.print()}
              className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
              title="طباعة أمر الإصلاح"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Vehicle & Customer Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <span className="text-slate-400 block font-medium">العميل:</span>
            <span className="font-bold text-slate-900 text-sm">{jobCard.customer?.name}</span>
            <span className="text-[10px] text-slate-400 font-mono block">{jobCard.customer?.phone}</span>
          </div>

          <div>
            <span className="text-slate-400 block font-medium">السيارة:</span>
            <span className="font-bold text-slate-900 text-sm">
              {jobCard.vehicle?.make} {jobCard.vehicle?.model}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">موديل {jobCard.vehicle?.year}</span>
          </div>

          <div>
            <span className="text-slate-400 block font-medium">رقم اللوحة:</span>
            <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded font-mono font-bold inline-block mt-0.5">
              {jobCard.vehicle?.plateNumber}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block font-medium">قراءة العداد (كم):</span>
            <span className="font-bold text-slate-900 text-sm font-mono">
              {jobCard.currentOdometer.toLocaleString()}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block font-medium">الفني المسؤول:</span>
            <span className="font-bold text-slate-900 text-sm">
              {jobCard.technician?.name || 'غير محدد'}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block font-medium">مهندس الاستقبال:</span>
            <span className="font-bold text-slate-900 text-sm">
              {jobCard.serviceAdvisor?.name || 'غير محدد'}
            </span>
          </div>
        </div>

        {/* Visual Progress Bar (Section 23) */}
        <div>
          <div className="text-xs font-bold text-slate-500 mb-2">مسار تقدم الصيانة في المركز:</div>
          <div className="grid grid-cols-6 gap-1 sm:gap-2">
            {steps.map((st, idx) => {
              const isPast = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;

              return (
                <div key={st.key} className="text-center">
                  <div
                    className={`h-2.5 rounded-full mb-1.5 transition-all ${
                      isPast
                        ? 'bg-emerald-500'
                        : isCurrent
                        ? 'bg-brand-600 animate-pulse ring-2 ring-brand-300'
                        : 'bg-slate-200'
                    }`}
                  ></div>
                  <span
                    className={`text-[11px] font-bold block truncate ${
                      isCurrent ? 'text-brand-700' : isPast ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Multi-Tab Navigation (Section 23: 10 Tabs) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center overflow-x-auto border-b border-slate-200 bg-slate-50/50 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-700 bg-white shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Contents Area */}
        <div className="p-6">
          {/* Tab 1: بيانات الاستقبال */}
          {activeTab === 1 && (
            <div className="space-y-4 max-w-2xl text-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3">تفاصيل تسجيل الدخول والاستقبال</h3>
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block font-medium">مستوى الوقود عند الدخول:</span>
                  <span className="font-bold text-slate-800 text-sm mt-0.5 block">{jobCard.fuelLevel || '50%'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">الفرع:</span>
                  <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                    {jobCard.branch?.name || 'الفرع الرئيسي'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">رقم الهيكل VIN:</span>
                  <span className="font-bold font-mono text-slate-800 text-sm mt-0.5 block">
                    {jobCard.vehicle?.vin || 'غير مسجل'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">تاريخ التسليم المتوقع:</span>
                  <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                    {jobCard.estimatedCompletion
                      ? new Date(jobCard.estimatedCompletion).toLocaleDateString('ar-SA')
                      : 'خلال 24 ساعة'}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">ملاحظات الاستقبال وحالة الهيكل:</h4>
                <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-slate-700 leading-relaxed">
                  {jobCard.intakeNotes || 'لا توجد ملاحظات إضافية مسجلة عند الاستلام.'}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: شكوى العميل */}
          {activeTab === 2 && (
            <div className="space-y-4 max-w-2xl text-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3">شكوى العميل والأعطال المذكورة</h3>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="text-sm font-bold text-slate-800 leading-relaxed">
                  {jobCard.customerComplaint}
                </div>
              </div>
              <p className="text-slate-400 text-[11px]">
                تم تسجيل هذه الشكوى بمعرفة مهندس الاستقبال بناءً على إفادة العميل المباشرة.
              </p>
            </div>
          )}

          {/* Tab 3: الفحص الفني (10-Point Technical Inspection Checklist) */}
          {activeTab === 3 && (
            <form onSubmit={handleSaveInspection} className="space-y-6 text-xs max-w-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">تقرير الفحص الفني الشامل (10 نقاط فحص)</h3>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    قم بفحص كافة أجزاء السيارة وتحديد حالتها (سليم، يحتاج صيانة، تالف)
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={savingInspection}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-brand-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingInspection ? 'جاري الحفظ...' : 'حفظ الفحص'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'engineCheck', label: '1. فحص المحرك وسير المكينة' },
                  { key: 'oilsCheck', label: '2. فحص الزيوت ومستوى السوائل' },
                  { key: 'brakesCheck', label: '3. فحص منظومة الفرامل والهوبات' },
                  { key: 'tiresCheck', label: '4. فحص الإطارات وضغط الهواء' },
                  { key: 'batteryCheck', label: '5. فحص جهد البطارية والشحن' },
                  { key: 'electricalCheck', label: '6. فحص الكهرباء والأنوار والحساسات' },
                  { key: 'acCheck', label: '7. فحص نظام التكييف والفريون' },
                  { key: 'suspensionCheck', label: '8. فحص نظام التعليق والمساعدات' },
                  { key: 'coolingCheck', label: '9. فحص دورة التبريد والرديتر' },
                  { key: 'computerScanCheck', label: '10. فحص وتشخيص الكمبيوتر (OBD)' },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between"
                  >
                    <span className="font-bold text-slate-800">{item.label}</span>
                    <select
                      value={inspectionData[item.key] || 'GOOD'}
                      onChange={(e) =>
                        setInspectionData({ ...inspectionData, [item.key]: e.target.value })
                      }
                      className={`font-bold px-2 py-1 rounded-lg border text-xs outline-none ${
                        inspectionData[item.key] === 'GOOD'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : inspectionData[item.key] === 'FAIR'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-rose-50 text-rose-800 border-rose-300'
                      }`}
                    >
                      <option value="GOOD">سليم (Good)</option>
                      <option value="FAIR">يحتاج متابعة (Fair)</option>
                      <option value="BAD">تالف يحتاج تغيير (Bad)</option>
                    </select>
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات وتقرير الفني الفاحص:</label>
                <textarea
                  rows={3}
                  value={inspectionData.inspectorNotes || ''}
                  onChange={(e) =>
                    setInspectionData({ ...inspectionData, inspectorNotes: e.target.value })
                  }
                  placeholder="سجل أية أكواد أعطال ظهرت في فحص الكمبيوتر، أو تسريبات تحتاج تدخل..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>
            </form>
          )}

          {/* Tab 4: عرض السعر (Estimate & Customer Approval) */}
          {activeTab === 4 && (
            <div className="space-y-6 text-xs max-w-4xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">عروض الأسعار والتسعير المبدئي (Estimates)</h3>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    حسب قاعدة العمل: لا يمكن اعتماد أمر الإصلاح ونقله لـ "معتمد" إلا بعد تسجيل موافقة العميل الرسمية!
                  </p>
                </div>
              </div>

              {/* Existing Estimates */}
              {jobCard.estimates && jobCard.estimates.length > 0 ? (
                jobCard.estimates.map((est: any) => (
                  <div key={est.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                      <div>
                        <span className="font-mono font-bold text-brand-700 text-sm ml-2">
                          {est.estimateNumber}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            est.isApprovedByCustomer
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {est.isApprovedByCustomer ? 'معتمد بموافقة العميل' : 'بانتظار موافقة العميل'}
                        </span>
                      </div>

                      {/* Approval Actions */}
                      {!est.isApprovedByCustomer && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApproveEstimate(est.id, true)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>تسجيل موافقة العميل</span>
                          </button>
                          <button
                            onClick={() => handleApproveEstimate(est.id, false)}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs"
                          >
                            رفض
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Estimate Items Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="text-slate-400 font-bold border-b border-slate-200">
                          <tr>
                            <th className="pb-2">النوع</th>
                            <th className="pb-2">البيان / الصنف / الخدمة</th>
                            <th className="pb-2">الكمية</th>
                            <th className="pb-2">السعر</th>
                            <th className="pb-2">الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60 font-medium">
                          {est.items?.map((it: any) => (
                            <tr key={it.id}>
                              <td className="py-2 text-slate-500">
                                {it.type === 'PART' ? 'قطعة غيار' : 'أجور يد'}
                              </td>
                              <td className="py-2 font-bold text-slate-800">{it.description}</td>
                              <td className="py-2 font-mono">{it.quantity}</td>
                              <td className="py-2 font-mono">{it.unitPrice} ر.س</td>
                              <td className="py-2 font-bold text-slate-900">{it.total} ر.س</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-3 border-t border-slate-200 flex justify-end gap-6 text-xs font-bold">
                      <div>
                        <span className="text-slate-400">إجمالي القطع: </span>
                        <span>{est.subtotalParts} ر.س</span>
                      </div>
                      <div>
                        <span className="text-slate-400">إجمالي اليد: </span>
                        <span>{est.subtotalLabor} ر.س</span>
                      </div>
                      <div>
                        <span className="text-slate-400">الضريبة (15%): </span>
                        <span>{est.taxAmount.toFixed(2)} ر.س</span>
                      </div>
                      <div className="text-brand-700 text-sm">
                        <span>الإجمالي الكلي: </span>
                        <span>{est.grandTotal.toFixed(2)} ر.س</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                /* Form to create an Estimate */
                <form onSubmit={handleSaveEstimate} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="font-bold text-slate-800">إنشاء عرض سعر جديد للسيارة:</div>

                  {estimateItems.map((item, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row items-center gap-2">
                      <select
                        value={item.type}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEstimateItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, type: val } : it))
                          );
                        }}
                        className="p-2 bg-white border border-slate-200 rounded-lg font-bold text-xs"
                      >
                        <option value="PART">قطعة غيار</option>
                        <option value="LABOR">أجور يد / خدمة</option>
                      </select>

                      {item.type === 'PART' ? (
                        <select
                          value={item.itemId}
                          onChange={(e) => {
                            const found = availableItems.find((ai) => ai.id === e.target.value);
                            setEstimateItems((prev) =>
                              prev.map((it, i) =>
                                i === idx
                                  ? {
                                      ...it,
                                      itemId: e.target.value,
                                      description: found?.nameAr || '',
                                      unitPrice: found?.sellPrice || 0,
                                    }
                                  : it
                              )
                            );
                          }}
                          className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                        >
                          <option value="">-- اختر قطعة الغيار --</option>
                          {availableItems.map((ai) => (
                            <option key={ai.id} value={ai.id}>
                              {ai.nameAr} ({ai.sellPrice} ر.س)
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => {
                            const desc = e.target.value;
                            setEstimateItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, description: desc } : it))
                            );
                          }}
                          placeholder="اسم الخدمة (مثلاً خرط هوبات، تنظيف بخاخات...)"
                          className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      )}

                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const q = parseInt(e.target.value) || 1;
                          setEstimateItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, quantity: q } : it))
                          );
                        }}
                        placeholder="الكمية"
                        className="w-16 p-2 bg-white border border-slate-200 rounded-lg text-xs text-center font-bold"
                      />

                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value) || 0;
                          setEstimateItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, unitPrice: p } : it))
                          );
                        }}
                        placeholder="السعر"
                        className="w-24 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                      />

                      <button
                        type="button"
                        onClick={() => setEstimateItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEstimateItems((prev) => [
                          ...prev,
                          { type: 'PART', description: '', quantity: 1, unitPrice: 0, itemId: '' },
                        ])
                      }
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة سطر جديد
                    </button>

                    <button
                      type="submit"
                      disabled={savingEstimate}
                      className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-md shadow-brand-500/20"
                    >
                      {savingEstimate ? 'جاري الإنشاء...' : 'حفظ وإرسال عرض السعر'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Tab 5: طلبات قطع الغيار */}
          {activeTab === 5 && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">قطع الغيار المطلوبة لأمر الإصلاح</h3>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    القطع المعتمدة من العميل، حالة صرفها من المستودع واستخدامها الفعلي
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-slate-200 font-bold text-slate-500">
                    <tr>
                      <th className="p-3">الصنف</th>
                      <th className="p-3">المطلوب</th>
                      <th className="p-3">المصروف</th>
                      <th className="p-3">المستخدم</th>
                      <th className="p-3">سعر البيع</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3 text-center">إجراء الصرف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 font-medium">
                    {jobCard.parts && jobCard.parts.length > 0 ? (
                      jobCard.parts.map((p: any) => (
                        <tr key={p.id}>
                          <td className="p-3 font-bold text-slate-800">
                            <div>{p.item?.nameAr}</div>
                            <div className="text-[10px] text-slate-400 font-mono">SKU: {p.item?.sku}</div>
                          </td>
                          <td className="p-3 font-bold">{p.requestedQty}</td>
                          <td className="p-3 text-brand-700 font-bold">{p.issuedQty}</td>
                          <td className="p-3 text-emerald-700 font-bold">{p.usedQty}</td>
                          <td className="p-3 font-bold">{p.unitPrice} ر.س</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.status === 'USED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : p.status === 'ISSUED'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {p.issuedQty < p.requestedQty && (
                              <button
                                onClick={() => handleIssuePart(p.id)}
                                className="px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-xs"
                              >
                                صرف من المخزن
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400">
                          لم يتم طلب قطع غيار بعد. اعتمد عرض السعر أولاً.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 6: أجور اليد والخدمات */}
          {activeTab === 6 && (
            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-slate-900">الخدمات وأجور اليد وعمولات الفنيين</h3>
              <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-slate-200 font-bold text-slate-500">
                    <tr>
                      <th className="p-3">اسم الخدمة</th>
                      <th className="p-3">الفني المسؤول</th>
                      <th className="p-3">الساعات</th>
                      <th className="p-3">القيمة</th>
                      <th className="p-3">نسبة العمولة</th>
                      <th className="p-3">مبلغ العمولة</th>
                      <th className="p-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 font-medium">
                    {jobCard.labors && jobCard.labors.length > 0 ? (
                      jobCard.labors.map((l: any) => (
                        <tr key={l.id}>
                          <td className="p-3 font-bold text-slate-800">{l.serviceName}</td>
                          <td className="p-3 font-semibold text-slate-700">
                            {l.technician ? l.technician.name : 'فني الورشة'}
                          </td>
                          <td className="p-3 font-mono">{l.hours} ساعة</td>
                          <td className="p-3 font-bold text-slate-900">{l.total} ر.س</td>
                          <td className="p-3 font-mono">{l.commissionRate}%</td>
                          <td className="p-3 font-bold text-emerald-600">{l.commissionAmount} ر.س</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                              {l.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400">
                          لا توجد خدمات مضافة حتى الآن.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 7: القطع المصروفة */}
          {activeTab === 7 && (
            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-slate-900">سجل القطع المصروفة فعلياً من المخزن لصالة الورشة</h3>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                {jobCard.parts?.filter((p: any) => p.issuedQty > 0).length > 0 ? (
                  <div className="space-y-2">
                    {jobCard.parts
                      .filter((p: any) => p.issuedQty > 0)
                      .map((p: any) => (
                        <div
                          key={p.id}
                          className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-slate-800">{p.item?.nameAr}</div>
                            <div className="text-[11px] text-slate-400">
                              تم صرف {p.issuedQty} قطعة • تاريخ الصرف:{' '}
                              {p.issuedAt ? new Date(p.issuedAt).toLocaleString('ar-SA') : 'اليوم'}
                            </div>
                          </div>
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-lg text-xs">
                            تم الصرف والخصم
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400">
                    لم يتم صرف أي قطع للمخزن بعد في هذا الأمر.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 8: صور ومرفقات */}
          {activeTab === 8 && (
            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-slate-900">صور حالة السيارة عند الاستقبال</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="h-36 bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400">
                  <Car className="w-8 h-8 mb-1 text-slate-300" />
                  <span>مقدمة السيارة</span>
                </div>
                <div className="h-36 bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400">
                  <Car className="w-8 h-8 mb-1 text-slate-300" />
                  <span>الجانب الأيمن</span>
                </div>
                <div className="h-36 bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400">
                  <Car className="w-8 h-8 mb-1 text-slate-300" />
                  <span>خلفية السيارة</span>
                </div>
                <div className="h-36 bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400">
                  <Car className="w-8 h-8 mb-1 text-slate-300" />
                  <span>طبلون العدادات</span>
                </div>
              </div>
            </div>
          )}

          {/* Tab 9: المدفوعات والفوترة */}
          {activeTab === 9 && (
            <div className="space-y-4 text-xs max-w-xl">
              <h3 className="text-sm font-bold text-slate-900">الفوترة وسداد الحساب</h3>
              {jobCard.salesInvoice ? (
                <div className="p-5 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-900 text-sm">
                      تم إصدار الفاتورة الضريبية النهائية
                    </span>
                    <span className="font-mono font-bold bg-white px-2 py-1 rounded border border-emerald-300 text-emerald-800">
                      {jobCard.salesInvoice.invoiceNumber}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-700">
                    <div className="flex justify-between">
                      <span>إجمالي الفاتورة:</span>
                      <span className="font-bold">{jobCard.salesInvoice.grandTotal} ر.س</span>
                    </div>
                    <div className="flex justify-between">
                      <span>طريقة الدفع:</span>
                      <span className="font-bold">{jobCard.salesInvoice.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>الحالة المالية:</span>
                      <span className="font-bold text-emerald-700">{jobCard.salesInvoice.status}</span>
                    </div>
                  </div>

                  <Link
                    to={`/sales?type=MAINTENANCE`}
                    className="block text-center py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm mt-2"
                  >
                    معاينة الفاتورة في المبيعات
                  </Link>
                </div>
              ) : (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-3">
                  <p className="text-slate-600 font-medium">لم يتم إصدار فاتورة نهائية لهذا الأمر بعد.</p>
                  <button
                    onClick={() => setInvoiceModalOpen(true)}
                    className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-md shadow-brand-500/20"
                  >
                    إصدار فاتورة الصيانة النهائية الآن
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab 10: سجل العمليات (Audit Log) */}
          {activeTab === 10 && (
            <div className="space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-900">سجل التتبع والرقابة (Audit Trail) لأمر الإصلاح</h3>
              <div className="space-y-2">
                {auditLogs && auditLogs.length > 0 ? (
                  auditLogs.map((log: any) => (
                    <div
                      key={log.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-slate-800">{log.details || log.action}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          بواسطة: {log.user?.fullName || 'النظام'} •{' '}
                          {new Date(log.createdAt).toLocaleString('ar-SA')}
                        </div>
                      </div>
                      <span className="font-mono text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-600 font-bold">
                        {log.action}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-slate-400">لا توجد سجلات تتبع إضافية.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Final Invoice Modal (Section 7) */}
      {invoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">إصدار فاتورة الصيانة النهائية</h3>
              <button onClick={() => setInvoiceModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span>إجمالي قطع الغيار:</span>
                <span className="font-bold">{jobCard.totalParts} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span>إجمالي أجور اليد:</span>
                <span className="font-bold">{jobCard.totalLabor} ر.س</span>
              </div>
              <div className="flex justify-between text-brand-700 font-black text-sm pt-2 border-t border-slate-200">
                <span>الإجمالي شامل الضريبة (15%):</span>
                <span>{jobCard.grandTotal} ر.س</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">طريقة السداد:</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="CASH">نقداً (كاش)</option>
                  <option value="CARD">بطاقة شبكة / مدى</option>
                  <option value="SPLIT">تقسيم (كاش + شبكة)</option>
                  <option value="CREDIT">آجل (على حساب العميل)</option>
                </select>
              </div>

              {paymentMethod === 'SPLIT' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">المبلغ نقداً:</label>
                    <input
                      type="number"
                      value={cashPaid}
                      onChange={(e) => setCashPaid(parseFloat(e.target.value) || 0)}
                      className="w-full p-2 border border-slate-200 rounded-lg font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">المبلغ شبكة:</label>
                    <input
                      type="number"
                      value={cardPaid}
                      onChange={(e) => setCardPaid(parseFloat(e.target.value) || 0)}
                      className="w-full p-2 border border-slate-200 rounded-lg font-bold"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleGenerateInvoice}
              disabled={submittingInvoice}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 mt-2"
            >
              {submittingInvoice ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>اعتماد وإصدار الفاتورة وإغلاق أمر الإصلاح</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
