import React, { useRef, useState, useEffect } from 'react';
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
import { exportToExcel, exportToPdf } from '../../utils/exports';

const SignaturePad: React.FC<{ onChange: (value: string) => void }> = ({ onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    canvas.width = bounds.width * ratio;
    canvas.height = 160 * ratio;
    const context = canvas.getContext('2d');
    if (context) {
      context.scale(ratio, ratio);
      context.lineWidth = 2;
      context.lineCap = 'round';
      context.strokeStyle = '#0f172a';
    }
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext('2d');
    const current = point(event);
    context?.beginPath();
    context?.moveTo(current.x, current.y);
  };
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext('2d');
    const current = point(event);
    context?.lineTo(current.x, current.y);
    context?.stroke();
    setHasSignature(true);
  };
  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    if (hasSignature) onChange(event.currentTarget.toDataURL('image/png'));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange('');
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
        className="w-full h-40 rounded-xl border border-dashed border-slate-400 bg-white touch-none"
        aria-label="لوحة توقيع مستلم السيارة"
      />
      <div className="flex items-center justify-between text-xs">
        <span className={hasSignature ? 'text-emerald-700' : 'text-rose-700'}>
          {hasSignature ? 'تم تسجيل التوقيع' : 'توقيع مستلم السيارة مطلوب'}
        </span>
        <button type="button" onClick={clear} className="text-slate-600 underline">مسح التوقيع</button>
      </div>
    </div>
  );
};

export const JobCardDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [availableItems, setAvailableItems] = useState<any[]>([]);
  const [availableLaborServices, setAvailableLaborServices] = useState<{ name: string; rate: number }[]>([]);
  const [estimatePartSearch, setEstimatePartSearch] = useState<Record<number, string>>({});

  // Modals
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [cashPaid, setCashPaid] = useState<number>(0);
  const [cardPaid, setCardPaid] = useState<number>(0);
  const [finalDiscount, setFinalDiscount] = useState<number>(0);
  const [submittingInvoice, setSubmittingInvoice] = useState(false);
  const [approvalLinks, setApprovalLinks] = useState<Record<string, string>>({});
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethodForReceipt, setPaymentMethodForReceipt] = useState<'CASH' | 'CARD'>('CASH');
  const [savingPayment, setSavingPayment] = useState(false);
  const [partActionQuantities, setPartActionQuantities] = useState<Record<string, number>>({});
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, string>>({});
  const [handoverCustomerName, setHandoverCustomerName] = useState('');
  const [handoverOdometer, setHandoverOdometer] = useState(0);
  const [handoverChecklist, setHandoverChecklist] = useState({
    keysReturned: false,
    vehicleInspected: false,
    documentsReturned: false,
    customerReceived: false,
  });
  const [handoverSignature, setHandoverSignature] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState(1);
  const [warrantyTerms, setWarrantyTerms] = useState('');
  const [submittingHandover, setSubmittingHandover] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const attachmentInputRef = useRef<HTMLInputElement>(null);

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
      api.getItems().then((res) => setAvailableItems(res.data)).catch(console.error);
      api.getLaborServices()
        .then((res) => setAvailableLaborServices(res.services))
        .catch((err) => error(err.message || 'تعذر تحميل خدمات وأجور الورشة'));
    }
  }, [id]);

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!data?.jobCard) return;
    setHandoverCustomerName(data.jobCard.customer?.name || '');
    setHandoverOdometer(data.jobCard.currentOdometer || 0);
    setWarrantyMonths(data.jobCard.warrantyMonths ?? 1);
    setWarrantyTerms(data.jobCard.warrantyTerms || '');
  }, [data?.jobCard?.id, data?.jobCard?.currentOdometer]);

  useEffect(() => {
    const attachments = data?.jobCard?.attachments || [];
    let active = true;
    const urls: string[] = [];
    setAttachmentPreviews({});
    Promise.all(attachments.map(async (attachment: any) => {
      try {
        const blob = await api.getRepairAttachment(data.jobCard.id, attachment.id);
        const url = URL.createObjectURL(blob);
        urls.push(url);
        if (active) setAttachmentPreviews((current) => ({ ...current, [attachment.id]: url }));
      } catch (attachmentError) {
        console.error('Failed to load repair attachment:', attachmentError);
      }
    }));
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [data?.jobCard?.id, data?.jobCard?.attachments]);

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-sm font-medium">جاري تحميل تفاصيل أمر الإصلاح والملفات المرفقة...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm font-medium text-slate-600">تعذر تحميل أمر الإصلاح. قد يكون غير موجود أو حدث خطأ في الاتصال.</p>
        <Link to="/workshop/job-cards" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white">
          العودة إلى أوامر الإصلاح
        </Link>
      </div>
    );
  }

  const { jobCard, auditLogs } = data;
  const invoicePartsTotal = (jobCard.parts || []).reduce(
    (total: number, part: any) => total + Number(part.unitPrice || 0) * Number(part.usedQty || 0),
    0,
  );
  const invoiceLaborTotal = (jobCard.labors || []).reduce((total: number, labor: any) => total + Number(labor.total || 0), 0);
  const invoiceSubtotal = invoicePartsTotal + invoiceLaborTotal;

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

  const exportEstimate = (estimate: any, format: 'excel' | 'pdf') => {
    const headers = ['النوع', 'البيان', 'الكمية', 'سعر الوحدة', 'الإجمالي'];
    const rows = (estimate.items || []).map((item: any) => [
      item.type === 'PART' ? 'قطعة غيار' : 'أجور يد',
      item.description,
      item.quantity,
      item.unitPrice,
      item.total,
    ]);
    if (format === 'excel') {
      exportToExcel(`عرض-سعر-${estimate.estimateNumber}`, rows.map((row: unknown[]) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))));
    } else {
      exportToPdf(`عرض السعر ${estimate.estimateNumber} - ${jobCard.customer?.name || ''}`, headers, rows);
    }
  };

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
  const handleIssuePart = async (partId: string, quantity: number) => {
    try {
      await api.issuePartToWorkshop(jobCard.id, { partId, quantity });
      success('تم صرف القطعة للورشة بنجاح وخصمها من المخزون');
      await loadDetails();
    } catch (err: any) {
      error(err.message || 'فشل صرف القطعة');
    }
  };

  const handlePartAction = async (partId: string, action: 'use' | 'return', quantity: number) => {
    try {
      if (action === 'use') await api.useWorkshopPart(jobCard.id, partId, quantity);
      else await api.returnWorkshopPart(jobCard.id, partId, quantity);
      success(action === 'use' ? 'تم تسجيل استخدام القطع' : 'تم إرجاع القطع غير المستخدمة إلى المخزن');
      await loadDetails();
    } catch (err: any) {
      error(err.message || 'تعذر تحديث حركة القطعة');
    }
  };

  const handleLaborTimer = async (laborId: string, action: 'START' | 'PAUSE' | 'COMPLETE') => {
    try {
      await api.updateWorkshopLaborTimer(jobCard.id, laborId, action);
      success(action === 'START' ? 'بدأ تسجيل وقت الخدمة' : action === 'PAUSE' ? 'تم إيقاف المؤقت' : 'تم إنهاء تسجيل الوقت');
      await loadDetails();
    } catch (err: any) {
      error(err.message || 'تعذر تحديث مؤقت الخدمة');
    }
  };

  const handleCreateApprovalLink = async (estimateId: string) => {
    try {
      const result = await api.createEstimateApprovalLink(jobCard.id, estimateId);
      const url = `${window.location.origin}${result.path}`;
      setApprovalLinks((current) => ({ ...current, [estimateId]: url }));
      await navigator.clipboard.writeText(url);
      success('تم إنشاء رابط موافقة صالح لمدة 48 ساعة ونسخه');
    } catch (err: any) {
      error(err.message || 'تعذر إنشاء رابط موافقة العميل');
    }
  };

  const handleUploadAttachments = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if ((jobCard.attachments?.length || 0) + files.length > 20) {
      error('الحد الأقصى 20 صورة لأمر الإصلاح');
      return;
    }
    setUploadingAttachments(true);
    let uploaded = 0;
    try {
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
          throw new Error('استخدم صور JPG أو PNG أو WebP لا يتجاوز حجم كل منها 3 ميجابايت');
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error(`تعذرت قراءة الملف ${file.name}`));
          reader.onload = () => typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error(`تعذر تجهيز الملف ${file.name}`));
          reader.readAsDataURL(file);
        });
        await api.uploadRepairAttachment(jobCard.id, { fileName: file.name, dataUrl });
        uploaded += 1;
      }
      success(`تم رفع ${uploaded} صورة بنجاح`);
      await loadDetails();
    } catch (err: any) {
      error(uploaded ? `تم رفع ${uploaded} صورة، وتعذر إكمال الباقي: ${err.message}` : err.message || 'تعذر رفع الصور');
      if (uploaded) await loadDetails();
    } finally {
      setUploadingAttachments(false);
    }
  };

  const handleRecordPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      error('أدخل مبلغًا صحيحًا أكبر من صفر');
      return;
    }
    setSavingPayment(true);
    try {
      await api.recordRepairPayment(jobCard.id, { amount, paymentMethod: paymentMethodForReceipt });
      success('تم تسجيل الدفعة وتحديث رصيد الفاتورة');
      setPaymentAmount('');
      await loadDetails();
    } catch (err: any) {
      error(err.message || 'تعذر تسجيل الدفعة');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleRecordHandover = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmittingHandover(true);
    try {
      await api.recordRepairHandover(jobCard.id, {
        customerName: handoverCustomerName,
        deliveryOdometer: handoverOdometer,
        checklist: handoverChecklist,
        signatureData: handoverSignature,
        warrantyMonths,
        warrantyTerms,
      });
      success('تم حفظ محضر التسليم والتوقيع وإغلاق أمر الإصلاح');
      await loadDetails();
    } catch (err: any) {
      error(err.message || 'تعذر حفظ محضر التسليم');
    } finally {
      setSubmittingHandover(false);
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
                {jobCard.status === 'READY_FOR_DELIVERY' && !jobCard.salesInvoice && (
                  <button
                    onClick={() => {
                      setFinalDiscount(jobCard.discount || 0);
                      setInvoiceModalOpen(true);
                    }}
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

                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => exportEstimate(est, 'excel')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                          تنزيل Excel
                        </button>
                        <button onClick={() => exportEstimate(est, 'pdf')} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white">
                          تنزيل PDF
                        </button>
                      {/* Approval Actions */}
                      {est.status === 'PENDING' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCreateApprovalLink(est.id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs"
                          >
                            إنشاء رابط موافقة للعميل
                          </button>
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
                    </div>
                    {approvalLinks[est.id] && (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                        <a href={approvalLinks[est.id]} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-blue-800 underline">
                          {approvalLinks[est.id]}
                        </a>
                        <button
                          onClick={() => navigator.clipboard.writeText(approvalLinks[est.id]).then(
                            () => success('تم نسخ رابط الموافقة'),
                            () => error('تعذر نسخ الرابط؛ استخدم الرابط الظاهر'),
                          )}
                          className="rounded-lg bg-white px-3 py-1.5 font-bold text-blue-700"
                        >
                          نسخ الرابط
                        </button>
                        {jobCard.customer?.phone && (
                          <a
                            href={`https://wa.me/${String(jobCard.customer.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`يرجى مراجعة عرض السعر ${est.estimateNumber} والرد من الرابط: ${approvalLinks[est.id]}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white"
                          >
                            إرسال عبر WhatsApp
                          </a>
                        )}
                      </div>
                    )}

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
                              <td className="py-2 font-mono">{it.unitPrice} ج.م</td>
                              <td className="py-2 font-bold text-slate-900">{it.total} ج.م</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-3 border-t border-slate-200 flex justify-end gap-6 text-xs font-bold">
                      <div>
                        <span className="text-slate-400">إجمالي القطع: </span>
                        <span>{est.subtotalParts} ج.م</span>
                      </div>
                      <div>
                        <span className="text-slate-400">إجمالي اليد: </span>
                        <span>{est.subtotalLabor} ج.م</span>
                      </div>
                      <div>
                        <span className="text-slate-400">الضريبة: </span>
                        <span>{est.taxAmount.toFixed(2)} ج.م</span>
                      </div>
                      <div className="text-brand-700 text-sm">
                        <span>الإجمالي الكلي: </span>
                        <span>{est.grandTotal.toFixed(2)} ج.م</span>
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
                        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row">
                          <input
                            type="search"
                            value={estimatePartSearch[idx] || ''}
                            onChange={(event) => setEstimatePartSearch((current) => ({
                              ...current,
                              [idx]: event.target.value,
                            }))}
                            placeholder="ابحث عن قطعة غيار..."
                            aria-label="البحث عن قطعة غيار"
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs sm:w-48"
                          />
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
                              setEstimatePartSearch((current) => ({ ...current, [idx]: '' }));
                            }}
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          >
                            <option value="">-- اختر قطعة الغيار --</option>
                            {availableItems
                              .filter((availableItem) => {
                                const query = (estimatePartSearch[idx] || '').trim().toLocaleLowerCase();
                                if (!query || availableItem.id === item.itemId) return true;
                                return [availableItem.nameAr, availableItem.sku, availableItem.barcode]
                                  .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(query));
                              })
                              .map((availableItem) => (
                                <option key={availableItem.id} value={availableItem.id}>
                                  {availableItem.nameAr} ({availableItem.sellPrice} ج.م)
                                </option>
                              ))}
                          </select>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            list={`estimate-labor-services-${idx}`}
                            value={item.description}
                            onChange={(e) => {
                              const desc = e.target.value;
                              const selectedService = availableLaborServices.find(
                                (service) => service.name.trim().toLocaleLowerCase() === desc.trim().toLocaleLowerCase(),
                              );
                              setEstimateItems((prev) =>
                                prev.map((it, i) => (i === idx
                                  ? {
                                      ...it,
                                      description: desc,
                                      ...(selectedService ? { unitPrice: selectedService.rate } : {}),
                                    }
                                  : it))
                              );
                            }}
                            placeholder="ابحث أو اكتب اسم خدمة / أجور..."
                            aria-label="البحث عن خدمة أو أجور"
                            className="flex-1 rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          />
                          <datalist id={`estimate-labor-services-${idx}`}>
                            {availableLaborServices.map((service) => (
                              <option key={service.name} value={service.name} label={`${service.rate} ج.م`} />
                            ))}
                          </datalist>
                        </>
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
                      <th className="p-3">المرتجع</th>
                      <th className="p-3">سعر البيع</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3 text-center">الحركة</th>
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
                          <td className="p-3 text-amber-700 font-bold">{p.returnedQty}</td>
                          <td className="p-3 font-bold">{p.unitPrice} ج.م</td>
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
                            <div className="flex min-w-52 flex-wrap justify-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                max={Math.max(p.requestedQty - p.issuedQty, p.issuedQty - p.usedQty - p.returnedQty)}
                                value={partActionQuantities[p.id] ?? 1}
                                onChange={(event) => setPartActionQuantities((current) => ({
                                  ...current,
                                  [p.id]: Number(event.target.value) || 0,
                                }))}
                                className="w-16 rounded-lg border px-2 py-1 text-center"
                                aria-label={`كمية حركة ${p.item?.nameAr}`}
                              />
                              {p.issuedQty < p.requestedQty && jobCard.status !== 'CLOSED' && (
                                <button
                                  onClick={() => handleIssuePart(p.id, partActionQuantities[p.id] ?? 1)}
                                  className="rounded-lg bg-brand-600 px-2 py-1 font-bold text-white"
                                >
                                  صرف
                                </button>
                              )}
                              {p.issuedQty - p.usedQty - p.returnedQty > 0 && jobCard.status !== 'CLOSED' && (
                                <>
                                  <button
                                    onClick={() => handlePartAction(p.id, 'use', partActionQuantities[p.id] ?? 1)}
                                    className="rounded-lg bg-emerald-600 px-2 py-1 font-bold text-white"
                                  >
                                    تسجيل استخدام
                                  </button>
                                  <button
                                    onClick={() => handlePartAction(p.id, 'return', partActionQuantities[p.id] ?? 1)}
                                    className="rounded-lg bg-amber-600 px-2 py-1 font-bold text-white"
                                  >
                                    إرجاع للمخزن
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400">
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
                      <th className="p-3">الوقت الفعلي المسجل</th>
                      <th className="p-3">القيمة</th>
                      <th className="p-3">نسبة العمولة</th>
                      <th className="p-3">مبلغ العمولة</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">المؤقت</th>
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
                          <td className="p-3 font-mono">
                            {Math.floor((l.trackedMinutes + (l.timerStartedAt ? Math.max(0, Math.ceil((clockNow - new Date(l.timerStartedAt).getTime()) / 60000)) : 0)) / 60)} س
                            {' '}
                            {(l.trackedMinutes + (l.timerStartedAt ? Math.max(0, Math.ceil((clockNow - new Date(l.timerStartedAt).getTime()) / 60000)) : 0)) % 60} د
                          </td>
                          <td className="p-3 font-bold text-slate-900">{l.total} ج.م</td>
                          <td className="p-3 font-mono">{l.commissionRate}%</td>
                          <td className="p-3 font-bold text-emerald-600">{l.commissionAmount} ج.م</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                              {l.status}
                            </span>
                          </td>
                          <td className="p-3">
                            {l.timerStartedAt ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleLaborTimer(l.id, 'PAUSE')} className="rounded bg-amber-100 px-2 py-1 font-bold text-amber-800">إيقاف مؤقت</button>
                                <button onClick={() => handleLaborTimer(l.id, 'COMPLETE')} className="rounded bg-emerald-100 px-2 py-1 font-bold text-emerald-800">إنهاء</button>
                              </div>
                            ) : l.status !== 'COMPLETED' && jobCard.status !== 'CLOSED' ? (
                              <button onClick={() => handleLaborTimer(l.id, 'START')} className="rounded bg-blue-100 px-2 py-1 font-bold text-blue-800">
                                {l.trackedMinutes > 0 ? 'استئناف المؤقت' : 'بدء المؤقت'}
                              </button>
                            ) : '—'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-slate-400">
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">صور ومرفقات السيارة</h3>
                  <p className="mt-1 text-slate-500">الحد الأقصى 20 صورة، JPG أو PNG أو WebP، حتى 3 ميجابايت للصورة.</p>
                </div>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  multiple
                  onChange={handleUploadAttachments}
                  className="hidden"
                  aria-label="رفع صور السيارة"
                />
                <button
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={uploadingAttachments || (jobCard.attachments?.length || 0) >= 20}
                  className="rounded-xl bg-brand-600 px-4 py-2 font-bold text-white disabled:opacity-50"
                >
                  {uploadingAttachments ? 'جارٍ رفع الصور...' : 'إضافة صور من الجهاز أو الكاميرا'}
                </button>
              </div>
              {jobCard.attachments?.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {jobCard.attachments.map((attachment: any) => (
                    <figure key={attachment.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {attachmentPreviews[attachment.id] ? (
                        <a href={attachmentPreviews[attachment.id]} target="_blank" rel="noreferrer">
                          <img src={attachmentPreviews[attachment.id]} alt={attachment.fileName} className="h-40 w-full object-cover" />
                        </a>
                      ) : (
                        <div className="flex h-40 items-center justify-center text-slate-400">تحميل الصورة…</div>
                      )}
                      <figcaption className="truncate p-2 text-slate-600" title={attachment.fileName}>
                        {attachment.fileName} · {(attachment.byteSize / 1024).toFixed(0)} ك.ب
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-dashed border-slate-300 py-10 text-center text-slate-400">
                  لم تُرفق صور لهذه السيارة بعد.
                </div>
              )}
              <p className="text-[11px] text-slate-500">تُحفظ الصور على وحدة التخزين الدائمة الخاصة بالنظام، والوصول إليها يتطلب تسجيل الدخول.</p>
              <Car className="hidden" />
              <div className="sr-only">{jobCard.vehicle?.plateNumber}</div>
              </div>
          )}

          {/* Tab 9: المدفوعات والفوترة */}
          {activeTab === 9 && (
            <div className="space-y-5 text-xs max-w-3xl">
              <h3 className="text-sm font-bold text-slate-900">الفوترة وسداد الحساب</h3>
              {jobCard.salesInvoice ? (
                <>
                  <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900 text-sm">فاتورة الصيانة النهائية</span>
                      <span className="rounded border border-emerald-300 bg-white px-2 py-1 font-mono font-bold text-emerald-800">
                        {jobCard.salesInvoice.invoiceNumber}
                      </span>
                    </div>
                    <div className="space-y-1 text-slate-700">
                      <div className="flex justify-between"><span>إجمالي الفاتورة:</span><b>{jobCard.salesInvoice.grandTotal.toLocaleString()} ج.م</b></div>
                      <div className="flex justify-between"><span>المسدد:</span><b>{jobCard.salesInvoice.paidAmount.toLocaleString()} ج.م</b></div>
                      <div className="flex justify-between"><span>المتبقي:</span><b className="text-rose-700">{jobCard.salesInvoice.remainingAmount.toLocaleString()} ج.م</b></div>
                      <div className="flex justify-between"><span>الحالة المالية:</span><b>{jobCard.salesInvoice.status}</b></div>
                    </div>
                    <Link to="/sales?type=MAINTENANCE" className="block rounded-xl bg-emerald-600 py-2.5 text-center font-bold text-white">
                      معاينة الفاتورة في المبيعات
                    </Link>
                  </div>

                  <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                    <h4 className="font-bold text-slate-900">سجل دفعات الفاتورة</h4>
                    {jobCard.salesInvoice.payments?.length ? (
                      <div className="divide-y rounded-xl border">
                        {jobCard.salesInvoice.payments.map((payment: any) => (
                          <div key={payment.id} className="flex justify-between gap-3 p-3">
                            <span>{new Date(payment.createdAt).toLocaleString('ar-EG')} · {payment.paymentMethod === 'CASH' ? 'نقدي' : 'بطاقة'}</span>
                            <b>{payment.amount.toLocaleString()} ج.م</b>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500">لا توجد تفاصيل دفعات محفوظة لهذه الفاتورة.</p>
                    )}
                    {jobCard.salesInvoice.remainingAmount > 0 && (
                      <form onSubmit={handleRecordPayment} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                        <label className="font-bold text-slate-700">
                          مبلغ التحصيل
                          <input
                            type="number"
                            min="0.01"
                            max={jobCard.salesInvoice.remainingAmount}
                            step="0.01"
                            required
                            value={paymentAmount}
                            onChange={(event) => setPaymentAmount(event.target.value)}
                            className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                          />
                        </label>
                        <label className="font-bold text-slate-700">
                          طريقة الدفع
                          <select
                            value={paymentMethodForReceipt}
                            onChange={(event) => setPaymentMethodForReceipt(event.target.value as 'CASH' | 'CARD')}
                            className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                          >
                            <option value="CASH">نقدي</option>
                            <option value="CARD">بطاقة</option>
                          </select>
                        </label>
                        <button disabled={savingPayment} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
                          {savingPayment ? 'جارٍ التسجيل…' : 'تسجيل دفعة'}
                        </button>
                      </form>
                    )}
                  </section>

                  {jobCard.status === 'READY_FOR_DELIVERY' && (
                    <form onSubmit={handleRecordHandover} className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50/40 p-5">
                      <div>
                        <h4 className="font-bold text-slate-900">محضر تسليم السيارة</h4>
                        <p className="mt-1 text-slate-500">إغلاق أمر الإصلاح يتطلب تأكيد الاستلام وتوقيع العميل.</p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="font-bold text-slate-700">
                          اسم مستلم السيارة
                          <input required maxLength={120} value={handoverCustomerName} onChange={(event) => setHandoverCustomerName(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
                        </label>
                        <label className="font-bold text-slate-700">
                          قراءة العداد عند التسليم
                          <input type="number" min={jobCard.currentOdometer} step="1" required value={handoverOdometer} onChange={(event) => setHandoverOdometer(Number(event.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
                        </label>
                        <label className="font-bold text-slate-700">
                          مدة ضمان الصيانة (بالأشهر)
                          <input type="number" min="0" max="36" step="1" required value={warrantyMonths} onChange={(event) => setWarrantyMonths(Number(event.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
                        </label>
                        <label className="font-bold text-slate-700">
                          شروط الضمان
                          <input maxLength={1200} value={warrantyTerms} onChange={(event) => setWarrantyTerms(event.target.value)} placeholder="مثال: ضمان على أجور العمل فقط" className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
                        </label>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {[
                          ['keysReturned', 'تم تسليم المفاتيح'],
                          ['vehicleInspected', 'تم فحص السيارة مع العميل'],
                          ['documentsReturned', 'تم إعادة مستندات ومقتنيات العميل'],
                          ['customerReceived', 'أكد العميل استلام السيارة'],
                        ].map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2 rounded-xl border bg-white p-3">
                            <input
                              type="checkbox"
                              checked={handoverChecklist[key as keyof typeof handoverChecklist]}
                              onChange={(event) => setHandoverChecklist((current) => ({ ...current, [key]: event.target.checked }))}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      <div>
                        <p className="mb-2 font-bold text-slate-700">توقيع مستلم السيارة</p>
                        <SignaturePad onChange={setHandoverSignature} />
                      </div>
                      <button
                        type="submit"
                        disabled={submittingHandover || !handoverSignature || !Object.values(handoverChecklist).every(Boolean)}
                        className="w-full rounded-xl bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-50"
                      >
                        {submittingHandover ? 'جارٍ حفظ محضر التسليم…' : 'تأكيد التسليم والتوقيع وإغلاق الأمر'}
                      </button>
                    </form>
                  )}

                  {jobCard.status === 'CLOSED' && (
                    <section className="space-y-3 rounded-2xl border border-emerald-200 bg-white p-5">
                      <div className="flex flex-wrap justify-between gap-2">
                        <h4 className="font-bold text-emerald-800">تم تسليم السيارة وإغلاق الأمر</h4>
                        <span>{jobCard.deliveredAt ? new Date(jobCard.deliveredAt).toLocaleString('ar-EG') : ''}</span>
                      </div>
                      <p>استلمها: <b>{jobCard.handoverCustomerName || '—'}</b> · العداد: <b>{jobCard.deliveryOdometer ?? '—'} كم</b></p>
                      <p>الضمان: <b>{jobCard.warrantyMonths} شهر</b> {jobCard.warrantyTerms || ''}</p>
                      {jobCard.handoverSignatureData && <img src={jobCard.handoverSignatureData} alt="توقيع مستلم السيارة" className="h-28 max-w-sm rounded-xl border bg-white object-contain p-2" />}
                      <button onClick={() => window.print()} className="rounded-xl border px-4 py-2 font-bold">طباعة محضر التسليم</button>
                    </section>
                  )}
                </>
              ) : (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-3">
                  <p className="text-slate-600 font-medium">لم يتم إصدار فاتورة نهائية لهذا الأمر بعد.</p>
                  <button
                    onClick={() => {
                      setFinalDiscount(jobCard.discount || 0);
                      setInvoiceModalOpen(true);
                    }}
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
                <span>قيمة القطع المستخدمة:</span>
                <span className="font-bold">{invoicePartsTotal.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span>إجمالي أجور اليد:</span>
                <span className="font-bold">{invoiceLaborTotal.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-brand-700 font-black text-sm pt-2 border-t border-slate-200">
                <span>الإجمالي قبل الخصم والضريبة:</span>
                <span>{invoiceSubtotal.toLocaleString()} ج.م</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-bold text-slate-700">
                الخصم على الفاتورة
                <input
                  type="number"
                  min="0"
                  max={invoiceSubtotal}
                  step="0.01"
                  value={finalDiscount}
                  onChange={(event) => setFinalDiscount(Number(event.target.value) || 0)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-normal"
                />
              </label>
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
                      min="0"
                      step="0.01"
                      value={cashPaid}
                      onChange={(e) => setCashPaid(Number(e.target.value) || 0)}
                      className="w-full p-2 border border-slate-200 rounded-lg font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">المبلغ شبكة:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cardPaid}
                      onChange={(e) => setCardPaid(Number(e.target.value) || 0)}
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
