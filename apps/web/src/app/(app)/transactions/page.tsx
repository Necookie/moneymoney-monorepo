import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TransactionsPage } from '@/features/transactions/transactions-page';

export const metadata: Metadata = { title: 'Transactions' };

export default function Page() {
  return (
    <Suspense>
      <TransactionsPage />
    </Suspense>
  );
}
