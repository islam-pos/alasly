import { afterEach, describe, expect, it, vi } from 'vitest';
import { printBarcodeLabels } from './barcodePrint';

vi.mock('jsbarcode', () => ({ default: vi.fn() }));

afterEach(() => {
  localStorage.clear();
});

describe('printBarcodeLabels', () => {
  it('offers every configured label size and selects the configured print size', () => {
    vi.spyOn(window, 'open').mockReturnValue(window);
    vi.spyOn(document, 'open').mockReturnValue(window);
    vi.spyOn(document, 'write').mockImplementation(() => undefined);
    vi.spyOn(document, 'close').mockImplementation(() => undefined);

    const result = printBarcodeLabels(
      [{ nameAr: 'فلتر زيت', sku: 'OIL-01', barcode: '10001' }],
      undefined,
      { barcode: { paperSize: 'LABEL_100X50', printerType: 'LABEL' } },
    );

    const writtenHtml = vi.mocked(document.write).mock.calls[0]?.[0] ?? '';
    expect(result).toBe('opened');
    expect(writtenHtml).toContain('<option value="100x50" selected>');
    expect(writtenHtml).toContain('<option value="60x40"');
    expect(writtenHtml).toContain('<option value="58x33"');
    expect(writtenHtml).toContain('@page { size: 100mm 50mm;');
  });
});
