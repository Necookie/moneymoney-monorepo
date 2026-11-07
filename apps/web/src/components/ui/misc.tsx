'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-border/70', className)}
      {...props}
    />
  );
}

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-hover text-ink-soft',
        outline: 'border border-border-strong text-muted',
        positive: 'bg-positive-soft text-positive',
        negative: 'bg-negative-soft text-negative',
        warning: 'bg-warning-soft text-warning',
        info: 'bg-info-soft text-info',
        dark: 'bg-ink text-canvas',
        accent: 'bg-accent text-accent-ink',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const BAR_TONE = {
  ink: 'bg-ink',
  positive: 'bg-positive',
  warning: 'bg-warning',
  negative: 'bg-negative',
  muted: 'bg-subtle',
} as const;
export type BarTone = keyof typeof BAR_TONE;

/** Determinate bar; `value` 0–100 (higher renders full). `marker` draws a pace tick. */
export function ProgressBar({
  value,
  tone = 'ink',
  marker,
  label,
  className,
}: {
  value: number;
  tone?: BarTone;
  marker?: number | null;
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-hover', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-200', BAR_TONE[tone])}
        style={{ width: `${clamped}%` }}
      />
      {marker !== null && marker !== undefined ? (
        <div
          aria-hidden
          className="absolute top-0 h-full w-0.5 bg-ink/60"
          style={{ left: `calc(${Math.max(0, Math.min(100, marker))}% - 1px)` }}
        />
      ) : null}
    </div>
  );
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border-strong transition-colors data-[state=checked]:bg-ink disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-card shadow-sm transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent" />
    </SwitchPrimitive.Root>
  );
}

/** Segmented control (single choice), keyboard accessible as a radio group. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string; count?: number | string }>;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex max-w-full overflow-x-auto rounded-button border bg-card p-0.5',
        className,
      )}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const idx = options.findIndex((o) => o.value === value);
        const next =
          options[(idx + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
        if (next) {
          onChange(next.value);
          const btn = e.currentTarget.querySelector<HTMLButtonElement>(
            `[data-value="${CSS.escape(next.value)}"]`,
          );
          btn?.focus();
        }
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
              active ? 'bg-ink text-canvas' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span
                className={cn('tabular text-[11px]', active ? 'text-canvas/70' : 'text-subtle')}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
