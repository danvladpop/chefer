'use client';

import { trpc } from '@/lib/trpc';
import { Flame } from 'lucide-react';
import type { WeekStatus } from '@chefer/types';

// Stats tab #3 (gym_plan.md §1.3, §1.4): a grid of weeks (met / flex / paused
// / under / empty), never daily, and never red — the habit mechanics are
// framed positively (§1.4 "anti-patterns banned").

const WEEKS = 26;

const STATUS_STYLE: Record<WeekStatus, { className: string; label: string }> = {
  met: { className: 'bg-emerald-500', label: 'Goal met' },
  flex: { className: 'bg-sky-400', label: 'Flex week used' },
  paused: { className: 'bg-neutral-300', label: 'Paused' },
  current: { className: 'bg-neutral-200 ring-1 ring-inset ring-neutral-400', label: 'This week' },
  under: { className: 'bg-amber-200', label: 'Under goal' },
  empty: { className: 'bg-neutral-100', label: 'No sessions' },
};

export function ConsistencyGrid() {
  const { data, isLoading } = trpc.gym.stats.consistency.useQuery({ weeks: WEEKS });

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Consistency
        </p>
        {data && (
          <div className="flex items-center gap-3 text-xs text-neutral-600">
            <span className="flex items-center gap-1 font-semibold text-neutral-900">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              {data.streak.current}-week streak
            </span>
            <span>Best: {data.streak.best}</span>
            {data.streak.flexTokens > 0 && <span>{data.streak.flexTokens} flex weeks saved</span>}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-neutral-100" />
      ) : !data || data.weeks.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          No training weeks yet. Your first session starts the grid.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {data.weeks.map((week) => {
              const style = STATUS_STYLE[week.status];
              return (
                <div
                  key={week.weekStart}
                  title={`Week of ${week.weekStart}: ${style.label} (${week.sessions}/${week.goal})`}
                  className={`h-4 w-4 rounded-sm ${style.className}`}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-500">
            {(['met', 'flex', 'under', 'paused', 'empty'] as WeekStatus[]).map((status) => (
              <span key={status} className="flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-sm ${STATUS_STYLE[status].className}`} />
                {STATUS_STYLE[status].label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
