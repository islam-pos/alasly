import React, { useMemo, useState } from 'react';
import { Barcode, Printer, X } from 'lucide-react';
import type { BarcodeLabelItem } from '../../utils/barcodePrint';

interface BarcodePrintDialogProps {
  items: BarcodeLabelItem[];
  onClose: () => void;
  onPrint: (items: BarcodeLabelItem[]) => boolean;
}

export const BarcodePrintDialog: React.FC<BarcodePrintDialogProps> = ({ items, onClose, onPrint }) => {
  const [quantities, setQuantities] = useState(() => items.map(() => '1'));
  const [validationError, setValidationError] = useState('');
  const totalLabels = useMemo(
    () => quantities.reduce((total, value) => total + (Number(value) || 0), 0),
    [quantities],
  );
  const visibleError = validationError
    || (totalLabels > 1000 ? 'إجمالي الطباعة لا يمكن أن يتجاوز 1000 ملصق في المرة الواحدة' : '');

  const handlePrint = () => {
    const parsedQuantities = quantities.map((value) => Number(value));
    if (parsedQuantities.some((quantity) => !Number.isInteger(quantity) || quantity < 0 || quantity > 1000)) {
      setValidationError('أدخل عددًا صحيحًا من 0 إلى 1000 لكل صنف');
      return;
    }
    if (totalLabels < 1) {
      setValidationError('حدد ملصقًا واحدًا على الأقل للطباعة');
      return;
    }
    if (totalLabels > 1000) {
      setValidationError('إجمالي الطباعة لا يمكن أن يتجاوز 1000 ملصق في المرة الواحدة');
      return;
    }

    const labels = items.flatMap((item, index) =>
      Array.from({ length: parsedQuantities[index] }, () => item),
    );
    if (onPrint(labels)) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-print-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b pb-4">
          <div>
            <h2 id="barcode-print-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Barcode className="h-5 w-5 text-blue-700" />
              تحديد عدد الملصقات لكل صنف
            </h2>
            <p className="mt-1 text-xs text-slate-500">يمكنك وضع صفر للأصناف التي لا تريد طباعتها.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-4 overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2.5">الصنف</th>
                <th className="px-3 py-2.5">كود الصنف</th>
                <th className="w-36 px-3 py-2.5 text-center">عدد الملصقات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, index) => (
                <tr key={`${item.sku}-${index}`}>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{item.nameAr}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{item.sku}</td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      step="1"
                      inputMode="numeric"
                      aria-label={`عدد ملصقات ${item.nameAr}`}
                      value={quantities[index]}
                      onChange={(event) => {
                        setValidationError('');
                        setQuantities((current) => current.map((value, currentIndex) =>
                          currentIndex === index ? event.target.value : value,
                        ));
                      }}
                      className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-center font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div>
            <p className="text-sm font-bold text-slate-700">إجمالي الملصقات: {totalLabels || 0}</p>
            {visibleError && <p role="alert" className="mt-1 text-xs font-semibold text-rose-600">{visibleError}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              إلغاء
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!items.length || totalLabels < 1 || totalLabels > 1000}
              className="flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              طباعة الملصقات
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
