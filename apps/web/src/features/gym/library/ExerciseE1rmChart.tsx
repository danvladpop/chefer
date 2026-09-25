'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StatsRange } from '@chefer/types';

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
  const { data, isLoading } = trpc.gym.stats.e1rm.useQuery({ exerciseId, range });

  const rows = (data?.points ?? []).map((p) => ({
    date: p.localDate.slice(5),
    e1rm: p.e1rmKg,
    isPr: p.isPr,
  }));

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          e1RM trend
        </p>
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={`min-h-7 rounded-md px-2 text-[11px] font-medium transition ${
                range === r.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
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
            <Tooltip formatter={(val) => [`${String(val)} kg e1RM`]} />
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
