'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { format, parse } from 'date-fns';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import type { ExerciseDto, VolumeGroup, WeightUnit } from '@chefer/types';
import { formatLoad, VOLUME_GROUP_LABELS } from '@chefer/utils';

// Stats tab #5 (gym_plan.md §1.3, research §4.2 #9): a regular reflection
// point — sessions vs goal, weeks met, PR count, biggest e1RM gains, sets per
// muscle vs last month, and the bodyweight trend.

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = (y ?? 0) * 12 + ((m ?? 1) - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function MonthlyRecapCard({ library, unit }: { library: ExerciseDto[]; unit: WeightUnit }) {
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const { data, isLoading } = trpc.gym.stats.monthlyRecap.useQuery({ month });
  const byId = new Map(library.map((e) => [e.id, e.name]));

  const monthLabel = format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy');
  const isCurrentMonth = month === format(new Date(), 'yyyy-MM');

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Monthly recap
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Previous month"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-neutral-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-28 text-center text-sm font-medium text-neutral-700">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => !isCurrentMonth && setMonth((m) => shiftMonth(m, 1))}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-neutral-100 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      ) : !data || data.sessions === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          No sessions in {monthLabel} yet.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Sessions', value: `${data.sessions}/${data.sessionsGoal}` },
              { label: 'Weeks met', value: `${data.weeksMet}/${data.weeksTotal}` },
              { label: 'Streak', value: `${data.streak}w` },
              { label: 'PRs', value: `${data.prCount}` },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-neutral-50 p-3 text-center">
                <p className="text-lg font-bold text-neutral-900">{stat.value}</p>
                <p className="text-[11px] text-neutral-500">{stat.label}</p>
              </div>
            ))}
          </div>

          {data.topGains.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-600">Biggest gains</p>
              <ul className="space-y-1">
                {data.topGains.map((gain) => (
                  <li
                    key={gain.exerciseId}
                    className="flex items-center justify-between text-sm text-neutral-700"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      {byId.get(gain.exerciseId) ?? gain.exerciseId}
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {formatLoad(gain.fromKg, unit)} → {formatLoad(gain.toKg, unit)} (+{gain.pct}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.setsByGroup.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-600">Sets vs last month</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600 sm:grid-cols-3">
                {data.setsByGroup.slice(0, 6).map((row) => (
                  <li key={row.group} className="flex justify-between">
                    <span>{VOLUME_GROUP_LABELS[row.group as VolumeGroup]}</span>
                    <span
                      className={row.sets >= row.prevSets ? 'text-emerald-600' : 'text-neutral-500'}
                    >
                      {row.sets} ({row.sets >= row.prevSets ? '+' : ''}
                      {Math.round((row.sets - row.prevSets) * 10) / 10})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(data.bodyweight.startKg !== null || data.bodyweight.endKg !== null) && (
            <div className="text-xs text-neutral-500">
              Bodyweight:{' '}
              {data.bodyweight.startKg !== null ? formatLoad(data.bodyweight.startKg, unit) : '—'} →{' '}
              {data.bodyweight.endKg !== null ? formatLoad(data.bodyweight.endKg, unit) : '—'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
