export type PosLineInput = {
  itemId: string | null;
  quantity: number | string;
  unitPrice: number | string;
  description?: string;
  itemType?: string;
};

export const isValidPosLine = (line: unknown): line is PosLineInput => {
  if (!line || typeof line !== 'object' || Array.isArray(line)) return false;

  const candidate = line as Record<string, unknown>;
  const quantity = Number(candidate.quantity);
  const unitPrice = Number(candidate.unitPrice);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return false;
  }

  if (typeof candidate.itemId === 'string') return candidate.itemId.trim().length > 0;
  return candidate.itemId === null
    && candidate.itemType === 'LABOR'
    && typeof candidate.description === 'string'
    && candidate.description.trim().length > 0
    && candidate.description.trim().length <= 250;
};

export const isValidPosLines = (lines: unknown): lines is PosLineInput[] =>
  Array.isArray(lines)
    && lines.length > 0
    && lines.length <= 500
    && lines.every(isValidPosLine);
