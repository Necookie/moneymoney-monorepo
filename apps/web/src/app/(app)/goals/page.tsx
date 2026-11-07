import type { Metadata } from 'next';
import { Suspense } from 'react';
import { GoalsPage } from '@/features/goals/goals-page';

export const metadata: Metadata = { title: 'Goals' };

export default function Page() {
  return (
    <Suspense>
      <GoalsPage />
    </Suspense>
  );
}
