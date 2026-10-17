import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarcodePrintDialog } from './BarcodePrintDialog';
import type { BarcodeLabelItem } from '../../utils/barcodePrint';

const items: BarcodeLabelItem[] = [
  { nameAr: 'فلتر زيت', sku: 'OIL-01', barcode: '10001' },
  { nameAr: 'فلتر هواء', sku: 'AIR-02', barcode: '10002' },
];

afterEach(cleanup);

describe('BarcodePrintDialog', () => {
  it('prints only items with the requested copies and keeps selections while searching', () => {
    const onPrint = vi.fn(() => true);
    const onClose = vi.fn();
    render(<BarcodePrintDialog items={items} onClose={onClose} onPrint={onPrint} />);

    expect(screen.getByRole('button', { name: 'طباعة الملصقات' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'عدد ملصقات فلتر زيت' }), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'البحث عن صنف لطباعة الباركود' }), {
      target: { value: 'AIR-02' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'عدد ملصقات فلتر هواء' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'طباعة الملصقات' }));

    expect(onPrint).toHaveBeenCalledOnce();
    expect(onPrint).toHaveBeenCalledWith([items[0], items[0], items[1]]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('rejects totals above the per-print limit', () => {
    const onPrint = vi.fn(() => true);
    render(<BarcodePrintDialog items={items} onClose={vi.fn()} onPrint={onPrint} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'عدد ملصقات فلتر زيت' }), {
      target: { value: '1000' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'عدد ملصقات فلتر هواء' }), {
      target: { value: '1' },
    });

    expect(screen.getByRole('button', { name: 'طباعة الملصقات' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('1000');
    expect(onPrint).not.toHaveBeenCalled();
  });

  it('keeps the dialog open if the browser blocks the print window', () => {
    const onPrint = vi.fn(() => false);
    const onClose = vi.fn();
    render(<BarcodePrintDialog items={items} onClose={onClose} onPrint={onPrint} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'عدد ملصقات فلتر زيت' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'طباعة الملصقات' }));

    expect(onPrint).toHaveBeenCalledWith([items[0]]);
    expect(onClose).not.toHaveBeenCalled();
  });
});
