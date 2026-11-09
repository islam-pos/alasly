import {
  deleteQueuedMutation,
  getQueuedMutations,
  saveQueuedMutation,
  updateQueuedMutation,
  type QueuedOfflineMutation,
} from './offlineCache';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const MAX_QUEUED_BODY_LENGTH = 2 * 1024 * 1024;
let activeSync: Promise<void> | null = null;

const getUserScope = (): string | null => {
  if (!localStorage.getItem('autocare_token')) return null;
  try {
    const user = JSON.parse(localStorage.getItem('autocare_cached_user') || 'null') as { id?: unknown } | null;
    return typeof user?.id === 'string' ? user.id : null;
  } catch (error) {
    console.error('Could not identify the signed-in user for offline sync:', error);
    return null;
  }
};

const apiPath = (url: string): string => {
  const parsed = new URL(url, window.location.href);
  return parsed.pathname.replace(/^\/api(?=\/)/, '');
};

const canAutoSync = (method: string, url: string): boolean => {
  if (method !== 'POST') return false;
  return /^\/master\/(suppliers|customers|vehicles|employees)$/.test(apiPath(url));
};

export const queueOfflineMutation = async (
  url: string,
  init: RequestInit,
  method: string,
  idempotencyKey: string,
): Promise<QueuedOfflineMutation> => {
  const scope = getUserScope();
  if (!scope) {
    throw new Error('يلزم تسجيل الدخول على هذا الجهاز قبل حفظ عمليات للمزامنة دون اتصال.');
  }

  if (method === 'DELETE') {
    throw new Error('لا يمكن تنفيذ الحذف دون اتصال. أعد الاتصال بالإنترنت ثم حاول مرة أخرى.');
  }

  const body = typeof init.body === 'string' ? init.body : null;
  if (init.body && body === null) {
    throw new Error('لا يمكن حفظ هذا النوع من المرفقات للمزامنة دون اتصال.');
  }
  if ((body?.length || 0) > MAX_QUEUED_BODY_LENGTH) {
    throw new Error('حجم العملية أكبر من الحد المسموح لحفظها دون اتصال.');
  }

  const now = Date.now();
  const mutation: QueuedOfflineMutation = {
    id: crypto.randomUUID(),
    scope,
    url: new URL(url, window.location.href).toString(),
    method,
    body,
    idempotencyKey,
    state: canAutoSync(method, url) ? 'queued' : 'needs_review',
    autoSync: canAutoSync(method, url),
    createdAt: now,
    updatedAt: now,
  };
  await saveQueuedMutation(mutation);
  return mutation;
};

export const getCurrentUserQueuedMutations = async (): Promise<QueuedOfflineMutation[]> => {
  const scope = getUserScope();
  if (!scope) return [];

  const mutations = await getQueuedMutations(scope);
  const staleSyncs = mutations.filter(
    (mutation) => mutation.state === 'syncing' && Date.now() - mutation.updatedAt > 2 * 60 * 1000,
  );
  await Promise.all(staleSyncs.map((mutation) => updateQueuedMutation(mutation.id, {
    state: 'needs_review',
    updatedAt: Date.now(),
    lastError: 'توقف التطبيق أثناء المزامنة؛ تحقق من العملية على الخادم قبل إعادة إرسالها.',
  })));
  return getQueuedMutations(scope);
};

const getReplayHeaders = (mutation: QueuedOfflineMutation): Headers => {
  const token = localStorage.getItem('autocare_token');
  if (!token) throw new Error('انتهت جلسة الدخول؛ سجّل الدخول لمزامنة العمليات المحفوظة.');

  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'Idempotency-Key': mutation.idempotencyKey,
    'X-AutoCare-Offline': '1',
  });
  if (mutation.body !== null) headers.set('Content-Type', 'application/json');
  return headers;
};

const replayMutation = async (mutation: QueuedOfflineMutation, reviewed: boolean): Promise<void> => {
  const baseUrl = new URL(API_BASE_URL, window.location.href);
  const requestUrl = new URL(mutation.url);
  if (requestUrl.origin !== baseUrl.origin) {
    throw new Error('عنوان الخادم للعملية المحفوظة لا يطابق عنوان النظام الحالي.');
  }

  const headers = getReplayHeaders(mutation);
  if (reviewed) headers.set('X-AutoCare-Manual-Review', '1');
  const response = await globalThis.fetch(requestUrl, {
    method: mutation.method,
    headers,
    ...(mutation.body !== null ? { body: mutation.body } : {}),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `تعذر إرسال العملية (HTTP ${response.status}).`);
  }
};

export const syncQueuedMutations = async (options: {
  includeReview?: boolean;
  mutationId?: string;
} = {}): Promise<void> => {
  if (activeSync) {
    await activeSync;
    if (options.mutationId) return syncQueuedMutations(options);
    return;
  }
  const scope = getUserScope();
  if (!scope || !navigator.onLine) return;

  activeSync = (async () => {
    const mutations = await getCurrentUserQueuedMutations();
    for (const mutation of mutations) {
      const isManual = options.mutationId === mutation.id;
      if (mutation.state === 'syncing') continue;
      if (isManual && !options.includeReview) continue;
      if (!isManual && (!mutation.autoSync || mutation.state !== 'queued')) continue;

      await updateQueuedMutation(mutation.id, {
        state: 'syncing',
        updatedAt: Date.now(),
        lastError: undefined,
      });

      try {
        await replayMutation(mutation, isManual);
        await deleteQueuedMutation(mutation.id);
        window.dispatchEvent(new CustomEvent('autocare:offline-sync-complete'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'تعذرت مزامنة العملية.';
        const networkFailure = error instanceof TypeError || !navigator.onLine;
        await updateQueuedMutation(mutation.id, {
          state: mutation.autoSync && !isManual && networkFailure ? 'queued' : 'needs_review',
          updatedAt: Date.now(),
          lastError: message,
        });
        if (!navigator.onLine) break;
      }
    }
  })().finally(() => {
    activeSync = null;
  });

  return activeSync;
};
