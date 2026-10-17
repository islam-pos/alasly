import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { clearCachedResponses } from './offlineCache';

afterEach(async () => {
  localStorage.clear();
  await clearCachedResponses();
  vi.restoreAllMocks();
});

describe('offline API requests', () => {
  it('serves a previously cached JSON read when the network becomes unavailable', async () => {
    localStorage.setItem('autocare_token', 'previously-authenticated-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'فرع القاهرة' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));

    await api.getCompany();
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('Network unavailable'));

    await expect(api.getCompany()).resolves.toMatchObject({ data: { name: 'فرع القاهرة' } });
  });

  it('rejects writes while offline instead of implying they were saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network unavailable')));

    await expect(api.updateCompany({ name: 'مركز جديد' }))
      .rejects.toThrow('لم تُحفظ العملية');
  });
});
