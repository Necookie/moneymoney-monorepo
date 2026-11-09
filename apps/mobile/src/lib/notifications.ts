import type { Alert, OccurrenceDto } from '@mm/api-client';
import { formatDate, formatMoney } from '@mm/finance-engine';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { SqliteStorage } from './db/sqliteStorage';
import { createMutex } from './sync/mutex';

/**
 * Local notifications only (no remote push):
 * - bill / planned-outflow reminders at 09:00 Manila time the day before, rescheduled after
 *   every pull and deduplicated by occurrence key;
 * - one notification per newly seen critical alert.
 */

export const BILLS_CHANNEL = 'bills';
export const ALERTS_CHANNEL = 'alerts';
const ENABLED_KEY = 'notificationsEnabled';
const NOTIFIED_ALERTS_KEY = 'notifiedCriticalAlerts';
const MAX_SCHEDULED = 60;
/** Asia/Manila is UTC+8 all year (no DST). */
const MANILA_OFFSET_HOURS = 8;

/**
 * Scheduling diffs against the `scheduled_notifications` table, so two overlapping runs (a sync
 * finishing while reminders are switched on) would both schedule the same reminder. Serialise.
 */
const scheduling = createMutex();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(BILLS_CHANNEL, {
    name: 'Upcoming bills & planned payments',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL, {
    name: 'Critical money alerts',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** Ask only in context (user turned reminders on). Channels must exist first on Android 13+. */
export async function requestPermission(): Promise<PermissionState> {
  await ensureChannels();
  const p = await Notifications.requestPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function isEnabled(storage: SqliteStorage): Promise<boolean> {
  return (await storage.getMeta(ENABLED_KEY)) === '1';
}

export async function setEnabled(storage: SqliteStorage, enabled: boolean): Promise<void> {
  await storage.setMeta(ENABLED_KEY, enabled ? '1' : null);
  if (!enabled) await scheduling(() => cancelAllReminders(storage));
}

/** Epoch ms for 09:00 Manila time on the day before `date` (YYYY-MM-DD). */
export function reminderTime(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d - 1, 9 - MANILA_OFFSET_HOURS, 0, 0);
}

function reminderKey(o: OccurrenceDto): string {
  // Amount and date are part of the key: a change cancels the old reminder and schedules anew.
  return `bill:${o.eventId}:${o.originalDate}:${o.date}:${o.amount}`;
}

async function cancelAllReminders(storage: SqliteStorage) {
  const rows = await storage.db.getAllAsync<{ key: string; notification_id: string }>(
    'SELECT key, notification_id FROM scheduled_notifications',
  );
  for (const r of rows) {
    await Notifications.cancelScheduledNotificationAsync(r.notification_id).catch(() => undefined);
  }
  await storage.db.runAsync('DELETE FROM scheduled_notifications');
}

/** Diff desired reminders against what is scheduled; only touch what changed. */
export function rescheduleBillReminders(
  storage: SqliteStorage,
  upcoming: OccurrenceDto[],
  now = Date.now(),
): Promise<void> {
  return scheduling(() => reschedule(storage, upcoming, now));
}

async function reschedule(
  storage: SqliteStorage,
  upcoming: OccurrenceDto[],
  now: number,
): Promise<void> {
  if (!(await isEnabled(storage)) || (await getPermission()) !== 'granted') return;
  await ensureChannels();

  const desired = new Map<string, { occurrence: OccurrenceDto; fireAt: number }>();
  for (const o of upcoming) {
    if (o.direction !== 'outflow' || o.settled || o.skipped || o.status === 'cancelled') continue;
    const fireAt = reminderTime(o.date);
    if (fireAt <= now) continue;
    desired.set(reminderKey(o), { occurrence: o, fireAt });
    if (desired.size >= MAX_SCHEDULED) break;
  }

  const existing = await storage.db.getAllAsync<{ key: string; notification_id: string }>(
    'SELECT key, notification_id FROM scheduled_notifications',
  );
  for (const row of existing) {
    if (!desired.has(row.key)) {
      await Notifications.cancelScheduledNotificationAsync(row.notification_id).catch(
        () => undefined,
      );
      await storage.db.runAsync('DELETE FROM scheduled_notifications WHERE key = ?', row.key);
    } else {
      desired.delete(row.key); // already scheduled, unchanged
    }
  }

  for (const [key, { occurrence: o, fireAt }] of desired) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Due tomorrow: ${o.name}`,
        body: `${formatMoney(o.amount)} planned for ${formatDate(o.date, false)}. Planned — not yet paid.`,
        data: { url: '/plan', eventId: o.eventId, occurrenceDate: o.originalDate },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: BILLS_CHANNEL,
      },
    });
    await storage.db.runAsync(
      'INSERT OR REPLACE INTO scheduled_notifications (key, notification_id, fire_at) VALUES (?, ?, ?)',
      key,
      id,
      fireAt,
    );
  }
}

/** Notify once per critical alert id. */
export function notifyNewCriticalAlerts(storage: SqliteStorage, alerts: Alert[]): Promise<void> {
  return scheduling(() => notifyAlerts(storage, alerts));
}

async function notifyAlerts(storage: SqliteStorage, alerts: Alert[]): Promise<void> {
  if (!(await isEnabled(storage)) || (await getPermission()) !== 'granted') return;
  const seen = new Set<string>(JSON.parse((await storage.getMeta(NOTIFIED_ALERTS_KEY)) ?? '[]'));
  const critical = alerts.filter((a) => a.severity === 'critical' && a.status === 'active');
  let changed = false;
  for (const a of critical) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    changed = true;
    await Notifications.scheduleNotificationAsync({
      content: { title: a.title, body: a.reason, data: { url: '/insights', alertId: a.id } },
      trigger: { channelId: ALERTS_CHANNEL },
    });
  }
  if (changed) {
    // Keep only ids that are still active so the list cannot grow without bound.
    const active = new Set(critical.map((a) => a.id));
    await storage.setMeta(
      NOTIFIED_ALERTS_KEY,
      JSON.stringify([...seen].filter((id) => active.has(id))),
    );
  }
}
