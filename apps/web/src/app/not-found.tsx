import Link from 'next/link';
import { Wordmark } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Wordmark />
      <h1 className="text-[24px] font-semibold">Page not found</h1>
      <p className="text-sm text-muted">That page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="inline-flex h-9 items-center rounded-button bg-ink px-4 text-sm font-medium text-canvas"
      >
        Back to overview
      </Link>
    </main>
  );
}
