export interface ImportReference {
  id: string;
  name: string;
  aliases?: string[];
}

export const normalizeImportName = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const findImportReference = <T extends ImportReference>(
  references: readonly T[],
  value: string,
) => {
  const normalizedValue = normalizeImportName(value);
  return references.find((reference) => reference.id === value
    || [reference.name, ...(reference.aliases || [])]
      .some((name) => normalizeImportName(name) === normalizedValue));
};

export const resolveImportReference = async <T extends ImportReference>(
  references: readonly T[],
  value: string,
  createReference: (name: string) => Promise<{ reference: T; created: boolean }>,
) => {
  const reference = findImportReference(references, value);
  return reference
    ? { reference, created: false }
    : createReference(value);
};
