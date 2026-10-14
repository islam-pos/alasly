export type PaperSize = 'A4' | 'A5' | 'THERMAL_80' | 'THERMAL_58';
export type PrinterType = 'STANDARD' | 'THERMAL';

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

  const paperSize = ['A4', 'A5', 'THERMAL_80', 'THERMAL_58'].includes(String(parsed.paperSize))
    ? parsed.paperSize as PaperSize
    : defaultPrintSettings.paperSize;
  const printerType = parsed.printerType === 'THERMAL' ? 'THERMAL' : 'STANDARD';
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
      paperSize: ['A4', 'A5', 'THERMAL_80', 'THERMAL_58'].includes(String(candidateOutput.paperSize))
        ? candidateOutput.paperSize as PaperSize
        : fallback.paperSize,
      printerType: candidateOutput.printerType === 'THERMAL' ? 'THERMAL' : candidateOutput.printerType === 'STANDARD'
        ? 'STANDARD'
        : fallback.printerType,
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
  switch (paperSize) {
    case 'A5': return 'A5 portrait';
    case 'THERMAL_80': return '80mm 297mm';
    case 'THERMAL_58': return '58mm 297mm';
    default: return 'A4 portrait';
  }
};
