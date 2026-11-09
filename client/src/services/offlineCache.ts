export interface CachedApiResponse {
  key: string;
  scope: string;
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  storedAt: number;
}

export type OfflineMutationState = 'queued' | 'needs_review' | 'syncing' | 'failed';

export interface QueuedOfflineMutation {
  id: string;
  scope: string;
  url: string;
  method: string;
  body: string | null;
  idempotencyKey: string;
  state: OfflineMutationState;
  autoSync: boolean;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

const DATABASE_NAME = 'autocare-offline';
const RESPONSE_STORE_NAME = 'responses';
const MUTATION_STORE_NAME = 'mutations';
const DATABASE_VERSION = 2;
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RESPONSES_PER_SCOPE = 300;

export const getCurrentOfflineCacheScope = async (): Promise<string | null> => {
  const token = localStorage.getItem('autocare_token');
  if (!token || !globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!('indexedDB' in globalThis)) {
    reject(new Error('التخزين المحلي غير متاح في هذا المتصفح'));
    return;
  }

  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(RESPONSE_STORE_NAME)) {
      database.createObjectStore(RESPONSE_STORE_NAME, { keyPath: 'key' });
    }
    if (!database.objectStoreNames.contains(MUTATION_STORE_NAME)) {
      database.createObjectStore(MUTATION_STORE_NAME, { keyPath: 'id' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('تعذر فتح التخزين المحلي'));
});

const withStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(RESPONSE_STORE_NAME, mode);
    const request = action(transaction.objectStore(RESPONSE_STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('تعذر الوصول إلى التخزين المحلي'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('فشلت معاملة التخزين المحلي'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('أُلغيت معاملة التخزين المحلي'));
    };
  });
};

const withMutationStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(MUTATION_STORE_NAME, mode);
    const request = action(transaction.objectStore(MUTATION_STORE_NAME));
    let result!: T;
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error || new Error('تعذر الوصول إلى طابور المزامنة المحلي'));
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('فشلت معاملة طابور المزامنة المحلي'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('أُلغيت معاملة طابور المزامنة المحلي'));
    };
  });
};

const notifyMutationQueueChanged = () => {
  window.dispatchEvent(new CustomEvent('autocare:offline-queue-updated'));
};

export const saveQueuedMutation = async (mutation: QueuedOfflineMutation): Promise<void> => {
  await withMutationStore('readwrite', (store) => store.put(mutation));
  notifyMutationQueueChanged();
};

export const getQueuedMutations = async (scope?: string): Promise<QueuedOfflineMutation[]> => {
  const mutations = await withMutationStore<QueuedOfflineMutation[]>('readonly', (store) => store.getAll());
  return mutations
    .filter((mutation) => !scope || mutation.scope === scope)
    .sort((left, right) => left.createdAt - right.createdAt);
};

export const updateQueuedMutation = async (
  id: string,
  update: Partial<Pick<QueuedOfflineMutation, 'state' | 'updatedAt' | 'lastError'>>,
): Promise<void> => {
  const current = await withMutationStore<QueuedOfflineMutation | undefined>('readonly', (store) => store.get(id));
  if (!current) return;
  await withMutationStore('readwrite', (store) => store.put({ ...current, ...update }));
  notifyMutationQueueChanged();
};

export const deleteQueuedMutation = async (id: string): Promise<void> => {
  await withMutationStore('readwrite', (store) => store.delete(id));
  notifyMutationQueueChanged();
};

export const clearQueuedMutations = async (scope?: string): Promise<void> => {
  const mutations = await getQueuedMutations(scope);
  if (mutations.length === 0) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MUTATION_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MUTATION_STORE_NAME);
    mutations.forEach((mutation) => store.delete(mutation.id));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('تعذر مسح طابور المزامنة المحلي'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('أُلغيت عملية مسح طابور المزامنة المحلي'));
    };
  });
  notifyMutationQueueChanged();
};

export const saveCachedResponse = async (
  scope: string,
  url: string,
  response: Response,
): Promise<void> => {
  if (response.status === 204) return;
  const body = await response.clone().text();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLocaleLowerCase().includes('application/json')) return;

  const record: CachedApiResponse = {
    key: `${scope}:${url}`,
    scope,
    body,
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries()),
    storedAt: Date.now(),
  };
  await withStore('readwrite', (store) => store.put(record));
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RESPONSE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(RESPONSE_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const currentRecords = (request.result as CachedApiResponse[])
        .filter((entry) => entry.scope === scope)
        .sort((left, right) => right.storedAt - left.storedAt);
      currentRecords.forEach((entry, index) => {
        if (entry.storedAt < Date.now() - MAX_CACHE_AGE_MS || index >= MAX_RESPONSES_PER_SCOPE) {
          store.delete(entry.key);
        }
      });
    };
    request.onerror = () => reject(request.error || new Error('تعذر تنظيم التخزين المحلي'));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('تعذر تنظيم التخزين المحلي'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('أُلغيت عملية تنظيم التخزين المحلي'));
    };
  });
  window.dispatchEvent(new CustomEvent('autocare:offline-cache-updated', { detail: { storedAt: record.storedAt } }));
};

export const getCachedResponse = async (
  scope: string,
  url: string,
): Promise<CachedApiResponse | undefined> => {
  const cached = await withStore<CachedApiResponse | undefined>('readonly', (store) => store.get(`${scope}:${url}`));
  return cached && cached.storedAt >= Date.now() - MAX_CACHE_AGE_MS ? cached : undefined;
};

export const getLatestCachedResponseTime = async (scope: string): Promise<number | null> => {
  const records = await withStore<CachedApiResponse[]>('readonly', (store) => store.getAll());
  return records.reduce<number | null>(
    (latest, record) => record.scope === scope
      && record.storedAt >= Date.now() - MAX_CACHE_AGE_MS
      && (latest === null || record.storedAt > latest)
      ? record.storedAt
      : latest,
    null,
  );
};

export const clearCachedResponses = async (scope?: string): Promise<void> => {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RESPONSE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(RESPONSE_STORE_NAME);
    if (scope) {
      const request = store.getAllKeys();
      request.onsuccess = () => request.result
        .filter((key): key is string => typeof key === 'string' && key.startsWith(`${scope}:`))
        .forEach((key) => store.delete(key));
      request.onerror = () => reject(request.error || new Error('تعذر تحديد بيانات التخزين المحلي'));
    } else {
      store.clear();
    }
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('تعذر مسح التخزين المحلي'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('أُلغيت عملية مسح التخزين المحلي'));
    };
  });
};
