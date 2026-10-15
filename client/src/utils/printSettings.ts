export const labelPaperSizes = [
  { value: 'LABEL_40X30', label: 'ملصق 40 × 30 مم', width: 40, height: 30 },
  { value: 'LABEL_50X30', label: 'ملصق 50 × 30 مم', width: 50, height: 30 },
  { value: 'LABEL_60X40', label: 'ملصق 60 × 40 مم', width: 60, height: 40 },
  { value: 'LABEL_100X50', label: 'ملصق 100 × 50 مم', width: 100, height: 50 },
] as const;

type LabelPaperSize = (typeof labelPaperSizes)[number]['value'];
export type PaperSize = 'A4' | 'A5' | 'THERMAL_80' | 'THERMAL_58' | LabelPaperSize;
export type PrinterType = 'STANDARD' | 'THERMAL' | 'LABEL';

export interface OutputPrintSettings {
  paperSize: PaperSize;
  printerType: PrinterType;
}

export interface PrintSettings {
  paperSize: PaperSize;
  printerType: PrinterType;
  barcode: OutputPrintSettings;
  documents: OutputPrintSettings;
  showCompanyName: boolean;
  invoiceFields: {
    companyAddress: boolean;
    companyPhone: boolean;
    companyTaxNumber: boolean;
    commercialRegister: boolean;
    invoiceDate: boolean;
    customerName: boolean;
    customerPhone: boolean;
    customerTaxNumber: boolean;
    vehicleDetails: boolean;
    paymentMethod: boolean;
    itemCode: boolean;
    quantity: boolean;
    unitPrice: boolean;
    lineTotal: boolean;
    subtotal: boolean;
    discount: boolean;
    grandTotal: boolean;
    footer: boolean;
  };
}

export const defaultPrintSettings: PrintSettings = {
  paperSize: 'A4',
  printerType: 'STANDARD',
  barcode: { paperSize: 'THERMAL_80', printerType: 'THERMAL' },
  documents: { paperSize: 'A4', printerType: 'STANDARD' },
  showCompanyName: true,
  invoiceFields: {
    companyAddress: true,
    companyPhone: true,
    companyTaxNumber: true,
    commercialRegister: true,
    invoiceDate: true,
    customerName: true,
    customerPhone: true,
    customerTaxNumber: true,
    vehicleDetails: true,
    paymentMethod: true,
    itemCode: true,
    quantity: true,
    unitPrice: true,
    lineTotal: true,
    subtotal: true,
    discount: true,
    grandTotal: true,
    footer: true,
  },
};

export const parsePrintSettings = (value: unknown): PrintSettings => {
  let parsed: Partial<PrintSettings> = {};
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) : value;
    if (candidate && typeof candidate === 'object') parsed = candidate as Partial<PrintSettings>;
  } catch {
    parsed = {};
  }

  const validPaperSizes = ['A4', 'A5', 'THERMAL_80', 'THERMAL_58', ...labelPaperSizes.map(({ value }) => value)];
  const paperSize = validPaperSizes.includes(String(parsed.paperSize))
    ? parsed.paperSize as PaperSize
    : defaultPrintSettings.paperSize;
  const parsePrinterType = (value: unknown, fallback: PrinterType): PrinterType =>
    value === 'THERMAL' || value === 'LABEL' || value === 'STANDARD' ? value : fallback;
  const printerType = parsePrinterType(parsed.printerType, defaultPrintSettings.printerType);
  const hasLegacyOutputSettings = Object.prototype.hasOwnProperty.call(parsed, 'paperSize')
    || Object.prototype.hasOwnProperty.call(parsed, 'printerType');
  const parseOutputSettings = (
    output: unknown,
    fallback: OutputPrintSettings,
  ): OutputPrintSettings => {
    const candidateOutput = output && typeof output === 'object'
      ? output as Partial<OutputPrintSettings>
      : {};
    return {
      paperSize: validPaperSizes.includes(String(candidateOutput.paperSize))
        ? candidateOutput.paperSize as PaperSize
        : fallback.paperSize,
      printerType: parsePrinterType(candidateOutput.printerType, fallback.printerType),
    };
  };
  const legacyOutput: OutputPrintSettings = { paperSize, printerType };
  const barcode = parseOutputSettings(
    parsed.barcode,
    defaultPrintSettings.barcode,
  );
  const documents = parseOutputSettings(
    parsed.documents,
    hasLegacyOutputSettings ? legacyOutput : defaultPrintSettings.documents,
  );
  const invoiceFields = parsed.invoiceFields && typeof parsed.invoiceFields === 'object'
    ? parsed.invoiceFields
    : {};

  return {
    paperSize,
    printerType,
    barcode,
    documents,
    showCompanyName: typeof parsed.showCompanyName === 'boolean'
      ? parsed.showCompanyName
      : defaultPrintSettings.showCompanyName,
    invoiceFields: Object.fromEntries(
      Object.entries(defaultPrintSettings.invoiceFields).map(([key, defaultValue]) => [
        key,
        typeof invoiceFields[key as keyof PrintSettings['invoiceFields']] === 'boolean'
          ? invoiceFields[key as keyof PrintSettings['invoiceFields']]
          : defaultValue,
      ]),
    ) as PrintSettings['invoiceFields'],
  };
};

export const getPaperSizeCss = (paperSize: PaperSize) => {
  const labelSize = labelPaperSizes.find(({ value }) => value === paperSize);
  if (labelSize) return `${labelSize.width}mm ${labelSize.height}mm`;

  switch (paperSize) {
    case 'A5': return 'A5 portrait';
    case 'THERMAL_80': return '80mm 297mm';
    case 'THERMAL_58': return '58mm 297mm';
    default: return 'A4 portrait';
  }
};
