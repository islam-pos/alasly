import JsBarcode from 'jsbarcode';
import { labelPaperSizes, parsePrintSettings } from './printSettings';

export interface BarcodeLabelItem {
  nameAr: string;
  sku: string;
  barcode?: string | null;
  sellPrice?: number | string | null;
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

  const labelTemplates = items.map((item) => {
    const value = item.barcode?.trim() || item.sku.trim();
    if (!value) throw new Error(`لا يوجد باركود أو كود للصنف ${item.nameAr}`);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, value, {
      format: 'CODE128',
      width: 2,
      height: 40,
      displayValue: false,
      lineColor: '#0f172a',
      background: 'transparent',
      margin: 0,
    });

    const price = Number(item.sellPrice);
    const priceMarkup = Number.isFinite(price) && price > 0
      ? `<span class="price">${price.toFixed(2)} ج.م</span>`
      : '';
    return `<template class="label-template"><article class="label">
      ${cachedCompanyName ? `<b class="company">${escapeHtml(cachedCompanyName)}</b>` : ''}
      <strong class="item-name">${escapeHtml(item.nameAr || '—')}</strong>
      <small class="sku">SKU: ${escapeHtml(item.sku)}</small>
      ${svg.outerHTML}
      <span class="value">${escapeHtml(value)}</span>
      ${priceMarkup}
    </article></template>`;
  }).join('');
  const barcodeSettings = settings.barcode;
  const presetSizes = [
    { value: '40x30', label: '40×30 مم (صغير)' },
    { value: '58x40', label: '58×40 مم' },
    { value: '50x30', label: '50×30 مم' },
    { value: '57x32', label: '57×32 مم' },
  ];
  const defaultLabelSize = labelPaperSizes.find(({ value }) => value === barcodeSettings.paperSize);
  const defaultWidth = defaultLabelSize?.width || (
    barcodeSettings.paperSize === 'THERMAL_58' ? 58 : barcodeSettings.paperSize === 'THERMAL_80' ? 80 : 40
  );
  const defaultHeight = defaultLabelSize?.height || (
    barcodeSettings.paperSize === 'THERMAL_58' ? 33 : barcodeSettings.paperSize === 'THERMAL_80' ? 38 : 30
  );

  const printWindow = window.open('', '_blank');
  if (!printWindow) return 'blocked';

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>ملصقات باركود الأصناف</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          :root { --label-w-mm: ${defaultWidth}; --label-h-mm: ${defaultHeight}; --barcode-h-mm: ${Math.max(10, defaultHeight - 10)}; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #1e293b; font-family: Arial, sans-serif; background: linear-gradient(135deg, #f8fafc, #e2e8f0); min-height: 100vh; }
          .app { display: flex; min-height: 100vh; }
          .settings { width: 360px; flex: 0 0 360px; padding: 24px; background: rgba(255,255,255,.94); border-left: 1px solid #e2e8f0; box-shadow: 0 8px 32px rgba(0,0,0,.08); }
          .heading { text-align: center; margin-bottom: 22px; }
          .heading .icon { font-size: 36px; }
          h1 { font-size: 22px; margin: 4px 0; color: #0f172a; }
          .subtitle { color: #64748b; margin: 0; font-size: 13px; }
          .group { padding: 18px; margin: 14px 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; }
          .group h2 { margin: 0 0 14px; font-size: 15px; }
          .field { margin: 12px 0; }
          .field label { display: block; margin-bottom: 6px; color: #475569; font-size: 13px; font-weight: 700; }
          input, select { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 9px; background: #f8fafc; font: inherit; }
          .row { display: flex; gap: 10px; }
          .row .field { flex: 1; min-width: 0; }
          .check { display: flex; align-items: center; gap: 9px; margin: 10px 0; font-size: 13px; }
          .check input { width: 17px; height: 17px; }
          .button { width: 100%; padding: 12px; margin-top: 10px; border: 0; border-radius: 10px; font: inherit; font-weight: 700; cursor: pointer; }
          .primary { color: #fff; background: #2563eb; }
          .secondary { color: #334155; background: #f1f5f9; border: 1px solid #cbd5e1; }
          .error { color: #b91c1c; font-size: 12px; min-height: 18px; }
          .preview-area { flex: 1; min-width: 0; padding: 32px; overflow: auto; }
          .preview-head { margin: 0 auto 18px; max-width: 1100px; }
          .preview-head h2 { margin: 0 0 5px; font-size: 18px; }
          .preview-head p { margin: 0; color: #64748b; font-size: 13px; }
          .paper { min-height: 75vh; max-width: 1100px; margin: auto; padding: 18px; background: #fff; border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,.08); }
          .labels { display: grid; grid-template-columns: repeat(auto-fill, calc(var(--label-w-mm) * 1mm)); justify-content: center; align-content: start; gap: 2mm; }
          .label { width: calc(var(--label-w-mm) * 1mm); height: calc(var(--label-h-mm) * 1mm); padding: .7mm; border: 1px dashed #cbd5e1; border-radius: 1mm; display: flex; flex-direction: column; justify-content: space-around; align-items: center; overflow: hidden; text-align: center; background: #fff; break-inside: avoid; }
          .label > * { max-width: 100%; flex: 0 0 auto; }
          .brand, .item-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 1; }
          .company { font-weight: 800; font-size: 2.4mm; }
          .item-name { font-weight: 700; font-size: 2.5mm; }
          .sku { color: #64748b; font-size: 2mm; }
          .label svg { width: 100%; height: calc(var(--barcode-h-mm) * 1mm); max-height: 55%; object-fit: contain; flex: 1 1 0; min-height: 0; }
          .value { font-size: 2.2mm; font-weight: 700; direction: ltr; }
          .price { font-size: 2.6mm; font-weight: 800; }
          .label.hide-company .company, .label.hide-name .item-name, .label.hide-sku .sku, .label.hide-price .price { display: none; }
          template { display: none; }
          @media (max-width: 800px) { .app { display: block; } .settings { width: 100%; } .preview-area { padding: 18px 8px; } .paper { padding: 8px; } }
          @media print {
            @page { size: 40mm 30mm; margin: 0 !important; }
            html, body { width: 100% !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
            .settings, .preview-head { display: none !important; }
            .app, .preview-area, .paper { display: block !important; width: 100% !important; min-height: 0 !important; max-width: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important; }
            .labels { display: block !important; width: 100% !important; }
            .label { width: calc(var(--label-w-mm) * 1mm) !important; height: calc(var(--label-h-mm) * 1mm) !important; max-height: calc(var(--label-h-mm) * 1mm) !important; margin: 0 !important; padding: .5mm !important; border: 0 !important; border-radius: 0 !important; page-break-inside: avoid !important; break-inside: avoid !important; page-break-after: always !important; break-after: page !important; }
            .label:last-child { page-break-after: auto !important; break-after: auto !important; }
          }
        </style>
      </head>
      <body>
        <div class="app">
          <aside class="settings">
            <header class="heading"><div class="icon">🏷️</div><h1>طباعة الباركود</h1><p class="subtitle">تخصيص الملصقات ومعاينة الطباعة</p></header>
            <section class="group">
              <h2>إعدادات الطباعة</h2>
              <div class="field"><label for="copies">عدد النسخ لكل صنف</label><input id="copies" type="number" min="1" max="1000" value="1"></div>
              <div class="field"><label for="preset">مقاسات جاهزة</label><select id="preset"><option value="">اختر مقاسًا...</option>${presetSizes.map((preset) => `<option value="${preset.value}">${preset.label}</option>`).join('')}</select></div>
              <div class="row">
                <div class="field"><label for="width">العرض (مم)</label><input id="width" type="number" min="20" max="100" value="${defaultWidth}"></div>
                <div class="field"><label for="height">الطول (مم)</label><input id="height" type="number" min="15" max="100" value="${defaultHeight}"></div>
              </div>
              <div class="field"><label for="barcode-height">ارتفاع الباركود (مم)</label><input id="barcode-height" type="number" min="5" max="80" value="${Math.max(10, defaultHeight - 10)}"></div>
            </section>
            <section class="group">
              <h2>محتوى الملصق</h2>
              <label class="check"><input id="show-company" type="checkbox" ${settings.showCompanyName ? 'checked' : ''}> إظهار اسم المنشأة</label>
              <label class="check"><input id="show-name" type="checkbox" checked> إظهار اسم الصنف</label>
              <label class="check"><input id="show-sku" type="checkbox" checked> إظهار كود SKU</label>
              <label class="check"><input id="show-price" type="checkbox"> إظهار السعر (إن توفر)</label>
            </section>
            <p id="error" class="error" role="alert"></p>
            <button id="apply" class="button secondary" type="button">تطبيق الإعدادات</button>
            <button id="print" class="button primary" type="button">طباعة الملصقات</button>
          </aside>
          <main class="preview-area">
            <header class="preview-head"><h2>معاينة الملصقات</h2><p id="count"></p></header>
            <section class="paper"><div id="labels" class="labels"></div></section>
          </main>
        </div>
        <div id="templates">${labelTemplates}</div>
        <style id="page-size">@page { size: ${defaultWidth}mm ${defaultHeight}mm; margin: 0 !important; }</style>
        <script>
          (() => {
            const templates = Array.from(document.querySelectorAll('template.label-template'));
            const labels = document.getElementById('labels');
            const copyInput = document.getElementById('copies');
            const widthInput = document.getElementById('width');
            const heightInput = document.getElementById('height');
            const barcodeHeightInput = document.getElementById('barcode-height');
            const error = document.getElementById('error');
            const maxLabels = 1000;
            const bounded = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
            const apply = () => {
              const width = bounded(Number(widthInput.value), 20, 100, 40);
              const height = bounded(Number(heightInput.value), 15, 100, 30);
              const barcodeHeight = bounded(Number(barcodeHeightInput.value), 5, 80, Math.max(10, height - 10));
              widthInput.value = String(width);
              heightInput.value = String(height);
              barcodeHeightInput.value = String(barcodeHeight);
              document.documentElement.style.setProperty('--label-w-mm', width);
              document.documentElement.style.setProperty('--label-h-mm', height);
              document.documentElement.style.setProperty('--barcode-h-mm', barcodeHeight);
              document.getElementById('page-size').textContent = '@page { size: ' + width + 'mm ' + height + 'mm; margin: 0 !important; }';
              const copies = Math.floor(bounded(Number(copyInput.value), 1, maxLabels, 1));
              copyInput.value = String(copies);
              const total = copies * templates.length;
              document.getElementById('count').textContent = 'عدد الملصقات: ' + Math.min(total, maxLabels);
              if (total > maxLabels) {
                error.textContent = 'الحد الأقصى للطباعة 1000 ملصق في المرة الواحدة';
                labels.replaceChildren();
                return false;
              }
              error.textContent = '';
              const show = {
                company: document.getElementById('show-company').checked,
                name: document.getElementById('show-name').checked,
                sku: document.getElementById('show-sku').checked,
                price: document.getElementById('show-price').checked,
              };
              const fragment = document.createDocumentFragment();
              for (let copy = 0; copy < copies; copy++) {
                templates.forEach((template) => {
                  const label = template.content.firstElementChild.cloneNode(true);
                  label.classList.toggle('hide-company', !show.company);
                  label.classList.toggle('hide-name', !show.name);
                  label.classList.toggle('hide-sku', !show.sku);
                  label.classList.toggle('hide-price', !show.price);
                  fragment.appendChild(label);
                });
              }
              labels.replaceChildren(fragment);
              return true;
            };
            document.getElementById('apply').addEventListener('click', apply);
            ['copies', 'width', 'height', 'barcode-height', 'show-company', 'show-name', 'show-sku', 'show-price'].forEach((id) => {
              document.getElementById(id).addEventListener('change', apply);
            });
            document.getElementById('preset').addEventListener('change', (event) => {
              const values = event.target.value.split('x').map(Number);
              if (values.length === 2 && values.every(Number.isFinite)) {
                widthInput.value = String(values[0]);
                heightInput.value = String(values[1]);
                barcodeHeightInput.value = String(Math.max(10, values[1] - 10));
                apply();
              }
            });
            document.getElementById('print').addEventListener('click', () => {
              if (apply()) window.print();
            });
            apply();
          })();
        </script>
      </body>
    </html>`);
  printWindow.document.close();
  return 'opened';
};
