import { unzipSync } from 'fflate';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
const MAX_ROWS = 2000;

const parseXml = (text: string) => {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('ملف Excel يحتوي على تعريفات XML غير مدعومة');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('ملف Excel غير صالح أو تالف');
  return document;
};

const xmlText = (entries: Record<string, Uint8Array>, path: string) => {
  const entry = entries[path];
  if (!entry) throw new Error('ملف Excel لا يحتوي على ورقة بيانات صالحة');
  return new TextDecoder().decode(entry);
};

const zipExpandedSize = (file: Uint8Array) => {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const min = Math.max(0, file.length - 65_557);
  let endOfCentralDirectory = -1;
  for (let offset = file.length - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory < 0) throw new Error('تعذر قراءة بنية ملف Excel');

  const entryCount = view.getUint16(endOfCentralDirectory + 10, true);
  const centralSize = view.getUint32(endOfCentralDirectory + 12, true);
  let offset = view.getUint32(endOfCentralDirectory + 16, true);
  if (entryCount > 300 || centralSize === 0xffffffff || offset === 0xffffffff) {
    throw new Error('ملف Excel يحتوي على عدد كبير أو صيغة غير مدعومة من الملفات');
  }

  let expandedSize = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('تعذر قراءة محتويات ملف Excel');
    const entryExpandedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (entryExpandedSize === 0xffffffff) throw new Error('ملفات Excel الأكبر من الصيغة المدعومة غير مسموحة');
    expandedSize += entryExpandedSize;
    if (expandedSize > MAX_UNCOMPRESSED_BYTES) throw new Error('حجم ملف Excel بعد فك الضغط كبير جدًا');
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return expandedSize;
};

const columnIndex = (reference: string) => {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() || '';
  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
};

const readXlsxRows = (buffer: ArrayBuffer) => {
  const file = new Uint8Array(buffer);
  zipExpandedSize(file);
  const entries = unzipSync(file);
  const workbook = parseXml(xmlText(entries, 'xl/workbook.xml'));
  const firstSheet = workbook.getElementsByTagName('sheet')[0];
  if (!firstSheet) throw new Error('لم يتم العثور على ورقة داخل ملف Excel');
  const relationshipId = firstSheet.getAttribute('r:id')
    || firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const relationships = parseXml(xmlText(entries, 'xl/_rels/workbook.xml.rels'));
  const relationship = [...relationships.getElementsByTagName('Relationship')]
    .find((entry) => entry.getAttribute('Id') === relationshipId);
  const target = relationship?.getAttribute('Target');
  if (!target) throw new Error('تعذر تحديد ورقة البيانات داخل ملف Excel');
  const worksheetPath = (target.startsWith('/') ? target.slice(1) : `xl/${target}`)
    .split('/')
    .reduce<string[]>((segments, part) => {
      if (part === '..') segments.pop();
      else if (part !== '.' && part) segments.push(part);
      return segments;
    }, [])
    .join('/');
  const worksheet = parseXml(xmlText(entries, worksheetPath));
  const sharedStringsEntry = entries['xl/sharedStrings.xml'];
  const sharedStrings = sharedStringsEntry
    ? [...parseXml(new TextDecoder().decode(sharedStringsEntry)).getElementsByTagName('si')]
      .map((entry) => entry.textContent || '')
    : [];

  return [...worksheet.getElementsByTagName('sheetData')[0]?.getElementsByTagName('row') || []]
    .slice(0, MAX_ROWS + 1)
    .map((row) => {
      const values: string[] = [];
      for (const cell of [...row.getElementsByTagName('c')]) {
        const index = columnIndex(cell.getAttribute('r') || '');
        if (index < 0 || index > 100) continue;
        const type = cell.getAttribute('t');
        const value = type === 'inlineStr'
          ? cell.getElementsByTagName('is')[0]?.textContent || ''
          : cell.getElementsByTagName('v')[0]?.textContent || '';
        values[index] = type === 's' ? sharedStrings[Number(value)] || '' : value;
      }
      return values.map((value) => value ?? '');
    });
};

const readSpreadsheetXmlRows = (text: string) => {
  const document = parseXml(text);
  return [...document.getElementsByTagName('Worksheet')[0]?.getElementsByTagName('Row') || []]
    .slice(0, MAX_ROWS + 1)
    .map((row) =>
      [...row.getElementsByTagName('Cell')].map((cell) => {
        const value = cell.getElementsByTagName('Data')[0]?.textContent || '';
        const type = cell.getElementsByTagName('Data')[0]?.getAttribute('ss:Type')
          || cell.getElementsByTagName('Data')[0]?.getAttribute('Type');
        return type === 'Number' && value ? value : value;
      }),
    );
};

export const readExcelRows = async (file: File) => {
  if (file.size > MAX_FILE_BYTES) throw new Error('حجم الملف يتجاوز الحد المسموح (10 ميجابايت)');
  const extension = file.name.toLowerCase().split('.').pop();
  let rows: string[][];
  if (extension === 'xlsx') {
    rows = readXlsxRows(await file.arrayBuffer());
  } else if (extension === 'xls') {
    rows = readSpreadsheetXmlRows(await file.text());
  } else {
    throw new Error('صيغة الملف غير مدعومة. استخدم ملف .xlsx أو ملف Excel .xls تم تنزيله من النظام');
  }

  if (rows.length > MAX_ROWS) throw new Error(`الحد الأقصى للاستيراد هو ${MAX_ROWS} صنف في المرة الواحدة`);
  if (!rows.length || !rows[0].some((cell) => cell.trim())) throw new Error('ورقة Excel فارغة');
  return rows;
};
