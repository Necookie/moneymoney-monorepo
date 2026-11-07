'use client';

import type { ReactNode } from 'react';
import { errorMessage, isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './icons/icon';
import { Button } from './ui/button';
import { Skeleton } from './ui/misc';

/** Error panel that always shows the API request id (for support/log correlation). */
export function ErrorState({
  error,
  onRetry,
  title = "Couldn't load this",
  className,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  const requestId = isApiError(error) ? error.requestId : undefined;
  const status = isApiError(error) ? error.status : undefined;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-card border border-negative/30 bg-negative-soft/50',
        compact ? 'p-4' : 'p-6',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon name="alertCircle" className="mt-0.5 text-negative" />
        <div className="min-w-0">
          <p className="font-medium text-ink">{title}</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {status === 0
              ? `${errorMessage(error)}. Check your connection and try again.`
              : errorMessage(error)}
          </p>
          {requestId ? (
            <p className="mt-1 font-mono text-[11px] text-muted select-all">
              Request ID: {requestId}
            </p>
          ) : null}
        </div>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <Icon name="refresh" size={14} />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon = 'sparkles',
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border-strong px-6 py-10 text-center',
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-hover text-ink-soft">
        <Icon name={icon} size={20} />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-[30px] font-semibold tracking-tight sm:text-[30px] sm:leading-9">
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Small "Planned — affects projections only" note (financial honesty rule #3). */
export function ProjectionNote({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn('flex items-center gap-1.5 text-[12px] leading-4 text-muted', className)}>
      <Icon name="info" size={14} />
      {children ?? 'Planned — affects projections only, never your actual balance.'}
    </p>
  );
}
