'use client';

import { useId, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { pressControl } from '@chefer/ui';
import { cn, localDateStr, PROGRESS_COPY } from '@chefer/utils';
import { PROGRESS_WEB_COPY } from './copy';

// "Pause my flame" (mockup 12, also in the Flame sheet): holiday, illness,
// life — the flame waits up to 4 weeks. Resuming is one tap.

export function PauseFlameCard({
  pausedUntil,
  className,
}: {
  pausedUntil: string | null;
  className?: string;
}) {
  const weeksId = useId();
  const [weeks, setWeeks] = useState(1);
  const utils = trpc.useUtils();
  const refresh = () => {
    void utils.progress.summary.invalidate();
  };
  const pause = trpc.progress.pauseFlame.useMutation({ onSuccess: refresh });
  const resume = trpc.progress.resumeFlame.useMutation({ onSuccess: refresh });

  return (
    <section
      data-testid="pause-flame"
      className={cn('flex items-start gap-3 rounded-card border bg-white p-4', className)}
    >
      <span aria-hidden="true" className="text-2xl">
        🏖️
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-gray-900">{PROGRESS_COPY.pauseTitle}</h3>
        {pausedUntil ? (
          <>
            <p className="mt-0.5 text-sm text-gray-600">
              {PROGRESS_COPY.pausedUntil} {pausedUntil}
            </p>
            <button
              type="button"
              disabled={resume.isPending}
              onClick={() => resume.mutate({ localDate: localDateStr() })}
              className={cn(
                'mt-3 flex min-h-11 w-full items-center justify-center rounded-control border px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-60',
                pressControl,
              )}
            >
              {PROGRESS_COPY.resumeCta}
            </button>
          </>
        ) : (
          <>
            <p className="mt-0.5 text-sm text-gray-600">{PROGRESS_COPY.pauseBody}</p>
            <div className="mt-3 flex items-center gap-2">
              <label htmlFor={weeksId} className="sr-only">
                {PROGRESS_WEB_COPY.pauseWeeksLabel}
              </label>
              <select
                id={weeksId}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="min-h-11 shrink-0 rounded-control border bg-white px-2 text-sm"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {PROGRESS_WEB_COPY.pauseWeeksOption(n)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pause.isPending}
                onClick={() => pause.mutate({ startDate: localDateStr(), weeks })}
                className={cn(
                  'flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-control border px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-60',
                  pressControl,
                )}
              >
                {PROGRESS_COPY.pauseCta}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
