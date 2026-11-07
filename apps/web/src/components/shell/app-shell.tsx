'use client';

import { InstallAndroidDialog } from '@/features/android/install-android-dialog';
import { SignOutButton, UserButton } from '@clerk/nextjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Wordmark } from '@/components/brand';
import { Icon } from '@/components/icons/icon';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, SheetContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/misc';
import { useTransactionDialog } from '@/features/transactions/transaction-dialog';
import { isApiError, isPrivateInstanceError, useApi } from '@/lib/api';
import { useMe } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { isActive, NAV_ITEMS } from './nav';

const COLLAPSE_KEY = 'mm.sidebar.collapsed';

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { openCreate } = useTransactionDialog();

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // Storage unavailable (private mode) — keep the default.
    }
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  // Global shortcut: "N" opens "Add transaction" (ignored while typing or with modifiers).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      openCreate();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCreate]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // ignore
      }
      return !c;
    });
  };

  if (me.isError && isPrivateInstanceError(me.error)) return <PrivateInstanceScreen />;

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col bg-surface-dark text-canvas transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[72px]' : 'w-[248px]',
        )}
        aria-label="Main navigation"
      >
        <SidebarContents collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b bg-canvas/95 px-3 backdrop-blur lg:hidden">
          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Icon name="menu" size={20} />
              </Button>
            </DialogTrigger>
            <SheetContent title="Navigation">
              <SidebarContents collapsed={false} />
            </SheetContent>
          </Dialog>
          <Link href="/" aria-label="money money. — Overview">
            <Wordmark />
          </Link>
          <Button
            variant="primary"
            size="icon"
            aria-label="Add transaction"
            onClick={() => openCreate()}
          >
            <Icon name="plus" size={20} />
          </Button>
        </header>

        {me.data?.settings.demoMode ? <DemoBanner /> : null}

        <main
          id="main"
          className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9"
        >
          {me.isPending ? (
            <ShellSkeleton />
          ) : me.isError ? (
            <div className="mx-auto max-w-xl pt-10">
              <ErrorState
                error={me.error}
                title={
                  isApiError(me.error) && me.error.status === 401
                    ? 'Your session could not be verified'
                    : "Couldn't reach Money Money"
                }
                onRetry={() => void me.refetch()}
              />
              {isApiError(me.error) && me.error.status === 401 ? (
                <div className="mt-3">
                  <SignOutButton redirectUrl="/sign-in">
                    <Button variant="outline" size="sm">
                      Sign in again
                    </Button>
                  </SignOutButton>
                </div>
              ) : null}
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

function SidebarContents({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const { openCreate } = useTransactionDialog();
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center', collapsed ? 'justify-center' : 'px-5')}>
        <Link href="/" aria-label="money money. — Overview" className="rounded-sm">
          {collapsed ? (
            <span className="text-[19px] font-semibold text-canvas">
              m<span className="text-accent">.</span>
            </span>
          ) : (
            <Wordmark inverted />
          )}
        </Link>
      </div>

      <div className={cn('pb-3', collapsed ? 'px-3' : 'px-4')}>
        <Button
          variant="primary"
          className={cn('w-full', collapsed && 'px-0')}
          onClick={() => openCreate()}
          aria-label="Add transaction"
          title="Add transaction (N)"
        >
          <Icon name="plus" size={18} />
          {collapsed ? null : (
            <>
              Add transaction
              <kbd className="ml-auto rounded border border-accent-ink/20 px-1.5 font-sans text-[11px] font-medium">
                N
              </kbd>
            </>
          )}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {collapsed ? null : <p className="section-label px-2 pb-2 !text-canvas/45">Workspace</p>}
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'relative flex h-10 items-center gap-3 rounded-button text-[14px] transition-colors',
                    collapsed ? 'justify-center' : 'px-3',
                    active
                      ? 'bg-canvas/10 font-medium text-canvas'
                      : 'text-canvas/65 hover:bg-canvas/5 hover:text-canvas',
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent"
                    />
                  ) : null}
                  <Icon name={item.icon} size={18} />
                  {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 pb-2">
        <InstallAndroidDialog
          trigger={
            <button
              type="button"
              title={collapsed ? 'Install Android app' : undefined}
              className={cn(
                'flex h-10 w-full cursor-pointer items-center gap-3 rounded-button border border-canvas/15 text-[13px] text-canvas/75 transition-colors hover:border-canvas/30 hover:text-canvas',
                collapsed ? 'justify-center' : 'px-3',
              )}
            >
              <Icon name="phone" size={18} />
              {collapsed ? (
                <span className="sr-only">Install Android app</span>
              ) : (
                'Install Android app'
              )}
            </button>
          }
        />
      </div>

      <div
        className={cn(
          'flex items-center gap-3 border-t border-canvas/10 py-4',
          collapsed ? 'flex-col px-3' : 'px-5',
        )}
      >
        <UserButton />
        {collapsed ? null : <span className="flex-1 text-[12px] text-canvas/50">Private</span>}
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex size-8 cursor-pointer items-center justify-center rounded-button text-canvas/60 hover:bg-canvas/10 hover:text-canvas"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DemoBanner() {
  const api = useApi();
  const qc = useQueryClient();
  const clear = useMutation({
    mutationFn: () => api.demo.clear(),
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success('Demo data removed');
    },
  });
  return (
    <div
      role="status"
      className="sticky top-14 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-[13px] text-warning lg:top-0 lg:px-10"
    >
      <span className="flex items-center gap-2 font-medium">
        <Icon name="info" size={16} />
        Demo data — the figures shown are sample data, not your real finances.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="border-warning/40 text-warning"
        disabled={clear.isPending}
        onClick={() => clear.mutate()}
      >
        {clear.isPending ? 'Removing…' : 'Remove demo data'}
      </Button>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-card" />
    </div>
  );
}

function PrivateInstanceScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-card-lg border bg-card p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-hover">
          <Icon name="lock" size={22} />
        </div>
        <Wordmark className="mt-5" />
        <h1 className="mt-4 text-[20px] leading-7 font-semibold">
          This Money Money instance is private
        </h1>
        <p className="mt-2 text-sm text-muted">
          You&apos;re signed in, but this account isn&apos;t the owner of this instance, so no
          financial data can be shown. Sign out and use the owner account.
        </p>
        <div className="mt-6 flex justify-center">
          <SignOutButton redirectUrl="/sign-in">
            <Button variant="default">
              <Icon name="logOut" size={16} />
              Sign out
            </Button>
          </SignOutButton>
        </div>
      </div>
    </main>
  );
}
