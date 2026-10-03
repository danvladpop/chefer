'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { format, parseISO } from 'date-fns';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StatsRange } from '@chefer/types';
import { ErrorState } from '@chefer/ui';

// Exercise detail's "Your history" e1RM mini-chart (gym_plan.md §1.3 Exercises
// tab). A lean, single-lift version of the stats tab's strength trend — no
// picker, no bodyweight overlay; that fuller view lives on /gym/stats.

const RANGES: { value: StatsRange; label: string }[] = [
  { value: '3m', label: '3m' },
  { value: '1y', label: '1y' },
  { value: 'all', label: 'All' },
];

function PrDot(props: { cx?: number; cy?: number; payload?: { isPr?: boolean } }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload?.isPr) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />;
}

export function ExerciseE1rmChart({ exerciseId }: { exerciseId: string }) {
  const [range, setRange] = useState<StatsRange>('3m');
  const { data, isLoading, isError, refetch, isRefetching } = trpc.gym.stats.e1rm.useQuery({
    exerciseId,
    range,
  });

  const rows = (data?.points ?? []).map((p) => ({
    // UX-GYM-33: "10 Sep", never the ISO tail "09-10".
    date: format(parseISO(p.localDate), 'd MMM'),
    fullDate: format(parseISO(p.localDate), 'd MMM yyyy'),
    e1rm: p.e1rmKg,
    isPr: p.isPr,
  }));

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Estimated 1-rep max
        </p>
        <div
          role="group"
          aria-label="Time range"
          className="flex gap-1 rounded-lg bg-neutral-100 p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
              className={`touch-target relative min-h-8 min-w-11 rounded-md px-2 text-xs font-medium transition ${
                range === r.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      ) : isError && !data ? (
        <ErrorState
          title="Couldn’t load your trend"
          onRetry={() => void refetch()}
          retrying={isRefetching}
          className="py-6"
        />
      ) : rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-center text-sm text-neutral-500">
          No completed sets yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={rows}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={36}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(val) => [`${String(val)} kg e1RM`]}
              labelFormatter={(label) =>
                rows.find((r) => r.date === label)?.fullDate ?? String(label)
              }
            />
            <Line
              type="monotone"
              dataKey="e1rm"
              stroke="#944a00"
              strokeWidth={2}
              dot={<PrDot />}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
