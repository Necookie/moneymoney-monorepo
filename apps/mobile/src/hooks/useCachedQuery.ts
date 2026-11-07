import { useQuery, type QueryKey } from '@tanstack/react-query';
import { isOfflineError } from '@/lib/api';
import { getSyncRuntime } from '@/lib/sync/runtime';

export interface Cached<T> {
  data: T;
  /** Epoch ms when the server produced this data. */
  fetchedAt: number;
  /** True when the network failed and this is the last saved copy. */
  fromCache: boolean;
}

/**
 * Server data with an offline fallback: successful responses are saved to SQLite; when the
 * request fails because we're offline, the last saved copy is returned (flagged `fromCache`).
 */
export function useCachedQuery<T>(key: QueryKey, fetcher: () => Promise<T>, enabled = true) {
  const cacheKey = JSON.stringify(key);
  return useQuery<Cached<T>>({
    queryKey: key,
    enabled,
    queryFn: async () => {
      const { storage } = await getSyncRuntime();
      try {
        const data = await fetcher();
        const fetchedAt = Date.now();
        await storage.setCache(cacheKey, data, fetchedAt);
        return { data, fetchedAt, fromCache: false };
      } catch (err) {
        if (isOfflineError(err)) {
          const cached = await storage.getCache<T>(cacheKey);
          if (cached) return { ...cached, fromCache: true };
        }
        throw err;
      }
    },
  });
}
