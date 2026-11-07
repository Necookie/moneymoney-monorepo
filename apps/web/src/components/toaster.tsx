'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
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
