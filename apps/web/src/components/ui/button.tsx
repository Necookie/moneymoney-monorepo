import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-button text-sm font-medium transition-colors duration-150 ease-standard disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** Chartreuse — the single primary call to action on a surface. */
        primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
        default: 'bg-ink text-canvas hover:bg-ink-soft',
        outline: 'border border-border-strong bg-card text-ink hover:bg-hover',
        ghost: 'text-ink hover:bg-hover',
        subtle: 'bg-hover text-ink hover:bg-border',
        destructive: 'bg-negative text-white hover:opacity-90',
        'destructive-outline':
          'border border-negative/40 bg-card text-negative hover:bg-negative-soft',
        link: 'h-auto px-0 text-ink underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-9 px-4',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  if (asChild) {
    return <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
  return (
    <button
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
