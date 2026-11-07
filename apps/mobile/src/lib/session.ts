import type { useClerk } from '@clerk/expo';
import type { QueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { unregisterBackgroundSync } from './backgroundSync';
import { resetLocalData } from './sync/runtime';

/**
 * Sign out and remove every trace of financial data from the device: local database (incl.
 * unsynced changes — the caller confirms that first), cached queries, scheduled reminders and
 * the background sync registration. Clerk clears its own SecureStore token cache.
 */
export async function signOutEverywhere(
  clerk: ReturnType<typeof useClerk>,
  queryClient: QueryClient,
): Promise<void> {
  await unregisterBackgroundSync().catch(() => undefined);
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  await resetLocalData().catch(() => undefined);
  queryClient.clear();
  await clerk.signOut();
}
