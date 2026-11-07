import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const inputClass =
  'h-10 w-full min-w-0 rounded-input border border-border-strong bg-card px-3 text-[15px] text-ink placeholder:text-subtle transition-colors outline-none focus-visible:border-ink focus-visible:shadow-[0_0_0_3px_var(--mm-accent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-negative';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-20 py-2', className)} {...props} />;
}

/** Native select: accessible, keyboard- and mobile-friendly, styled to match inputs. */
export function NativeSelect({
  className,
  children,
  wrapperClassName,
  ...props
}: ComponentProps<'select'> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative min-w-0', wrapperClassName)}>
      <select
        className={cn(inputClass, 'cursor-pointer appearance-none pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
      >
        <path
          d="M6 9l6 6 6-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
