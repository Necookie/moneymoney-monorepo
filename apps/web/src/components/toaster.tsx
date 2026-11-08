'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      // Phones: keep toasts above the bottom tab bar.
      mobileOffset={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-[12px] !border !border-border !bg-card !text-ink !shadow-popover !font-sans',
          description: '!text-muted',
        },
      }}
    />
  );
}
