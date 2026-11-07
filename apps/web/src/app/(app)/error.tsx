'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/states';

/** Route-level error boundary for unexpected rendering errors inside the app shell. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl pt-10">
      <ErrorState error={error} title="Something went wrong on this page" onRetry={reset} />
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-muted">Digest: {error.digest}</p>
      ) : null}
    </div>
  );
}
