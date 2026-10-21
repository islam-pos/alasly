import { describe, expect, it } from 'vitest';
import { readExcelRows } from './excelImport';

describe('readExcelRows', () => {
  it('preserves sparse SpreadsheetML cells in their original columns', async () => {
    const xml = '<?xml version="1.0"?><Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet><Table><Row><Cell><Data>SKU</Data></Cell><Cell><Data>اسم الصنف</Data></Cell><Cell ss:Index="4"><Data>التصنيف</Data></Cell><Cell><Data>الوحدة</Data></Cell></Row></Table></Worksheet></Workbook>';
    const file = new File(
      [xml],
      'sparse.xls',
    );
    Object.defineProperty(file, 'slice', { value: () => ({ text: async () => xml }) });
    Object.defineProperty(file, 'text', { value: async () => xml });

    await expect(readExcelRows(file)).resolves.toEqual([
      ['SKU', 'اسم الصنف', '', 'التصنيف', 'الوحدة'],
    ]);
  });

  it('places implicit SpreadsheetML cells after the preceding indexed cell', async () => {
    const xml = '<Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet><Table><Row><Cell ss:Index="2"><Data>SKU</Data></Cell><Cell><Data>اسم الصنف</Data></Cell></Row></Table></Worksheet></Workbook>';
    const file = new File(
      [xml],
      'sparse.xls',
    );
    Object.defineProperty(file, 'slice', { value: () => ({ text: async () => xml }) });
    Object.defineProperty(file, 'text', { value: async () => xml });

    await expect(readExcelRows(file)).resolves.toEqual([
      ['', 'SKU', 'اسم الصنف'],
    ]);
  });
});
