'use client';

import { formatDate } from '@mm/finance-engine';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge, Skeleton } from '@/components/ui/misc';
import type { AndroidReleaseCatalog } from '@/lib/android-releases';
import { QrCode } from './qr-code';

const INSTALL_LINK = 'https://moneymoney.necookie.dev/download/android';

function formatSize(bytes: number): string {
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

export function useAndroidReleases() {
  return useQuery({
    queryKey: ['android-releases'],
    queryFn: async (): Promise<AndroidReleaseCatalog> => {
      const res = await fetch('/api/android/releases');
      if (!res.ok) throw new Error('Could not load Android releases');
      return (await res.json()) as AndroidReleaseCatalog;
    },
    staleTime: 5 * 60_000,
  });
}

/** Download + version history for the Android APK (Settings → Android app). */
export function AndroidAppCard() {
  const releases = useAndroidReleases();
  const [showHistory, setShowHistory] = useState(false);
  const latest = releases.data?.latest ?? null;
  const previous = releases.data?.releases.slice(1) ?? [];

  return (
    <Card id="android" className="scroll-mt-24 lg:col-span-2">
      <CardHeader
        title="Android app"
        description="Native app with offline entry, biometric lock and bill reminders."
        action={latest ? <Badge tone="dark">v{latest.version}</Badge> : null}
      />
      <CardContent>
        {releases.isPending ? (
          <div className="flex gap-6">
            <Skeleton className="size-[136px]" />
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-9 w-44" />
            </div>
          </div>
        ) : releases.isError ? (
          <p className="text-sm text-negative">
            Couldn’t load Android releases right now. Try again in a minute.
          </p>
        ) : !latest ? (
          <div className="flex items-start gap-3 rounded-input border border-dashed p-4">
            <Icon name="package" size={20} className="mt-0.5 text-muted" />
            <div className="text-sm">
              <p className="font-medium text-ink">No Android build published yet</p>
              <p className="mt-1 text-muted">
                Publish one with{' '}
                <code className="rounded bg-hover px-1 py-0.5 text-[12px]">
                  pnpm --filter @mm/mobile release:android
                </code>
                . It appears here automatically.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="hidden shrink-0 flex-col items-center gap-2 sm:flex">
                <QrCode value={INSTALL_LINK} label="QR code to download the Android app" />
                <span className="text-[12px] text-muted">Scan with your phone</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold tracking-tight text-ink">
                  Money Money {latest.version}
                </p>
                <p className="mt-0.5 text-sm text-muted tabular-nums">
                  Released {formatDate(latest.publishedAt.slice(0, 10))}
                  {latest.apk.sizeBytes > 0 ? ` · ${formatSize(latest.apk.sizeBytes)}` : ''} ·
                  Android APK
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="primary" asChild>
                    <a href={latest.apk.url} download={latest.apk.name}>
                      <Icon name="download" size={16} />
                      Install Android app
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={latest.pageUrl} target="_blank" rel="noreferrer">
                      Release notes
                    </a>
                  </Button>
                </div>
                <p className="mt-3 text-[13px] leading-[18px] text-muted">
                  On your phone, open the APK and allow installs from your browser when Android
                  asks. Newer versions install over the existing app and keep your sign-in.
                </p>
                {latest.notes ? (
                  <p className="mt-3 line-clamp-4 whitespace-pre-line text-[13px] leading-[18px] text-ink-soft">
                    {latest.notes}
                  </p>
                ) : null}
                {latest.sha256 ? (
                  <p className="mt-3 break-all font-mono text-[11px] text-subtle">
                    SHA-256 {latest.sha256}
                  </p>
                ) : null}
              </div>
            </div>

            {previous.length > 0 ? (
              <div className="border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="flex cursor-pointer items-center gap-1 text-sm font-medium text-ink"
                  aria-expanded={showHistory}
                >
                  <Icon name={showHistory ? 'chevronUp' : 'chevronDown'} size={16} />
                  Previous versions ({previous.length})
                </button>
                {showHistory ? (
                  <>
                    <ul className="mt-3 divide-y rounded-input border">
                      {previous.map((r) => (
                        <li
                          key={r.tag}
                          className="flex items-center justify-between gap-3 px-4 py-2.5"
                        >
                          <div className="min-w-0 text-sm">
                            <span className="font-medium text-ink">v{r.version}</span>
                            <span className="ml-2 text-muted tabular-nums">
                              {formatDate(r.publishedAt.slice(0, 10))}
                              {r.apk.sizeBytes > 0 ? ` · ${formatSize(r.apk.sizeBytes)}` : ''}
                            </span>
                          </div>
                          <a
                            href={r.apk.url}
                            className="text-sm font-medium text-ink underline-offset-4 hover:underline"
                          >
                            Download
                          </a>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[12px] leading-[17px] text-muted">
                      Android won’t install an older version over a newer one: uninstall first. Your
                      data is safe on the server, but sync any pending offline entries before
                      uninstalling.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
