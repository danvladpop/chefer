import Link from 'next/link';
import { cn } from '@chefer/utils';
import { PROGRESS_WEB_COPY } from './copy';

// The friendly state for a Kitchen progress page opened while the gate is off
// (flag off, or the account isn't on the allowlist yet): a deep link, a stale
// bookmark, the e2e route sweep. Never an error.

export function ProgressNotAvailable({ className }: { className?: string }) {
  return (
    <div
      data-testid="progress-not-available"
      className={cn('rounded-card border bg-white p-6 text-center', className)}
    >
      <p className="text-base font-semibold text-gray-900">{PROGRESS_WEB_COPY.notAvailableTitle}</p>
      <p className="mt-1 text-sm text-gray-600">{PROGRESS_WEB_COPY.notAvailableBody}</p>
      <Link
        href="/dashboard"
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-control px-4 text-sm font-semibold text-[#944a00] hover:underline"
      >
        {PROGRESS_WEB_COPY.backToToday}
      </Link>
    </div>
  );
}
