import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('min-w-0 rounded-card border bg-card', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h2 id={id} className="section-label">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-[13px] leading-[18px] text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pt-4 pb-5', className)} {...props} />;
}
