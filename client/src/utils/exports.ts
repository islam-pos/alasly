import { getPaperSizeCss, parsePrintSettings } from './printSettings';

export type ExportRow = Record<string, string | number | boolean | null | undefined>;

export const exportToExcel = (filename: string, rows: ExportRow[]) => {
  const columns = Object.keys(rows[0] || {});
  const xmlValue = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const cellXml = (value: unknown) => {
    const type = typeof value === 'number' && Number.isFinite(value)
      ? 'Number'
      : typeof value === 'boolean'
        ? 'Boolean'
        : 'String';
    const cellValue = typeof value === 'boolean' ? Number(value) : value;
    return `<Cell><Data ss:Type="${type}">${xmlValue(cellValue)}</Data></Cell>`;
  };
  const rowXml = (values: unknown[]) => `<Row>${values.map(cellXml).join('')}</Row>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <Worksheet ss:Name="التقرير"><Table>
        ${rowXml(columns)}
        ${rows.map((row) => rowXml(columns.map((column) => row[column]))).join('')}
      </Table></Worksheet>
    </Workbook>`;
  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const exportToPdf = (title: string, headers: string[], rows: unknown[][]) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('يرجى السماح بالنوافذ المنبثقة لتنزيل التقرير بصيغة PDF');
  }

  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const bodyHtml = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  const printSettings = parsePrintSettings(localStorage.getItem('alasly-print-settings'));
  const companyData = localStorage.getItem('alasly-print-company');
  const companyName = printSettings.showCompanyName && companyData
    ? escapeHtml(JSON.parse(companyData).name || '')
    : '';
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
          .company { font-size: 14px; font-weight: bold; margin-bottom: 8px; }
          h1 { font-size: 20px; margin-bottom: 18px; }
          table { border-collapse: collapse; width: 100%; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: right; }
          th { background: #f1f5f9; }
          @page { size: ${getPaperSizeCss(printSettings.paperSize)}; margin: ${printSettings.printerType === 'THERMAL' ? '4mm' : '14mm'}; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        ${companyName ? `<div class="company">${companyName}</div>` : ''}
        <h1>${escapeHtml(title)}</h1>
        <table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
        <script>window.addEventListener('load', () => setTimeout(() => window.print(), 150));</script>
      </body>
    </html>`);
  printWindow.document.close();
};

export const formatExportDate = (date: string | Date | null | undefined) =>
  date ? new Date(date).toLocaleDateString('ar-SA') : '';

export const formatExportNumber = (value: number | null | undefined) =>
  Number(value || 0).toFixed(2);
