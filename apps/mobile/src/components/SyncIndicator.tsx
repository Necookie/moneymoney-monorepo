import { Pressable, View } from 'react-native';
import { colors } from '@/lib/theme';
import { syncNow, useSyncStatus, type SyncStatus } from '@/lib/sync/runtime';
import { Icon, type IconName } from './Icon';
import { Text } from './ui';

export interface SyncDisplay {
  label: string;
  icon: IconName;
  tone: 'positive' | 'warning' | 'negative' | 'muted';
}

/** One honest summary of the sync state. Never says "Synced" while anything is unacknowledged. */
export function describeSync(s: SyncStatus): SyncDisplay {
  if (!s.online) {
    return {
      label: s.pending ? `Offline · ${s.pending} pending` : 'Offline',
      icon: 'offline',
      tone: 'muted',
    };
  }
  if (s.running) return { label: 'Syncing…', icon: 'refresh', tone: 'muted' };
  if (s.failed) return { label: `Failed ${s.failed}`, icon: 'circle-alert', tone: 'negative' };
  if (s.lastError?.kind === 'forbidden') {
    return { label: 'Access denied', icon: 'lock', tone: 'negative' };
  }
  if (s.lastError?.kind === 'auth')
    return { label: 'Sign in again', icon: 'lock', tone: 'warning' };
  if (s.pending) return { label: `Pending ${s.pending}`, icon: 'cloud-upload', tone: 'warning' };
  if (s.lastError) return { label: 'Sync delayed', icon: 'clock', tone: 'warning' };
  if (!s.lastSyncedAt) return { label: 'Not synced yet', icon: 'clock', tone: 'muted' };
  return { label: 'Synced', icon: 'circle-check', tone: 'positive' };
}

const TONE = {
  positive: { color: colors.positive, box: 'bg-positive-soft' },
  warning: { color: colors.warning, box: 'bg-warning-soft' },
  negative: { color: colors.negative, box: 'bg-negative-soft' },
  muted: { color: colors.muted, box: 'bg-hover' },
} as const;

export function SyncIndicator() {
  const status = useSyncStatus();
  const d = describeSync(status);
  const tone = TONE[d.tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${d.label}. Tap to sync now.`}
      onPress={() => {
        syncNow({ force: true }).catch(() => undefined);
      }}
      hitSlop={8}
      className={`min-h-9 flex-row items-center gap-1.5 rounded-full px-3 ${tone.box}`}
    >
      <Icon name={d.icon} size={14} color={tone.color} strokeWidth={2} />
      <View>
        <Text weight="medium" className="text-xs" style={{ color: tone.color }}>
          {d.label}
        </Text>
      </View>
    </Pressable>
  );
}
