import { useSyncExternalStore } from 'react';

/**
 * A tiny change counter for local data. Mutations and sync runs bump it; screens that read
 * SQLite subscribe and re-query. (Server-only data uses TanStack Query instead.)
 */
let version = 0;
const listeners = new Set<() => void>();

export function bumpLocalData(): void {
  version++;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLocalDataVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
}
