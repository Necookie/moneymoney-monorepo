import { formatMoney, formatMoneyCompact } from '@mm/finance-engine';
import type { Confidence } from '@mm/types';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CONFIDENCE_LABEL } from '@/lib/format';
import { Badge, type BadgeTone } from './ui/misc';

type Tone = 'auto' | 'neutral' | 'positive' | 'negative' | 'muted';

/** Money value in tabular figures; `tone="auto"` colours negatives (true minus via formatMoney). */
export function Money({
  value,
  tone = 'neutral',
  signed,
  compact,
  className,
}: {
  value: number;
  tone?: Tone;
  signed?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const color =
    tone === 'auto'
      ? value < 0
        ? 'text-negative'
        : undefined
      : tone === 'positive'
        ? 'text-positive'
        : tone === 'negative'
          ? 'text-negative'
          : tone === 'muted'
            ? 'text-muted'
            : undefined;
  return (
    <span className={cn('tabular whitespace-nowrap', color, className)}>
      {compact ? formatMoneyCompact(value) : formatMoney(value, { signed })}
    </span>
  );
}

/** Big figure with a section label, used across overview cards. */
export function Figure({
  label,
  value,
  tone = 'auto',
  size = 'lg',
  hint,
  className,
}: {
  label: string;
  value: number;
  tone?: Tone;
  size?: 'md' | 'lg' | 'xl';
  hint?: ReactNode;
  className?: string;
}) {
  const sizeClass = {
    md: 'text-[20px] leading-7',
    lg: 'text-[24px] leading-[30px]',
    xl: 'text-[32px] leading-[38px] sm:text-[40px] sm:leading-[44px]',
  }[size];
  return (
    <div className={cn('min-w-0', className)}>
      <div className="section-label">{label}</div>
      <div className={cn('mt-1 font-semibold tracking-tight', sizeClass)}>
        <Money value={value} tone={tone} />
      </div>
      {hint ? <div className="mt-1 text-[12px] leading-4 text-muted">{hint}</div> : null}
    </div>
  );
}

const CONFIDENCE_TONE: Record<Confidence, BadgeTone> = {
  confirmed: 'positive',
  likely: 'info',
  uncertain: 'outline',
};

export function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  return <Badge tone={CONFIDENCE_TONE[confidence]}>{CONFIDENCE_LABEL[confidence]}</Badge>;
}
