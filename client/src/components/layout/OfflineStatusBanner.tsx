import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { getCurrentOfflineCacheScope, getLatestCachedResponseTime } from '../../services/offlineCache';

export const OfflineStatusBanner = () => {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [lastCachedAt, setLastCachedAt] = useState<number | null>(null);

  useEffect(() => {
    const updateCacheTime = async () => {
      try {
        const scope = await getCurrentOfflineCacheScope();
        setLastCachedAt(scope ? await getLatestCachedResponseTime(scope) : null);
      } catch (error) {
        console.error('Could not load offline cache status:', error);
      }
    };
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      void updateCacheTime();
    };
    const handleCacheUpdate = () => void updateCacheTime();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('autocare:offline-cache-updated', handleCacheUpdate);
    window.addEventListener('autocare:offline-cache-hit', handleCacheUpdate);
    if (!navigator.onLine) void updateCacheTime();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('autocare:offline-cache-updated', handleCacheUpdate);
      window.removeEventListener('autocare:offline-cache-hit', handleCacheUpdate);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div role="status" className="mx-auto mt-3 flex max-w-[1700px] items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-bold">أنت تعمل دون اتصال — وضع القراءة فقط</p>
        <p className="mt-0.5 text-xs">
          تُعرض فقط البيانات التي سبق تحميلها على هذا الجهاز. لن تُحفظ العمليات الجديدة دون اتصال.
          {lastCachedAt && <> آخر تحديث محفوظ: {new Date(lastCachedAt).toLocaleString('ar-EG')}.</>}
        </p>
      </div>
    </div>
  );
};
