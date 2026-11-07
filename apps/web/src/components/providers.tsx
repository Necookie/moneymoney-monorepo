'use client';

import type { ReactNode } from 'react';
import { ApiProvider } from '@/lib/api';
import { TransactionDialogProvider } from '@/features/transactions/transaction-dialog';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ApiProvider>
      <TransactionDialogProvider>{children}</TransactionDialogProvider>
    </ApiProvider>
  );
}
