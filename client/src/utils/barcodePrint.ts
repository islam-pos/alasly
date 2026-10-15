import JsBarcode from 'jsbarcode';
import { getPaperSizeCss, labelPaperSizes, parsePrintSettings } from './printSettings';

export interface BarcodeLabelItem {
  nameAr: string;
  sku: string;
  barcode?: string | null;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);

export const printBarcodeLabels = (
  items: BarcodeLabelItem[],
  companyName?: string,
  printSettingsValue?: unknown,
): 'opened' | 'blocked' | 'empty' => {
  if (items.length === 0) return 'empty';
  const cachedCompany = localStorage.getItem('alasly-print-company');
  const cachedCompanyName = companyName || (cachedCompany ? JSON.parse(cachedCompany).name : '');
  const settings = parsePrintSettings(
    printSettingsValue ?? localStorage.getItem('alasly-print-settings'),
  );

  const labels = items.map((item) => {
    const value = item.barcode?.trim() || item.sku.trim();
    if (!value) throw new Error(`لا يوجد باركود أو كود للصنف ${item.nameAr}`);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, value, {
      format: 'CODE128',
      width: 1.6,
      height: 38,
      displayValue: true,
      font: 'Arial',
      fontSize: 10,
      margin: 2,
    });

    return `<article class="label">${settings.showCompanyName && cachedCompanyName ? `<b class="company">${escapeHtml(cachedCompanyName)}</b>` : ''}<strong>${escapeHtml(item.nameAr)}</strong>${svg.outerHTML}<small>SKU: ${escapeHtml(item.sku)}</small></article>`;
  }).join('');
  const barcodeSettings = settings.barcode;
  const isThermalPaper = barcodeSettings.paperSize.startsWith('THERMAL');
  const labelSize = labelPaperSizes.find(({ value }) => value === barcodeSettings.paperSize);
  const isLabelPaper = Boolean(labelSize);
  const isThermalPrinter = barcodeSettings.printerType !== 'STANDARD';
  const pageSize = isThermalPaper
    ? barcodeSettings.paperSize === 'THERMAL_58' ? '58mm 33mm' : '80mm 38mm'
    : getPaperSizeCss(barcodeSettings.paperSize);
  const pageMargin = isLabelPaper ? '0' : isThermalPaper || isThermalPrinter ? '3mm' : '10mm';
  const labelHeight = labelSize?.height || (barcodeSettings.paperSize === 'THERMAL_58' ? 25 : 30);
  const barcodeHeight = isLabelPaper
    ? Math.max(10, Math.min(24, labelHeight * 0.48))
    : isThermalPaper ? 12 : 15;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return 'blocked';

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>ملصقات باركود الأصناف</title>
        <style>
          @page { size: ${pageSize}; margin: ${pageMargin}; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #111827; font-family: Arial, sans-serif; }
          main { display: block; }
          .label { width: 100%; height: ${labelHeight}mm; padding: ${isLabelPaper ? '1mm' : '2mm'}; border: 1px dashed #9ca3af; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; text-align: center; break-inside: avoid; break-after: page; page-break-after: always; }
          .label:last-child { break-after: auto; page-break-after: auto; }
          .company { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 7pt; }
          .label strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9pt; }
          .label svg { display: block; max-width: 100%; height: ${barcodeHeight}mm; }
          .label small { font-size: 7pt; direction: ltr; }
          @media screen { body { padding: ${isLabelPaper || isThermalPaper ? '0' : '10mm'}; } .label { background: #fff; } }
          @media print { .label { border-color: #d1d5db; } }
        </style>
      </head>
      <body><main>${labels}</main><script>window.addEventListener('load', () => setTimeout(() => window.print(), 200));</script></body>
    </html>`);
  printWindow.document.close();
  return 'opened';
};
