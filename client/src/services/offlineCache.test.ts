import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearCachedResponses,
  getCachedResponse,
  getLatestCachedResponseTime,
  saveCachedResponse,
} from './offlineCache';

afterEach(async () => {
  await clearCachedResponses();
  vi.restoreAllMocks();
});

describe('offline API cache', () => {
  it('stores JSON responses separately by authenticated scope', async () => {
    const response = new Response(JSON.stringify({ data: [{ id: 'item-1' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await saveCachedResponse('user-a', '/api/items', response);

    const cached = await getCachedResponse('user-a', '/api/items');
    expect(cached?.status).toBe(200);
    expect(JSON.parse(cached?.body || 'null')).toEqual({ data: [{ id: 'item-1' }] });
    expect(await getCachedResponse('user-b', '/api/items')).toBeUndefined();
  });

  it('tracks the latest cache time and clears only the requested user scope', async () => {
    await saveCachedResponse('user-a', '/api/items', new Response('{"items":[]}', {
      headers: { 'content-type': 'application/json' },
    }));
    await saveCachedResponse('user-b', '/api/items', new Response('{"items":[1]}', {
      headers: { 'content-type': 'application/json' },
    }));

    expect(await getLatestCachedResponseTime('user-a')).not.toBeNull();
    await clearCachedResponses('user-a');
    expect(await getCachedResponse('user-a', '/api/items')).toBeUndefined();
    expect(await getCachedResponse('user-b', '/api/items')).toBeDefined();
  });

  it('does not persist non-JSON API responses', async () => {
    await saveCachedResponse('user-a', '/api/export', new Response('spreadsheet', {
      headers: { 'content-type': 'application/octet-stream' },
    }));

    expect(await getCachedResponse('user-a', '/api/export')).toBeUndefined();
  });

  it('expires cached responses older than 30 days', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await saveCachedResponse('user-a', '/api/items', new Response('{"items":[]}', {
      headers: { 'content-type': 'application/json' },
    }));

    vi.mocked(Date.now).mockReturnValue(now + 31 * 24 * 60 * 60 * 1000);
    expect(await getCachedResponse('user-a', '/api/items')).toBeUndefined();
  });
});
