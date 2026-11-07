import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { getApi } from './api';
import { markHeadless } from './auth';
import { notifyNewCriticalAlerts, rescheduleBillReminders } from './notifications';
import { getSyncRuntime, onAfterSync, syncNow } from './sync/runtime';

export const BACKGROUND_SYNC_TASK = 'moneymoney-background-sync';
/** Minutes. Android's WorkManager floor is 15; the OS decides the exact time. */
const MINIMUM_INTERVAL_MIN = 30;

/**
 * After every sync that pulled fresh data: reschedule bill reminders from the local
 * `upcoming` table and surface new critical alerts. Registered once at module load so it also
 * runs inside the background task.
 */
onAfterSync(async (result, storage) => {
  if (!result.pulled) return;
  await rescheduleBillReminders(storage, await storage.listUpcoming());
  try {
    await notifyNewCriticalAlerts(storage, await getApi().alerts.list('active'));
  } catch {
    // Alerts are best-effort; offline or transient failures are retried on the next sync.
  }
});

// Must be defined at module scope (imported from the root layout) so the OS can find it.
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    // Without the React tree (app not in the foreground) Clerk has to be loaded by us.
    if (AppState.currentState !== 'active') markHeadless();
    await getSyncRuntime();
    const result = await syncNow();
    // Offline is a normal outcome for a background run — not a task failure.
    return result.ok || result.error?.kind === 'offline'
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch (err) {
    console.warn('background sync failed', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<boolean> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
  if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK))) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MIN,
    });
  }
  return true;
}

export async function unregisterBackgroundSync(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  }
}
