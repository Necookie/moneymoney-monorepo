'use client';

import { formatDate } from '@mm/finance-engine';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/misc';
import { INSTALL_LINK, useAndroidReleases } from './android-app-card';
import { QrCode } from './qr-code';

/**
 * "Install Android app" dialog: a large QR code that phones scan to download the newest APK
 * (first install or update — it always points at the latest release), plus a direct download
 * button for when the website is already open on the phone.
 */
export function InstallAndroidDialog({ trigger }: { trigger: ReactNode }) {
  const releases = useAndroidReleases();
  const latest = releases.data?.latest ?? null;

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        size="sm"
        title="Install the Android app"
        description="Scan with your phone's camera to install — or update to the newest version."
      >
        <DialogBody className="items-center text-center">
          <div className="rounded-card border bg-white p-3">
            <QrCode
              value={INSTALL_LINK}
              size={232}
              label="QR code: download the latest Money Money Android app"
            />
          </div>

          {releases.isPending ? (
            <Skeleton className="h-5 w-48" />
          ) : latest ? (
            <p className="text-sm text-muted tabular-nums">
              Latest: <span className="font-medium text-ink">v{latest.version}</span> ·{' '}
              {formatDate(latest.publishedAt.slice(0, 10))}
            </p>
          ) : (
            <p className="text-sm text-muted">
              No version is published yet — this code starts working as soon as the first release is
              out.
            </p>
          )}

          <ol className="w-full list-decimal space-y-1 pl-5 text-left text-[13px] leading-[18px] text-muted">
            <li>Point your phone camera at the code and open the link.</li>
            <li>Open the downloaded APK; allow installs from your browser if Android asks.</li>
            <li>Already installed? The same code updates it in place — your data stays.</li>
          </ol>

          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button
              variant="primary"
              className="flex-1"
              disabled={!latest}
              asChild={Boolean(latest)}
            >
              {latest ? (
                <a href={latest.apk.url} download={latest.apk.name}>
                  <Icon name="download" size={16} />
                  Download on this device
                </a>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Icon name="download" size={16} />
                  Download on this device
                </span>
              )}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings#android">All versions</Link>
            </Button>
          </div>
          <p className="font-mono text-[11px] break-all text-subtle">{INSTALL_LINK}</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
