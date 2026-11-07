import type { Category, OccurrenceDto, Settings } from '@mm/api-client';
import { withLocalBalances, type AccountWithLocal } from '@/lib/sync/balances';
import { META } from '@/lib/sync/types';
import { useLocalQuery } from './useLocalQuery';

export interface LocalAccounts {
  accounts: AccountWithLocal[];
  /** Rows whose effect is not yet in the server balances. */
  unsyncedCount: number;
  /** Net position (sum of signed balances incl. unsynced changes). */
  net: number;
}

/** Accounts from the last pull + local unsynced deltas (works offline). */
export function useLocalAccounts() {
  return useLocalQuery<LocalAccounts>(async (storage) => {
    const [accounts, rows] = await Promise.all([
      storage.listAccounts(),
      storage.listTransactions(),
    ]);
    return withLocalBalances(accounts, rows);
  }, []);
}

export function useLocalCategories() {
  return useLocalQuery<Category[]>((storage) => storage.listCategories(), []);
}

export function useLocalUpcoming() {
  return useLocalQuery<OccurrenceDto[]>((storage) => storage.listUpcoming(), []);
}

/** Settings as of the last pull (null before the first sync). */
export function useLocalSettings() {
  return useLocalQuery<Settings | null>(async (storage) => {
    const raw = await storage.getMeta(META.settings);
    return raw ? (JSON.parse(raw) as Settings) : null;
  }, []);
}
