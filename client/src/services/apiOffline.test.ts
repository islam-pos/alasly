import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { clearCachedResponses, clearQueuedMutations, getQueuedMutations } from './offlineCache';
import { syncQueuedMutations } from './offlineSync';

afterEach(async () => {
  localStorage.clear();
  await clearCachedResponses();
  await clearQueuedMutations();
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

  it('queues edits for review instead of implying they were saved to the server', async () => {
    localStorage.setItem('autocare_token', 'previously-authenticated-token');
    localStorage.setItem('autocare_cached_user', JSON.stringify({ id: 'user-1' }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network unavailable')));

    await expect(api.updateCompany({ name: 'مركز جديد' }))
      .rejects.toThrow('حُفظت العملية على هذا الجهاز');

    const queued = await getQueuedMutations('user-1');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      method: 'PUT',
      state: 'needs_review',
      autoSync: false,
      body: JSON.stringify({ name: 'مركز جديد' }),
    });
  });

  it('automatically replays only approved basic-record creates with the original idempotency key', async () => {
    localStorage.setItem('autocare_token', 'previously-authenticated-token');
    localStorage.setItem('autocare_cached_user', JSON.stringify({ id: 'user-1' }));
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'customer-1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.createCustomer({ name: 'عميل جديد' }))
      .rejects.toThrow('سيُرسل تلقائياً');
    const queued = await getQueuedMutations('user-1');
    expect(queued).toHaveLength(1);
    const originalHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);

    await syncQueuedMutations();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Idempotency-Key'))
      .toBe(originalHeaders.get('Idempotency-Key'));
    expect(await getQueuedMutations('user-1')).toHaveLength(0);
  });

  it('keeps financial operations for manual review rather than replaying automatically', async () => {
    localStorage.setItem('autocare_token', 'previously-authenticated-token');
    localStorage.setItem('autocare_cached_user', JSON.stringify({ id: 'user-1' }));
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.posCheckout({ items: [{ itemId: 'item-1', quantity: 1 }] }))
      .rejects.toThrow('لم تُرسل');
    await syncQueuedMutations();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await getQueuedMutations('user-1')).toMatchObject([
      { method: 'POST', state: 'needs_review', autoSync: false },
    ]);
  });

  it('marks a manually reviewed replay and removes it only after the server accepts it', async () => {
    localStorage.setItem('autocare_token', 'previously-authenticated-token');
    localStorage.setItem('autocare_cached_user', JSON.stringify({ id: 'user-1' }));
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.updateCompany({ name: 'مركز جديد' })).rejects.toThrow('حُفظت العملية');
    const [queued] = await getQueuedMutations('user-1');
    await syncQueuedMutations({ includeReview: true, mutationId: queued.id });

    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('X-AutoCare-Manual-Review')).toBe('1');
    expect(await getQueuedMutations('user-1')).toHaveLength(0);
  });
});
