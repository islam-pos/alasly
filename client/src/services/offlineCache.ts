export interface CachedApiResponse {
  key: string;
  scope: string;
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  storedAt: number;
}

const DATABASE_NAME = 'autocare-offline';
const STORE_NAME = 'responses';
const DATABASE_VERSION = 1;
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
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'key' });
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
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
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
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
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
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
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
