import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CalendarPage } from '@/features/planner/calendar-page';

export const metadata: Metadata = { title: 'Financial Calendar' };

export default function Page() {
  return (
    <Suspense>
      <CalendarPage />
    </Suspense>
  );
}
