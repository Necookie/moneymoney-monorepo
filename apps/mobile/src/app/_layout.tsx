import '../../global.css';
// Defines the background sync task + after-sync hooks at startup (must run at module scope).
import '@/lib/backgroundSync';

import { ClerkProvider, useAuth } from '@clerk/expo';
import { resourceCache } from '@clerk/expo/resource-cache';
import { tokenCache } from '@clerk/expo/token-cache';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { isOfflineError } from '@/lib/api';
import { config, isConfigured } from '@/lib/config';
import { claimLocalData } from '@/lib/session';
import { getSyncRuntime } from '@/lib/sync/runtime';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      // Offline/private-instance errors won't fix themselves by hammering the API.
      retry: (count, err) =>
        count < 2 && !isOfflineError(err) && (err as { status?: number }).status !== 403,
    },
  },
});

/** Remember that this device had a signed-in session, so the app can open offline. */
const SESSION_HINT = 'hadSession';

function RootNavigator() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const [hint, setHint] = useState<boolean | null>(null);
  const [waited, setWaited] = useState(false);
  /** Signed-in user whose ownership of the local database has been checked. */
  const [claimedBy, setClaimedBy] = useState<string | null>(null);
  const shown = useRef(false);
  const appShown = useRef(false);

  useEffect(() => {
    getSyncRuntime()
      .then((rt) => rt.storage.getMeta(SESSION_HINT))
      .then((v) => setHint(v === '1'))
      .catch(() => setHint(false));
    // If Clerk can't load (offline), don't block a previously signed-in user forever.
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      // Another account's leftovers (e.g. an expired session never signed out) must be wiped
      // before the app shows or syncs anything.
      if (isSignedIn && userId) await claimLocalData(userId, queryClient).catch(() => false);
      const rt = await getSyncRuntime();
      await rt.storage.setMeta(SESSION_HINT, isSignedIn ? '1' : null);
    })()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setClaimedBy(isSignedIn && userId ? userId : null);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, queryClient]);

  const offlineSignedIn = !isLoaded && waited && hint === true;
  // While the ownership check runs, keep whatever is on screen: the app tree if it was already
  // open offline (same cached session), the sign-in screen right after signing in, or the
  // splash on a cold start.
  const claiming = isLoaded && !!isSignedIn && claimedBy !== userId;
  const decided = isLoaded
    ? !claiming || shown.current
    : offlineSignedIn || (waited && hint === false);
  const signedIn = isLoaded ? !!isSignedIn && (!claiming || appShown.current) : offlineSignedIn;

  useEffect(() => {
    if (decided) SplashScreen.hideAsync().catch(() => undefined);
    if (decided) shown.current = true;
    appShown.current = decided && signedIn;
  }, [decided, signedIn]);

  if (!decided) return <View className="flex-1 bg-ink" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

function MissingConfig() {
  return (
    <View className="flex-1 justify-center gap-3 bg-canvas px-6">
      <Text weight="bold" className="text-2xl">
        money money.
      </Text>
      <Text className="text-muted">
        This build is missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Set it in the EAS environment (or
        apps/mobile/.env for local development) and rebuild.
      </Text>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (!isConfigured && (fontsLoaded || fontError))
      SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {isConfigured ? (
          <ClerkProvider
            publishableKey={config.clerkPublishableKey}
            tokenCache={tokenCache}
            __experimental_resourceCache={resourceCache}
          >
            <QueryClientProvider client={queryClient}>
              <RootNavigator />
            </QueryClientProvider>
          </ClerkProvider>
        ) : (
          <MissingConfig />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
