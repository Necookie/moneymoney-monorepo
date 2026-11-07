import { Label } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label.Root htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted">(optional)</span> : null}
      </Label.Root>
      {children}
      {error ? (
        <p role="alert" className="text-[12px] leading-4 text-negative">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] leading-4 text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
