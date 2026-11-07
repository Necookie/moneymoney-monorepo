import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountsPage } from '@/features/accounts/accounts-page';

export const metadata: Metadata = { title: 'Accounts' };

export default function Page() {
  return (
    <Suspense>
      <AccountsPage />
    </Suspense>
  );
}
