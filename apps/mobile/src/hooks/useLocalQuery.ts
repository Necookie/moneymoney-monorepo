import { useCallback, useEffect, useRef, useState } from 'react';
import type { SqliteStorage } from '@/lib/db/sqliteStorage';
import { useLocalDataVersion } from '@/lib/events';
import { getSyncRuntime } from '@/lib/sync/runtime';

/**
 * Run an async read against the local database; re-runs whenever local data changes
 * (mutations, sync) or `deps` change.
 */
export function useLocalQuery<T>(
  read: (storage: SqliteStorage) => Promise<T>,
  deps: readonly unknown[],
): { data: T | undefined; loading: boolean; error: Error | null; reload: () => void } {
  const version = useLocalDataVersion();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { storage } = await getSyncRuntime();
        const result = await readRef.current(storage);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}
