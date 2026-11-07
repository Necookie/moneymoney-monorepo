import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { Providers } from '@/components/providers';

/** Authenticated area. The proxy already redirects; this is a server-side second check. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
