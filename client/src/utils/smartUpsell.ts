export type UpsellCatalogItem = {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  sku?: string | null;
  barcode?: string | null;
  availableQuantity: number;
  sellPrice: number;
  category?: { name?: string | null; nameAr?: string | null } | null;
};

export type UpsellCartLine = { itemId: string; name?: string; sku?: string };

export type SmartUpsellSuggestion = {
  item: UpsellCatalogItem;
  reason: string;
};

const normalize = (value: unknown) => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase('ar')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه');

const recommendationGroups = [
  {
    key: 'brake-cleaner',
    reason: 'منظف فرامل متاح لإكمال خدمة الفرامل',
    aliases: ['brake cleaner', 'منظف فرامل', 'بريك كلينر'],
    triggers: ['فرامل', 'تيل', 'ديسك', 'brake', 'rotor', 'pad'],
  },
  {
    key: 'injector-cleaner',
    reason: 'منظف بخاخات متاح كمنتج مكمل للصيانة',
    aliases: ['injector cleaner', 'منظف بخاخ', 'منظف رشاش'],
    triggers: ['محرك', 'بخاخ', 'رشاش', 'وقود', 'engine', 'injector', 'fuel'],
  },
  {
    key: 'oil',
    reason: 'زيت محرك متاح ضمن درجات اللزوجة الشائعة',
    aliases: ['5w30', '5w-30', '5w40', '5w-40', '10w40', '10w-40', 'زيت محرك', 'engine oil'],
    triggers: ['زيت', 'فلتر زيت', 'oil', 'engine', 'صيانة دوريه'],
  },
  {
    key: 'glass-care',
    reason: 'منتج تنظيف زجاج متاح للعميل',
    aliases: ['glass cleaner', 'منظف زجاج', 'شامبو سيارات', 'car shampoo'],
    triggers: ['زجاج', 'مساحات', 'شامبو', 'glass', 'wiper'],
  },
] as const;

export const getSmartUpsellSuggestions = (
  catalog: UpsellCatalogItem[],
  cart: UpsellCartLine[],
  limit = 3,
): SmartUpsellSuggestion[] => {
  const cartIds = new Set(cart.map((line) => line.itemId));
  const cartText = normalize(cart.map((line) => `${line.name || ''} ${line.sku || ''}`).join(' '));
  const candidates = catalog.filter((item) => item.availableQuantity > 0 && !cartIds.has(item.id));
  const suggestions: SmartUpsellSuggestion[] = [];
  const usedIds = new Set<string>();

  for (const group of recommendationGroups) {
    const triggered = cart.length === 0 || group.triggers.some((term) => cartText.includes(normalize(term)));
    if (!triggered) continue;
    const match = candidates.find((item) => {
      if (usedIds.has(item.id)) return false;
      const itemText = normalize([
        item.nameAr,
        item.nameEn,
        item.sku,
        item.category?.nameAr,
        item.category?.name,
      ].filter(Boolean).join(' '));
      return group.aliases.some((alias) => itemText.includes(normalize(alias)));
    });
    if (!match) continue;
    usedIds.add(match.id);
    suggestions.push({ item: match, reason: group.reason });
    if (suggestions.length >= limit) break;
  }

  return suggestions;
};
