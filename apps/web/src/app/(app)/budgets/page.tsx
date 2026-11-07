import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BudgetsPage } from '@/features/budgets/budgets-page';

export const metadata: Metadata = { title: 'Budgets' };

export default function Page() {
  return (
    <Suspense>
      <BudgetsPage />
    </Suspense>
  );
}
