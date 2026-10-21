import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { findImportReference, normalizeImportName, resolveImportReference } from './itemImportMatching';

const categories = [
  { id: 'category-1', name: 'أدوات كهربائية' },
  { id: 'category-2', name: 'زيوت وشحوم' },
];

test('import names match Arabic diacritics, alef forms, tatweel, and hidden characters', () => {
  assert.equal(
    findImportReference(categories, '\u200fأَدَوَاتــ كَهْرَبَائِيَّة\u200f')?.id,
    'category-1',
  );
  assert.equal(normalizeImportName('زيوت\u0640 وشحوم'), normalizeImportName('زيوت وشحوم'));
});

test('import references match ids and reject unrelated names', () => {
  assert.equal(findImportReference(categories, 'category-2')?.id, 'category-2');
  assert.equal(
    findImportReference([{ id: 'unit-1', name: 'قطعة', aliases: ['حبة'] }], 'حَبَّة')?.id,
    'unit-1',
  );
  assert.equal(findImportReference(categories, 'قطع غيار'), undefined);
});

test('unknown import categories can be created and reported', async () => {
  const result = await resolveImportReference(categories, 'فلاتر', async (name) => ({
    reference: { id: 'category-3', name },
    created: true,
  }));

  assert.deepEqual(result, {
    reference: { id: 'category-3', name: 'فلاتر' },
    created: true,
  });
});

test('existing normalized import categories are reused without creation', async () => {
  let createCalled = false;
  const result = await resolveImportReference(categories, 'اَدوات كهربائية', async (name) => {
    createCalled = true;
    return { reference: { id: 'unexpected', name }, created: true };
  });

  assert.equal(result.reference.id, 'category-1');
  assert.equal(result.created, false);
  assert.equal(createCalled, false);
});
