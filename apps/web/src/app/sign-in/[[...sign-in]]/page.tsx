import { ClerkFailed, ClerkLoading, SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TAGLINE, Wordmark } from '@/components/brand';

export const metadata: Metadata = { title: 'Sign in' };

const POINTS = [
  'Actual balances and projections are always kept apart.',
  'Uncertain income is never counted as cash.',
  'Planned items change forecasts, never your recorded money.',
];

/**
 * Sign-in only: Money Money is a private, single-user instance, so there is no public sign-up
 * page. (Also set Clerk → Configure → Restrictions → Sign-up mode to "Restricted".)
 */
export default function SignInPage() {
  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-rows-1">
      <section className="flex flex-col justify-between gap-10 bg-surface-dark px-6 py-8 text-canvas sm:px-10 lg:px-14 lg:py-12">
        <Wordmark inverted className="text-[22px]" />
        <div className="max-w-md">
          <h1 className="text-[30px] leading-9 font-semibold tracking-tight sm:text-[40px] sm:leading-[44px]">
            {TAGLINE}
          </h1>
          <ul className="mt-6 hidden flex-col gap-3 text-[15px] text-canvas/70 sm:flex">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="hidden text-[12px] text-canvas/50 lg:block">
          Private instance · PHP · Asia/Manila
        </p>
      </section>
      <section className="flex items-start justify-center px-4 py-10 sm:items-center sm:px-8">
        <div className="flex w-full max-w-[400px] flex-col items-center gap-6">
          <div className="w-full text-center">
            <h2 className="text-[20px] leading-7 font-semibold">Sign in</h2>
            <p className="mt-1 text-sm text-muted">This is a private instance for its owner.</p>
          </div>
          <ClerkLoading>
            <div
              aria-label="Loading sign-in"
              className="h-[380px] w-full animate-pulse rounded-card bg-border/60"
            />
          </ClerkLoading>
          <ClerkFailed>
            <p
              role="alert"
              className="rounded-card border border-negative/30 bg-negative-soft p-4 text-sm"
            >
              Sign-in couldn&apos;t load. Check your connection (or any content blocker) and reload
              the page.
            </p>
          </ClerkFailed>
          <Suspense
            fallback={<div className="h-[380px] w-full animate-pulse rounded-card bg-border/60" />}
          >
            <SignIn
              path="/sign-in"
              routing="path"
              withSignUp={false}
              transferable={false}
              fallbackRedirectUrl="/"
              appearance={{
                elements: {
                  footerAction: { display: 'none' },
                  rootBox: { width: '100%' },
                  cardBox: { width: '100%', boxShadow: 'none', border: '1px solid #E5E7EB' },
                },
              }}
            />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
