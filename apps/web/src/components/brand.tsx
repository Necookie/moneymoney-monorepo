import { cn } from '@/lib/utils';

/** The `money money.` wordmark (lowercase with a trailing period). */
export function Wordmark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline text-[19px] leading-none font-semibold tracking-[-0.03em]',
        inverted ? 'text-canvas' : 'text-ink',
        className,
      )}
    >
      money money
      <span className={inverted ? 'text-accent' : 'text-ink'}>.</span>
    </span>
  );
}

export const TAGLINE = 'Know your money before you spend it.';
