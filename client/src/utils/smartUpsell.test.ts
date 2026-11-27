import { describe, expect, it } from 'vitest';
import { getSmartUpsellSuggestions } from './smartUpsell';

const catalog = [
  { id: 'brake-cleaner', nameAr: 'منظف فرامل DOT 4', availableQuantity: 7, sellPrice: 90 },
  { id: 'oil', nameAr: 'زيت محرك 5W30', availableQuantity: 3, sellPrice: 450 },
  { id: 'glass', nameAr: 'منظف زجاج السيارات', availableQuantity: 0, sellPrice: 80 },
  { id: 'unrelated', nameAr: 'مصباح أمامي', availableQuantity: 8, sellPrice: 500 },
];

describe('smart upsell suggestions', () => {
  it('suggests matching products from available stock for a related cart item', () => {
    const suggestions = getSmartUpsellSuggestions(catalog, [{ itemId: 'pads', name: 'تيل فرامل أمامي' }]);
    expect(suggestions.map((suggestion) => suggestion.item.id)).toContain('brake-cleaner');
    expect(suggestions.some((suggestion) => suggestion.item.id === 'glass')).toBe(false);
  });

  it('does not suggest an item already in the cart or an out-of-stock item', () => {
    const suggestions = getSmartUpsellSuggestions(catalog, []);
    expect(suggestions.some((suggestion) => suggestion.item.id === 'brake-cleaner')).toBe(true);
    expect(suggestions.some((suggestion) => suggestion.item.id === 'glass')).toBe(false);
  });

  it('returns no fabricated recommendations when the catalog has no matching items', () => {
    expect(getSmartUpsellSuggestions([catalog[3]], [{ itemId: 'part', name: 'تيل فرامل' }])).toEqual([]);
  });
});
