import { useClerk } from '@clerk/expo';
import { toDecimalString } from '@mm/finance-engine';
import { DEFAULT_APP_FEATURES, type AppFeature, type AppFeatures } from '@mm/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { openDownload, useAppUpdate } from '@/lib/updates';
import * as BackgroundTask from 'expo-background-task';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { describeSync } from '@/components/SyncIndicator';
import { Banner, Button, Card, Divider, Field, Label, Row, Text, Toggle } from '@/components/ui';
import { useCachedQuery } from '@/hooks/useCachedQuery';
import { useLocalSettings } from '@/hooks/useLocalData';
import { errorMessage, getApi } from '@/lib/api';
import {
  authenticate,
  getLockCapability,
  isLockEnabled,
  setLockEnabled,
  type LockCapability,
} from '@/lib/biometrics';
import { formatMoney, timeAgo, tryParseMoney } from '@/lib/format';
import * as Notif from '@/lib/notifications';
import { signOutEverywhere } from '@/lib/session';
import { getSyncRuntime, syncNow, useSyncStatus } from '@/lib/sync/runtime';

const FEATURE_KEYS: AppFeature[] = [
  'calendar',
  'forecast',
  'afford',
  'budgets',
  'goals',
  'accounts',
  'insights',
];

const FEATURE_METADATA: Record<AppFeature, { title: string; body: string }> = {
  calendar: {
    title: 'Financial Calendar',
    body: 'Plan future bills, salary, and recurring expense schedules.',
  },
  forecast: {
    title: 'Cash Flow Forecast',
    body: 'Explore projected balances and what-if scenarios.',
  },
  afford: {
    title: 'Can I afford this?',
    body: 'Check planned purchases against upcoming obligations.',
  },
  budgets: {
    title: 'Budgets',
    body: 'Monthly spending limits and daily spending allowances.',
  },
  goals: {
    title: 'Goals',
    body: 'Track savings targets and safeguard your emergency reserve.',
  },
  accounts: {
    title: 'Accounts',
    body: 'View account balances and manage financial accounts.',
  },
  insights: {
    title: 'Insights',
    body: 'Spending pace warnings and automated financial health alerts.',
  },
};

function SettingRow({
  title,
  body,
  value,
  onChange,
  disabled,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Row className="min-h-16 gap-4 py-2">
      <View className="flex-1 gap-0.5">
        <Text weight="medium">{title}</Text>
        <Text className="text-sm text-muted">{body}</Text>
      </View>
      <Toggle value={value} onChange={onChange} disabled={disabled} label={title} />
    </Row>
  );
}

export default function SettingsScreen() {
  const clerk = useClerk();
  const qc = useQueryClient();
  const status = useSyncStatus();
  const sync = describeSync(status);
  const settings = useLocalSettings();
  const me = useCachedQuery(['me'], () => getApi().me());

  const [lockOn, setLockOn] = useState(false);
  const [cap, setCap] = useState<LockCapability | null>(null);
  const [notifOn, setNotifOn] = useState(false);
  const [notifPerm, setNotifPerm] = useState<Notif.PermissionState>('undetermined');
  const [bgStatus, setBgStatus] = useState<string>('…');
  const [buffer, setBuffer] = useState('');
  const [syncing, setSyncing] = useState(false);

  const [localFeatures, setLocalFeatures] = useState<AppFeatures>(() => ({
    ...DEFAULT_APP_FEATURES,
    ...(settings.data?.features ?? {}),
  }));

  useEffect(() => {
    if (settings.data?.features) {
      setLocalFeatures({ ...DEFAULT_APP_FEATURES, ...settings.data.features });
    }
  }, [settings.data?.features]);

  const toggleFeature = async (feature: AppFeature, next: boolean) => {
    const previous = localFeatures;
    const updated = { ...localFeatures, [feature]: next };
    setLocalFeatures(updated);
    try {
      await getApi().settings.update({ features: { [feature]: next } });
      await syncNow({ force: true }).catch(() => undefined);
      await qc.invalidateQueries();
    } catch (err) {
      setLocalFeatures(previous);
      Alert.alert('Could not update feature', errorMessage(err));
    }
  };

  useEffect(() => {
    (async () => {
      setLockOn(await isLockEnabled());
      setCap(await getLockCapability());
      const { storage } = await getSyncRuntime();
      setNotifOn(await Notif.isEnabled(storage));
      setNotifPerm(await Notif.getPermission());
      const bg = await BackgroundTask.getStatusAsync();
      setBgStatus(
        bg === BackgroundTask.BackgroundTaskStatus.Available
          ? 'On (the OS decides when it runs)'
          : 'Restricted by the system',
      );
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (settings.data) setBuffer(toDecimalString(settings.data.safetyBuffer));
  }, [settings.data]);

  const toggleLock = async (next: boolean) => {
    if (next) {
      const res = await authenticate('Confirm to turn on app lock');
      if (!res.success) return;
    }
    await setLockEnabled(next);
    setLockOn(next);
  };

  const toggleNotifications = async (next: boolean) => {
    const { storage } = await getSyncRuntime();
    if (next) {
      const perm = await Notif.requestPermission();
      setNotifPerm(perm);
      if (perm !== 'granted') {
        Alert.alert(
          'Notifications are off',
          'Allow notifications for Money Money in Android settings to get bill reminders.',
        );
        return;
      }
      await Notif.setEnabled(storage, true);
      await Notif.rescheduleBillReminders(storage, await storage.listUpcoming());
    } else {
      await Notif.setEnabled(storage, false);
    }
    setNotifOn(next);
  };

  const saveBuffer = useMutation({
    mutationFn: async () => {
      const value = tryParseMoney(buffer);
      if (value === null || value < 0) throw new Error('Enter a valid amount (0 or more).');
      return getApi().settings.update({ safetyBuffer: value });
    },
    onSuccess: async () => {
      await syncNow({ force: true }).catch(() => undefined);
      await qc.invalidateQueries();
    },
  });

  const demo = useMutation({
    mutationFn: async (action: 'load' | 'clear') =>
      action === 'load' ? getApi().demo.load() : getApi().demo.clear(),
    onSuccess: async () => {
      await syncNow({ force: true }).catch(() => undefined);
      await qc.invalidateQueries();
    },
  });

  const confirmDemo = (action: 'load' | 'clear') =>
    Alert.alert(
      action === 'load' ? 'Load demo data?' : 'Remove demo data?',
      action === 'load'
        ? 'Adds sample accounts, transactions and plans so you can explore. A "Demo data" banner stays visible until you remove it.'
        : 'Deletes all demo accounts, transactions and plans. Your own data is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'load' ? 'Load' : 'Remove',
          style: action === 'clear' ? 'destructive' : 'default',
          onPress: () => demo.mutate(action),
        },
      ],
    );

  const confirmSignOut = () => {
    const unsynced = status.pending + status.failed;
    Alert.alert(
      'Sign out?',
      unsynced
        ? `${unsynced} change${unsynced === 1 ? ' has' : 's have'} not synced and will be lost. Connect and sync first to keep ${unsynced === 1 ? 'it' : 'them'}.`
        : 'All Money Money data will be removed from this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => signOutEverywhere(clerk, qc).catch(() => undefined),
        },
      ],
    );
  };

  return (
    <Screen title="Settings" back>
      <Label className="px-1 pt-2">Sync</Label>
      <Card className="gap-2">
        <Row className="justify-between">
          <Text weight="semibold">{sync.label}</Text>
          <Text className="text-sm text-muted">Last synced {timeAgo(status.lastSyncedAt)}</Text>
        </Row>
        <Text className="text-sm text-muted">
          {status.pending} pending · {status.failed} failed · {status.online ? 'online' : 'offline'}
        </Text>
        {status.lastError ? (
          <Text className="text-sm text-warning">Last problem: {status.lastError.message}</Text>
        ) : null}
        <Text className="text-sm text-muted">Background sync: {bgStatus}</Text>
        <Button
          label="Sync now"
          variant="dark"
          icon="refresh"
          loading={syncing}
          onPress={async () => {
            setSyncing(true);
            try {
              await syncNow({ force: true });
              await qc.invalidateQueries();
            } finally {
              setSyncing(false);
            }
          }}
        />
        {status.failed ? (
          <Button
            label="Review failed changes"
            variant="secondary"
            onPress={() => router.navigate('/activity')}
          />
        ) : null}
      </Card>

      <Label className="px-1 pt-2">Features</Label>
      <Card className="gap-0 py-1">
        {FEATURE_KEYS.map((key, i) => {
          const meta = FEATURE_METADATA[key];
          const enabled = localFeatures[key];
          return (
            <View key={key}>
              {i > 0 ? <Divider /> : null}
              <SettingRow
                title={meta.title}
                body={meta.body}
                value={enabled}
                onChange={(next) => void toggleFeature(key, next)}
              />
            </View>
          );
        })}
      </Card>

      <Label className="px-1 pt-2">Security & alerts</Label>
      <Card className="gap-0 py-1">
        <SettingRow
          title="App lock"
          body={
            cap && !cap.anyCredential
              ? 'Set up a screen lock (PIN, pattern or biometrics) on this phone to use app lock.'
              : `Require ${cap?.label ?? 'biometrics'} (or your device PIN) when opening the app or after 60 seconds away.`
          }
          value={lockOn}
          onChange={toggleLock}
          disabled={!!cap && !cap.anyCredential}
        />
        <Divider />
        <SettingRow
          title="Bill reminders"
          body={
            notifPerm === 'denied'
              ? 'Blocked in Android settings. Allow notifications there to turn this on.'
              : 'Local notification at 9:00 AM the day before planned payments, plus new critical alerts. Remote push is not used.'
          }
          value={notifOn}
          onChange={toggleNotifications}
          disabled={notifPerm === 'denied'}
        />
      </Card>

      <Label className="px-1 pt-2">Safety buffer</Label>
      <Card className="gap-2">
        <Text className="text-sm text-muted">
          Money kept aside when calculating Safe to spend
          {settings.data ? ` (now ${formatMoney(settings.data.safetyBuffer)})` : ''}.
        </Text>
        <Field
          value={buffer}
          onChangeText={setBuffer}
          keyboardType="decimal-pad"
          placeholder="0.00"
          accessibilityLabel="Safety buffer in pesos"
        />
        {saveBuffer.error ? (
          <Text className="text-sm text-negative">{errorMessage(saveBuffer.error)}</Text>
        ) : null}
        {saveBuffer.isSuccess ? <Text className="text-sm text-positive">Saved.</Text> : null}
        <Button
          label="Save buffer"
          variant="secondary"
          loading={saveBuffer.isPending}
          onPress={() => saveBuffer.mutate()}
        />
      </Card>

      <Label className="px-1 pt-2">Demo data</Label>
      <Card className="gap-2">
        {settings.data?.demoMode ? (
          <>
            <Banner
              tone="neutral"
              icon="info"
              title="Demo data is loaded"
              body="Figures include sample data, not just your own."
            />
            <Button
              label="Remove demo data"
              variant="danger"
              loading={demo.isPending}
              onPress={() => confirmDemo('clear')}
            />
          </>
        ) : (
          <>
            <Text className="text-sm text-muted">
              Explore the app with realistic sample data. You can remove it any time.
            </Text>
            <Button
              label="Load demo data"
              variant="secondary"
              loading={demo.isPending}
              onPress={() => confirmDemo('load')}
            />
          </>
        )}
        {demo.error ? (
          <Text className="text-sm text-negative">{errorMessage(demo.error)}</Text>
        ) : null}
      </Card>

      <Label className="px-1 pt-2">Account</Label>
      <Card className="gap-2">
        <Text>
          {me.data?.data.email ?? clerk.user?.primaryEmailAddress?.emailAddress ?? 'Signed in'}
        </Text>
        <Text className="text-sm text-muted">
          Timezone {settings.data?.timezone ?? 'Asia/Manila'} · {settings.data?.currency ?? 'PHP'}
        </Text>
        <Button label="Sign out" variant="danger" icon="log-out" onPress={confirmSignOut} />
      </Card>

      <AppVersionCard />

      <Text className="pt-2 text-center text-xs text-muted">
        Money Money {Application.nativeApplicationVersion ?? ''} (
        {Application.nativeBuildVersion ?? 'dev'})
      </Text>
    </Screen>
  );
}

function AppVersionCard() {
  const { installed, latest, update, checking, error, recheck } = useAppUpdate();
  return (
    <>
      <Label className="px-1 pt-2">App version</Label>
      <Card className="gap-2">
        <Text weight="semibold">Installed {installed ?? 'development build'}</Text>
        <Text className="text-sm text-muted">
          {update
            ? `Version ${update.version} is available.`
            : error
              ? 'Could not check for updates (offline?).'
              : latest
                ? 'You have the latest version.'
                : checking
                  ? 'Checking for updates…'
                  : 'No published Android release found.'}
        </Text>
        {update ? (
          <Button
            label={`Download ${update.version}`}
            variant="primary"
            icon="arrow-down-left"
            onPress={() => openDownload(update)}
          />
        ) : (
          <Button
            label={checking ? 'Checking…' : 'Check for updates'}
            variant="secondary"
            icon="refresh"
            disabled={checking}
            onPress={() => void recheck()}
          />
        )}
      </Card>
    </>
  );
}
