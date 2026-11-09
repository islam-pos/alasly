import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import {
  deleteQueuedMutation,
  getCurrentOfflineCacheScope,
  getLatestCachedResponseTime,
  type QueuedOfflineMutation,
} from '../../services/offlineCache';
import { getCurrentUserQueuedMutations, syncQueuedMutations } from '../../services/offlineSync';

export const OfflineStatusBanner = () => {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [lastCachedAt, setLastCachedAt] = useState<number | null>(null);
  const [mutations, setMutations] = useState<QueuedOfflineMutation[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const refreshOfflineState = useCallback(async () => {
    try {
      const [scope, queuedMutations] = await Promise.all([
        getCurrentOfflineCacheScope(),
        getCurrentUserQueuedMutations(),
      ]);
      setLastCachedAt(scope ? await getLatestCachedResponseTime(scope) : null);
      setMutations(queuedMutations);
    } catch (error) {
      console.error('Could not load offline data and sync status:', error);
    }
  }, []);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleCacheUpdate = () => void refreshOfflineState();
    const handleQueueUpdate = () => {
      void refreshOfflineState().then(() => syncQueuedMutations()
        .catch((error) => console.error('Could not sync offline operations:', error))
        .finally(refreshOfflineState));
    };
    const handleOnlineSync = () => {
      setIsOnline(true);
      void syncQueuedMutations()
        .catch((error) => console.error('Could not sync offline operations:', error))
        .finally(refreshOfflineState);
    };

    window.addEventListener('online', handleOnlineSync);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('autocare:offline-cache-updated', handleCacheUpdate);
    window.addEventListener('autocare:offline-cache-hit', handleCacheUpdate);
    window.addEventListener('autocare:offline-queue-updated', handleQueueUpdate);
    window.addEventListener('autocare:offline-sync-complete', handleCacheUpdate);
    void refreshOfflineState().then(() => syncQueuedMutations()
      .catch((error) => console.error('Could not sync offline operations:', error))
      .finally(refreshOfflineState));
    return () => {
      window.removeEventListener('online', handleOnlineSync);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('autocare:offline-cache-updated', handleCacheUpdate);
      window.removeEventListener('autocare:offline-cache-hit', handleCacheUpdate);
      window.removeEventListener('autocare:offline-queue-updated', handleQueueUpdate);
      window.removeEventListener('autocare:offline-sync-complete', handleCacheUpdate);
    };
  }, [refreshOfflineState]);

  const handleManualSync = async (mutation: QueuedOfflineMutation) => {
    const accepted = window.confirm(
      'راجع أحدث بيانات هذا السجل على الخادم أولاً. قد يؤدي إرسال تعديل قديم إلى استبدال بيانات أحدث، ولا يستطيع النظام اكتشاف التعارض تلقائياً في جميع الشاشات. هل تريد إرسال هذه العملية الآن؟',
    );
    if (!accepted) return;

    setSyncingId(mutation.id);
    try {
      await syncQueuedMutations({ includeReview: true, mutationId: mutation.id });
    } finally {
      setSyncingId(null);
      await refreshOfflineState();
    }
  };

  const handleRemoveFromDevice = async (mutation: QueuedOfflineMutation) => {
    const accepted = window.confirm(
      'سيؤدي هذا إلى إزالة العملية من قائمة هذا الجهاز فقط، ولن يلغيها إذا كان الخادم قد نفذها بالفعل. تحقق من حالة السجل على الخادم أولاً. هل تريد الإزالة؟',
    );
    if (!accepted) return;
    await deleteQueuedMutation(mutation.id);
    await refreshOfflineState();
  };

  if (isOnline && mutations.length === 0) return null;

  return (
    <div
      role="status"
      className={`mx-auto mt-3 max-w-[1700px] rounded-xl border px-4 py-3 text-sm ${
        isOnline
          ? 'border-sky-300 bg-sky-50 text-sky-950'
          : 'border-amber-300 bg-amber-50 text-amber-950'
      }`}
    >
      <div className="flex items-start gap-2">
        {isOnline ? <CloudUpload className="mt-0.5 h-4 w-4 shrink-0" /> : <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />}
      <div>
        <p className="font-bold">
          {isOnline ? 'حالة المزامنة' : 'أنت تعمل دون اتصال — وضع القراءة والعمليات المحفوظة محلياً'}
        </p>
        {!isOnline && (
          <p className="mt-0.5 text-xs">
            تُعرض البيانات التي سبق تحميلها. بعض عمليات الإنشاء تُحفظ لإرسالها تلقائياً؛ أما التعديلات والعمليات الحساسة فتحتاج مراجعتك.
            {lastCachedAt && <> آخر تحديث محفوظ: {new Date(lastCachedAt).toLocaleString('ar-EG')}.</>}
          </p>
        )}
        {mutations.length > 0 && (
          <div className="mt-3 space-y-3">
            <p className="text-xs font-semibold">
              {mutations.length} عملية محفوظة على هذا الجهاز ولم تكتمل مزامنتها بعد.
            </p>
            <ul className="space-y-2">
              {mutations.map((mutation) => (
                <li key={mutation.id} className="rounded-lg border border-current/15 bg-white/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {mutation.method} {new URL(mutation.url).pathname}
                        {mutation.autoSync && mutation.state === 'queued' ? ' — ستتم مزامنتها تلقائياً' : ' — تتطلب مراجعة'}
                      </p>
                      <p className="mt-1 text-xs">{new Date(mutation.createdAt).toLocaleString('ar-EG')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isOnline && mutation.state !== 'syncing' && (!mutation.autoSync || mutation.state !== 'queued') && (
                        <button
                          type="button"
                          disabled={syncingId === mutation.id}
                          onClick={() => void handleManualSync(mutation)}
                          className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${syncingId === mutation.id ? 'animate-spin' : ''}`} />
                          راجع وأرسل
                        </button>
                      )}
                      {mutation.state === 'needs_review' && (
                        <button
                          type="button"
                          onClick={() => void handleRemoveFromDevice(mutation)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"
                        >
                          إزالة بعد التحقق
                        </button>
                      )}
                    </div>
                  </div>
                  {mutation.lastError && (
                    <p className="mt-2 flex items-start gap-1 text-xs text-rose-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {mutation.lastError}
                    </p>
                  )}
                  {!mutation.autoSync && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer font-semibold">عرض تفاصيل العملية قبل المراجعة</summary>
                      <pre dir="ltr" className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-left">
                        {mutation.body || '(بدون بيانات)'}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
