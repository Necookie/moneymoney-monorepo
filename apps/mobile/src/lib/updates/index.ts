import { useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { Linking } from 'react-native';
import { config } from '../config';
import { pickUpdate, type AndroidReleaseInfo } from './version';

export { compareVersions, pickUpdate, type AndroidReleaseInfo } from './version';

interface Catalog {
  latest: AndroidReleaseInfo | null;
}

export const installedVersion = (): string | null => Application.nativeApplicationVersion ?? null;

async function fetchLatest(): Promise<AndroidReleaseInfo | null> {
  const res = await fetch(`${config.webUrl}/api/android/releases`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Update check failed (${res.status})`);
  return ((await res.json()) as Catalog).latest;
}

/**
 * Checks the public release catalogue (GitHub Releases behind the web app) at most every 6 hours.
 * Failures are silent: an update check must never get in the way of using the app offline.
 */
export function useAppUpdate() {
  const query = useQuery({
    queryKey: ['android-update'],
    queryFn: fetchLatest,
    staleTime: 6 * 60 * 60_000,
    retry: false,
  });
  const installed = installedVersion();
  return {
    installed,
    latest: query.data ?? null,
    update: pickUpdate(installed, query.data),
    checking: query.isFetching,
    error: query.error,
    recheck: () => query.refetch(),
  };
}

/** Opens the APK in the browser; Android then offers to install it over the current version. */
export function openDownload(release: AndroidReleaseInfo | null) {
  void Linking.openURL(release?.apk.url ?? `${config.webUrl}/download/android`);
}
