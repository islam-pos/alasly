import React from 'react';
import { Printer, X, CheckCircle, Car, Calendar, Phone, MapPin } from 'lucide-react';

interface PrintModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const PrintModal: React.FC<PrintModalProps> = ({ title, isOpen, onClose, children }) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header toolbar (Hidden during print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white no-print">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-lg">{title} - معاينة الطباعة</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md transition-all active:scale-95"
            >
              <Printer className="w-4 h-4" />
              طباعة الآن
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Printable Canvas */}
        <div className="p-8 overflow-y-auto bg-white flex-1 text-slate-900" id="printable-document">
          {children}
        </div>
      </div>
    </div>
  );
};

// 1. Tax Invoice Template (ZATCA style)
export const TaxInvoicePrint: React.FC<{ invoice: any; company?: any }> = ({ invoice, company }) => {
  const comp = company || {
    name: 'مركز المحترف لصيانة السيارات وقطع الغيار',
    taxNumber: '301234567800003',
    address: 'جمهورية مصر العربية - القاهرة',
    phone: '0551234567',
    crNumber: '1010897654'
  };

  const isWorkshop = !!invoice.repairOrder;

  return (
    <div className="font-sans max-w-3xl mx-auto p-4 border border-slate-300 rounded-xl">
      {/* Header */}
      <div className="flex items-start justify-between border-b pb-4 mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">{comp.name}</h1>
          <p className="text-xs text-slate-600 mt-1">{comp.address}</p>
          <p className="text-xs text-slate-600">هاتف: {comp.phone} | س.ت: {comp.crNumber}</p>
          <div className="mt-2 inline-block bg-blue-50 border border-blue-200 text-blue-800 font-bold px-3 py-1 rounded text-xs">
            الرقم الضريبي: {comp.taxNumber}
          </div>
        </div>
        <div className="text-left">
          <span className="inline-block bg-slate-900 text-white text-xs font-bold px-3 py-1 rounded uppercase tracking-wider mb-2">
            فاتورة ضريبية مبسطة
          </span>
          <div className="text-sm font-bold text-slate-800">رقم الفاتورة: {invoice.invoiceNumber}</div>
          <div className="text-xs text-slate-500 mt-1">التاريخ: {new Date(invoice.createdAt).toLocaleDateString('ar-SA')}</div>
          <div className="text-xs text-slate-500">طريقة الدفع: {invoice.paymentMethod === 'CASH' ? 'نقدي' : invoice.paymentMethod === 'CARD' ? 'بطاقة مدى/ائتمان' : 'تحويل بنكي / آجل'}</div>
        </div>
      </div>

      {/* Customer & Vehicle Meta */}
      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs mb-4">
        <div>
          <span className="font-bold text-slate-700 block mb-1">بيانات العميل:</span>
          <div>الاسم: <span className="font-semibold">{invoice.customer?.name || 'عميل نقدي'}</span></div>
          {invoice.customer?.phone && <div>الهاتف: {invoice.customer.phone}</div>}
          {invoice.customer?.taxNumber && <div>الرقم الضريبي للعميل: {invoice.customer.taxNumber}</div>}
        </div>
        {invoice.vehicle && (
          <div>
            <span className="font-bold text-slate-700 block mb-1">بيانات المركبة:</span>
            <div>السيارة: <span className="font-semibold">{invoice.vehicle.make} {invoice.vehicle.model} ({invoice.vehicle.year})</span></div>
            <div>رقم اللوحة: <span className="font-mono font-bold bg-white px-1.5 py-0.5 border rounded">{invoice.vehicle.plateNumber}</span></div>
            {invoice.vehicle.vin && <div className="text-[10px] text-slate-500">الهيكل: {invoice.vehicle.vin}</div>}
          </div>
        )}
      </div>

      {/* Items / Services Table */}
      <table className="w-full text-xs text-right border-collapse mb-4">
        <thead>
          <tr className="bg-slate-100 border-y border-slate-300 text-slate-700">
            <th className="py-2 px-3">#</th>
            <th className="py-2 px-3">البيان / الصنف / الخدمة</th>
            <th className="py-2 px-3 text-center">الكمية</th>
            <th className="py-2 px-3 text-left">سعر الوحدة</th>
            <th className="py-2 px-3 text-left">الإجمالي قبل الضريبة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {invoice.items?.map((item: any, idx: number) => (
            <tr key={idx}>
              <td className="py-2 px-3 font-mono text-slate-500">{idx + 1}</td>
              <td className="py-2 px-3 font-medium">
                {item.item?.name || item.description}
                {item.item?.partNumber && <span className="text-[10px] text-slate-500 mr-2 font-mono">({item.item.partNumber})</span>}
              </td>
              <td className="py-2 px-3 text-center font-mono">{item.quantity}</td>
              <td className="py-2 px-3 text-left font-mono">{(item.unitPrice || 0).toLocaleString()} ج.م</td>
              <td className="py-2 px-3 text-left font-mono font-bold">{(item.subtotal || 0).toLocaleString()} ج.م</td>
            </tr>
          ))}
          {/* Workshop parts and labor if repairOrder format */}
          {invoice.repairOrder?.parts?.map((p: any, idx: number) => (
            <tr key={`p-${idx}`}>
              <td className="py-2 px-3 font-mono text-slate-500">ق-{idx + 1}</td>
              <td className="py-2 px-3 font-medium">
                [قطعة غيار] {p.item?.name}
                <span className="text-[10px] text-slate-500 mr-2 font-mono">({p.item?.partNumber})</span>
              </td>
              <td className="py-2 px-3 text-center font-mono">{p.quantity}</td>
              <td className="py-2 px-3 text-left font-mono">{p.unitPrice?.toLocaleString()} ج.م</td>
              <td className="py-2 px-3 text-left font-mono font-bold">{p.totalPrice?.toLocaleString()} ج.م</td>
            </tr>
          ))}
          {invoice.repairOrder?.labors?.map((l: any, idx: number) => (
            <tr key={`l-${idx}`}>
              <td className="py-2 px-3 font-mono text-slate-500">أج-{idx + 1}</td>
              <td className="py-2 px-3 font-medium">
                [أجور فحص وتركيب] {l.description}
                {l.technician && <span className="text-[10px] text-blue-600 mr-2">({l.technician.name})</span>}
              </td>
              <td className="py-2 px-3 text-center font-mono">{l.hours || 1}</td>
              <td className="py-2 px-3 text-left font-mono">{l.cost?.toLocaleString()} ج.م</td>
              <td className="py-2 px-3 text-left font-mono font-bold">{l.cost?.toLocaleString()} ج.م</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals Breakdown */}
      <div className="flex justify-between items-end border-t pt-4">
        {/* ZATCA QR Code Placeholder */}
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <div className="w-20 h-20 bg-slate-900 text-white flex flex-col items-center justify-center p-1 rounded font-mono text-[9px] text-center leading-tight">
            <span>[ QR CODE ]</span>
            <span>فاتورة ضريبية</span>
            <span>معتمدة</span>
          </div>
          <div className="text-[11px] text-slate-500 space-y-0.5">
            <p className="font-semibold text-slate-700">ختم الفاتورة الإلكترونية</p>
            <p>الامتثال لهيئة الزكاة والضريبة والجمارك</p>
            <p className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> تم التحقق بنجاح
            </p>
          </div>
        </div>

        <div className="w-64 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>المجموع الفرعي الخاضع للضريبة:</span>
            <span className="font-mono font-semibold">{(invoice.subtotal || 0).toLocaleString()} ج.م</span>
          </div>
          {Number(invoice.discountAmount) > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>الخصم الممنوح:</span>
              <span className="font-mono font-semibold">-{(invoice.discountAmount || 0).toLocaleString()} ج.م</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>ضريبة القيمة المضافة (15%):</span>
            <span className="font-mono font-semibold">{(invoice.taxAmount || 0).toLocaleString()} ج.م</span>
          </div>
          <div className="flex justify-between text-sm font-black border-t border-slate-300 pt-2 text-slate-900">
            <span>المبلغ الصافي المستحق:</span>
            <span className="font-mono text-blue-700 text-base">{(invoice.totalAmount || 0).toLocaleString()} ج.م</span>
          </div>
        </div>
      </div>

      {/* Footer policy */}
      <div className="mt-8 pt-4 border-t text-[10px] text-slate-500 text-center">
        <p>القطع الكهربائية والإلكترونية غير قابلة للاسترجاع بعد فتح الغلاف الأصلي. ضمان شغل اليد 30 يوماً من تاريخ الفاتورة.</p>
        <p className="mt-1 font-semibold text-slate-700">شكراً لثقتكم بمركز المحترف لصيانة السيارات وقطع الغيار</p>
      </div>
    </div>
  );
};

// 2. Cash Voucher Template
export const CashVoucherPrint: React.FC<{ voucher: any; company?: any }> = ({ voucher, company }) => {
  const isReceipt = voucher.type === 'RECEIPT';

  return (
    <div className="font-sans max-w-2xl mx-auto p-6 border-2 border-dashed border-slate-300 rounded-2xl bg-white">
      <div className="flex justify-between items-center border-b pb-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">مركز المحترف لصيانة السيارات</h2>
          <p className="text-xs text-slate-500">إدارة الحسابات والخزينة العامة</p>
        </div>
        <div className="text-left">
          <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${isReceipt ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
            {isReceipt ? 'سند قبض مالي' : 'سند صرف مالي'}
          </span>
          <div className="text-xs font-mono font-bold mt-1">رقم السند: {voucher.voucherNumber || voucher.id?.slice(0, 8)}</div>
          <div className="text-[11px] text-slate-500">التاريخ: {new Date(voucher.date || voucher.createdAt).toLocaleDateString('ar-SA')}</div>
        </div>
      </div>

      <div className="space-y-4 text-xs">
        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border">
          <span className="text-slate-600">{isReceipt ? 'استلمنا من السيد / السادة:' : 'اصرفوا إلى السيد / السادة:'}</span>
          <span className="font-bold text-sm text-slate-900">{voucher.partyName || voucher.customer?.name || voucher.supplier?.name || 'نقدًا'}</span>
        </div>

        <div className="flex items-center justify-between bg-blue-50/60 p-3 rounded-lg border border-blue-200">
          <span className="text-slate-700">المبلغ بالأرقام:</span>
          <span className="font-mono text-lg font-black text-blue-900">{Number(voucher.amount).toLocaleString()} ج.م</span>
        </div>

        <div className="bg-slate-50 p-3 rounded-lg border">
          <span className="text-slate-600 block mb-1">وذلك لقاء:</span>
          <p className="font-medium text-slate-800">{voucher.description || voucher.reason || 'تسوية حساب وخدمات'}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-slate-600 pt-2">
          <div>طريقة الدفع: <span className="font-bold text-slate-800">{voucher.paymentMethod === 'CASH' ? 'نقداً من الصندوق' : 'تحويل / بنك'}</span></div>
          <div>الخزينة / الحساب: <span className="font-bold text-slate-800">{voucher.cashbox?.name || 'الخزينة الرئيسية'}</span></div>
        </div>

        <div className="grid grid-cols-2 gap-8 pt-8 border-t mt-6 text-center text-xs">
          <div>
            <p className="text-slate-500 mb-8">توقيع المستلم:</p>
            <div className="border-b border-slate-300 w-36 mx-auto"></div>
          </div>
          <div>
            <p className="text-slate-500 mb-8">توقيع أمين الصندوق / المدير:</p>
            <div className="border-b border-slate-300 w-36 mx-auto"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
