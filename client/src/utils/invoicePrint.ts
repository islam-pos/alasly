import { getPaperSizeCss, parsePrintSettings, type PrintSettings } from './printSettings';

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);

const formatMoney = (value: unknown, currency: string) =>
  `${Number(value || 0).toLocaleString()} ${escapeHtml(currency)}`;

const paymentMethodName = (method: string) => {
  if (method === 'CASH') return 'نقدي';
  if (method === 'CARD') return 'بطاقة';
  if (method === 'BANK_TRANSFER') return 'تحويل بنكي';
  return method || '-';
};

export const printSalesInvoice = (
  invoice: any,
  company: any,
  printSettingsValue: unknown,
): 'opened' | 'blocked' => {
  const settings: PrintSettings = parsePrintSettings(printSettingsValue);
  const fields = settings.invoiceFields;
  const currency = company?.currencySymbol || 'ج.م';
  const invoiceItems = Array.isArray(invoice.items) ? invoice.items : [];
  const isQuotation = invoice.invoiceType === 'QUOTATION';
  const documentLabel = isQuotation ? 'عرض سعر' : 'فاتورة';

  const columns = [
    { key: 'itemCode', title: 'الكود', render: (item: any) => item.item?.sku || item.item?.barcode || '-' },
    { key: 'quantity', title: 'الكمية', render: (item: any) => item.quantity ?? 1 },
    { key: 'unitPrice', title: 'سعر الوحدة', render: (item: any) => formatMoney(item.unitPrice, currency) },
    { key: 'lineTotal', title: 'الإجمالي', render: (item: any) => formatMoney(item.total ?? item.subtotal, currency) },
  ].filter((column) => fields[column.key as keyof typeof fields]);

  const itemRows = invoiceItems.map((item: any) => `
    <tr>
      <td>${escapeHtml(item.description || item.item?.nameAr || item.item?.name || 'صنف')}</td>
      ${columns.map((column) => `<td>${escapeHtml(column.render(item))}</td>`).join('')}
    </tr>`).join('');

  const companyDetails = [
    fields.companyAddress && company?.address,
    fields.companyPhone && company?.phone,
    fields.companyTaxNumber && company?.taxNumber ? `الرقم الضريبي: ${company.taxNumber}` : '',
    fields.commercialRegister && company?.commercialRegister ? `السجل التجاري: ${company.commercialRegister}` : '',
  ].filter(Boolean).map((detail) => `<div>${escapeHtml(detail)}</div>`).join('');

  const customerDetails = [
    fields.customerName && `العميل: ${invoice.customer?.name || 'عميل نقدي'}`,
    fields.customerPhone && invoice.customer?.phone ? `الهاتف: ${invoice.customer.phone}` : '',
    fields.customerTaxNumber && invoice.customer?.taxNumber ? `الرقم الضريبي: ${invoice.customer.taxNumber}` : '',
    fields.vehicleDetails && invoice.vehicle
      ? `المركبة: ${[invoice.vehicle.make, invoice.vehicle.model, invoice.vehicle.plateNumber].filter(Boolean).join(' - ')}`
      : '',
    !isQuotation && fields.paymentMethod && `طريقة الدفع: ${paymentMethodName(invoice.paymentMethod)}`,
  ].filter(Boolean).map((detail) => `<div>${escapeHtml(detail)}</div>`).join('');

  const totals = [
    fields.subtotal && `<div><span>المجموع الفرعي</span><strong>${formatMoney(invoice.subtotal, currency)}</strong></div>`,
    fields.discount && Number(invoice.discountAmount) > 0
      ? `<div><span>الخصم</span><strong>-${formatMoney(invoice.discountAmount, currency)}</strong></div>`
      : '',
    fields.grandTotal && `<div class="grand-total"><span>الإجمالي النهائي</span><strong>${formatMoney(invoice.grandTotal ?? invoice.totalAmount, currency)}</strong></div>`,
  ].filter(Boolean).join('');

  const paperSize = getPaperSizeCss(settings.documents.paperSize);
  const thermal = settings.documents.printerType === 'THERMAL';
  const printWindow = window.open('', '_blank');
  if (!printWindow) return 'blocked';

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>${documentLabel} ${escapeHtml(invoice.invoiceNumber)}</title>
        <style>
          @page { size: ${paperSize}; margin: ${thermal ? '4mm' : '12mm'}; }
          * { box-sizing: border-box; }
          body { color: #111827; font: ${thermal ? '11px' : '13px'} Arial, sans-serif; margin: 0 auto; max-width: ${settings.documents.paperSize === 'THERMAL_58' ? '52mm' : settings.documents.paperSize === 'THERMAL_80' ? '74mm' : '100%'}; }
          header { border-bottom: 1px solid #9ca3af; margin-bottom: 12px; padding-bottom: 10px; }
          h1 { font-size: ${thermal ? '16px' : '21px'}; margin: 0 0 6px; }
          .meta, .details { display: grid; gap: 4px; margin-bottom: 12px; }
          .details { border: 1px solid #d1d5db; padding: 8px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border-bottom: 1px solid #d1d5db; padding: ${thermal ? '5px 2px' : '8px 5px'}; text-align: right; }
          th { background: #f3f4f6; }
          .totals { margin: 12px 0 0 auto; max-width: 100%; }
          .totals div { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
          .grand-total { border-top: 1px solid #374151; font-size: 1.15em; font-weight: bold; margin-top: 5px; padding-top: 7px !important; }
          footer { border-top: 1px solid #d1d5db; margin-top: 18px; padding-top: 8px; text-align: center; }
          @media print { body { max-width: ${settings.documents.paperSize === 'THERMAL_58' ? '52mm' : settings.documents.paperSize === 'THERMAL_80' ? '74mm' : '100%'}; } }
        </style>
      </head>
      <body>
        <header>
          ${settings.showCompanyName && company?.name ? `<h1>${escapeHtml(company.name)}</h1>` : ''}
          ${company?.invoiceHeader ? `<div>${escapeHtml(company.invoiceHeader)}</div>` : ''}
          ${companyDetails}
          <div class="meta"><strong>${documentLabel} رقم: ${escapeHtml(invoice.invoiceNumber)}</strong>
            ${fields.invoiceDate ? `<span>التاريخ: ${escapeHtml(new Date(invoice.date || invoice.createdAt || Date.now()).toLocaleString('ar-EG'))}</span>` : ''}
          </div>
        </header>
        ${customerDetails ? `<section class="details">${customerDetails}</section>` : ''}
        <table>
          <thead><tr><th>الصنف / البيان</th>${columns.map((column) => `<th>${column.title}</th>`).join('')}</tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <section class="totals">${totals}</section>
        ${fields.footer && company?.invoiceFooter ? `<footer>${escapeHtml(company.invoiceFooter)}</footer>` : ''}
        ${company?.termsAndConditions ? `<footer>${escapeHtml(company.termsAndConditions)}</footer>` : ''}
        <script>window.addEventListener('load', () => setTimeout(() => window.print(), 200));</script>
      </body>
    </html>`);
  printWindow.document.close();
  return 'opened';
};
