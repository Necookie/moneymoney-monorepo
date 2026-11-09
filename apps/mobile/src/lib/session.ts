import type { useClerk } from '@clerk/expo';
import type { QueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { unregisterBackgroundSync } from './backgroundSync';
import { getSyncRuntime, resetLocalData, resumeSync } from './sync/runtime';

/** Meta key: Clerk user id whose data the local database holds. */
const OWNER_KEY = 'ownerUserId';

/**
 * Remove every trace of financial data from the device: local database (incl. unsynced
 * changes), cached queries and scheduled reminders. Sync stays paused afterwards until the
 * next signed-in app tree starts its triggers (or `resumeSync()`).
 */
export async function wipeLocalData(queryClient: QueryClient): Promise<void> {
  // Reset first: it waits for a sync in flight, whose after-sync hooks may schedule reminders.
  await resetLocalData().catch(() => undefined);
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  queryClient.clear();
}

/**
 * Sign out and wipe local data (the caller confirms losing unsynced changes first), plus the
 * background sync registration. Clerk clears its own SecureStore token cache.
 */
export async function signOutEverywhere(
  clerk: ReturnType<typeof useClerk>,
  queryClient: QueryClient,
): Promise<void> {
  await unregisterBackgroundSync().catch(() => undefined);
  await wipeLocalData(queryClient);
  try {
    await clerk.signOut();
  } catch (err) {
    // Still signed in (e.g. offline): let the now-empty app sync again instead of freezing.
    resumeSync();
    throw err;
  }
}

/**
 * Make sure the local database belongs to `userId`. If a different account signs in on this
 * device (e.g. the previous session expired without an explicit sign-out), the previous
 * account's rows, unsynced outbox and caches are wiped so they are neither shown to nor pushed
 * as the new user. Returns true when data was wiped.
 */
export async function claimLocalData(userId: string, queryClient: QueryClient): Promise<boolean> {
  const { storage } = await getSyncRuntime();
  const owner = await storage.getMeta(OWNER_KEY);
  if (owner === userId) return false;
  let wiped = false;
  if (owner !== null) {
    await wipeLocalData(queryClient);
    resumeSync();
    wiped = true;
  }
  await storage.setMeta(OWNER_KEY, userId);
  return wiped;
}
