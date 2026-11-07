import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForecastPage } from '@/features/forecast/forecast-page';

export const metadata: Metadata = { title: 'Forecast' };

export default function Page() {
  return (
    <Suspense>
      <ForecastPage />
    </Suspense>
  );
}
