import { useAuth, useClerk } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Button, Text } from '@/components/ui';
import { registerBackgroundSync } from '@/lib/backgroundSync';
import { authenticate, getLockCapability, isLockEnabled } from '@/lib/biometrics';
import { signOutEverywhere } from '@/lib/session';
import {
  onAfterSync,
  requestSync,
  startSyncTriggers,
  syncNow,
  useSyncStatus,
} from '@/lib/sync/runtime';
import { colors } from '@/lib/theme';

const RELOCK_AFTER_MS = 60_000;

/** Biometric / device-credential lock on launch and after 60 s in the background. */
function useAppLock() {
  const [locked, setLocked] = useState<boolean | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    isLockEnabled()
      .then((on) => setLocked(on))
      .catch(() => setLocked(false));
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away >= RELOCK_AFTER_MS && (await isLockEnabled())) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  return { locked, unlock: () => setLocked(false) };
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [label, setLabel] = useState('Unlock');

  const attempt = async () => {
    setMessage(null);
    const cap = await getLockCapability();
    if (!cap.anyCredential) {
      // No PIN/biometrics on the device any more: the lock can't be enforced.
      setMessage('No screen lock is set up on this device, so the app lock was skipped.');
      onUnlock();
      return;
    }
    const res = await authenticate();
    if (res.success) onUnlock();
    else if (res.error !== 'user_cancel' && res.error !== 'system_cancel') {
      setMessage(
        res.error === 'lockout'
          ? 'Too many attempts. Try again shortly.'
          : 'Not recognised. Try again.',
      );
    }
  };

  useEffect(() => {
    getLockCapability()
      .then((c) => setLabel(`Unlock with ${c.label}`))
      .catch(() => undefined);
    attempt().catch(() => undefined);
  }, []);

  return (
    <SafeAreaView className="flex-1 items-center justify-center gap-6 bg-ink px-8">
      <Icon name="lock" size={36} color={colors.accent} />
      <Text weight="bold" className="text-3xl text-canvas">
        money money
        <Text weight="bold" className="text-3xl text-accent">
          .
        </Text>
      </Text>
      <Text className="text-center text-subtle">Locked to keep your finances private.</Text>
      <Button
        label={label}
        variant="primary"
        size="lg"
        className="self-stretch"
        onPress={attempt}
      />
      {message ? <Text className="text-center text-sm text-subtle">{message}</Text> : null}
    </SafeAreaView>
  );
}

function PrivateInstance() {
  const clerk = useClerk();
  const qc = useQueryClient();
  return (
    <SafeAreaView className="flex-1 justify-center gap-4 bg-canvas px-6">
      <Icon name="lock" size={32} />
      <Text weight="bold" className="text-2xl">
        This Money Money instance is private
      </Text>
      <Text className="text-muted">
        You signed in successfully, but this account isn&apos;t on the owner allow-list, so the
        server refused access (403). No data was loaded. Sign out and use the owner&apos;s account.
      </Text>
      <Button
        label="Try again"
        variant="secondary"
        onPress={() => syncNow({ force: true }).catch(() => undefined)}
      />
      <Button label="Sign out" variant="dark" onPress={() => signOutEverywhere(clerk, qc)} />
    </SafeAreaView>
  );
}

export default function AppLayout() {
  const { locked, unlock } = useAppLock();
  const status = useSyncStatus();
  const { isLoaded } = useAuth();
  const queryClient = useQueryClient();

  // The app can open offline before Clerk has loaded; sync as soon as the session is available.
  useEffect(() => {
    if (isLoaded) requestSync(0);
  }, [isLoaded]);

  // Server-computed screens (dashboard, forecast, budgets…) refresh after each successful pull.
  useEffect(
    () =>
      onAfterSync((result) => {
        // The update check keeps its own 6-hour schedule; don't re-fetch it on every pull.
        if (result.pulled)
          queryClient
            .invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'android-update' })
            .catch(() => undefined);
      }),
    [queryClient],
  );

  useEffect(() => {
    const stop = startSyncTriggers();
    registerBackgroundSync().catch((err: unknown) =>
      console.warn('background sync unavailable', err),
    );
    // Open the relevant screen when a reminder/alert notification is tapped.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (url === '/plan' || url === '/insights') router.push(url);
    });
    return () => {
      stop();
      sub.remove();
    };
  }, []);

  if (locked === null) return <View className="flex-1 bg-ink" />;
  if (locked) return <LockScreen onUnlock={unlock} />;
  if (status.lastError?.kind === 'forbidden') return <PrivateInstance />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="quick-add"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="plan-new"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  );
}
