'use client';

import { useState } from 'react';
import { BodyMeasurementsSection } from '@/features/coach/components/BodyMeasurementsSection';
import { WeightTrendSection } from '@/features/coach/components/WeightTrendSection';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { trpc } from '@/lib/trpc';
import { keepPreviousData } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Flame, Scale, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ErrorState } from '@chefer/ui';
import {
  bucketDays,
  DEFAULT_STATS_RANGE,
  isLoggedDay,
  localDateStr,
  STATS_RANGE_LABELS,
  STATS_RANGE_SPAN,
  STATS_RANGES,
  statsBucketDays,
  type StatsRangeDays,
} from '@chefer/utils';
import { hasEnoughDaysForAverage, moreDaysHint } from './average-gate';

// T-21.1 (bugs B-06/B-33): `d.date` is a `YYYY-MM-DD` calendar day (the
// user's local day, not UTC). `parseISO('2026-09-26')` parses a date-only
// string as UTC midnight — formatting that back in a browser west of UTC
// (most of the Americas) rendered the day before. Parsing it as a local
// midnight instead (mobile's `progress.tsx` `shortDate` does the same) keeps
// the label matching the day it's actually attached to.
function localDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

export default function ProgressPage() {
  // Tooltips stay on the default hover trigger. Tapping a chart already opens
  // them: browsers fire compatibility mouse events (mouseover/mousemove/click)
  // on tap, which is what Recharts listens for. Measured against a click
  // trigger on an emulated touch device, both opened on tap and neither
  // dismissed on tapping away — so switching gained nothing and cost a
  // pointer-detection hook.
  //
  // The non-dismissal is a genuine touch problem, but it affects both triggers
  // and needs a different fix.
  /** Slightly larger than the default, so the point under a fingertip reads. */
  const activeDot = { r: 6 };

  // UX-FOOD-20: the window is the user's to pick, anchored on their own local
  // "today"; switching keeps the old chart until the new one lands. Same
  // 1W / 1M / 3M / 1Y ranges as the app's Stats (2026-10-15).
  const [range, setRange] = useState<StatsRangeDays>(DEFAULT_STATS_RANGE);
  // Lane E3 "Hide numbers": how often you logged, never how much.
  const { noNumbers } = useNumbersMode();
  const {
    data: monthly,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = trpc.tracker.monthlySummary.useQuery(
    { localDate: localDateStr(), days: range },
    { staleTime: 60_000, placeholderData: keepPreviousData },
  );
  // Every weigh-in of at least 90 days stays editable; the chart follows the range.
  const { data: weightHistory } = trpc.tracker.weightHistory.useQuery(
    { days: Math.max(range, 90) },
    { staleTime: 60_000, placeholderData: keepPreviousData },
  );
  const { data: preferences } = trpc.preferences.get.useQuery(undefined, {
    staleTime: 300_000,
  });

  // Past a month each point is a week: the daily average of its logged days.
  const weekly = statsBucketDays(range) === 7;
  const chartData = bucketDays(monthly?.days ?? [], statsBucketDays(range)).map((d) => ({
    date: format(localDate(d.date), 'dd MMM'),
    logged: isLoggedDay(d) ? d.totalKcal : null,
    target: monthly?.dailyCalorieTarget ?? 2000,
    protein: isLoggedDay(d) ? Math.round(d.totalProtein) : null,
    carbs: isLoggedDay(d) ? Math.round(d.totalCarbs) : null,
    fat: isLoggedDay(d) ? Math.round(d.totalFat) : null,
  }));

  // Stored in kg; charted and labelled in the user's unit (backlog P2-6).
  const system = preferences?.chefProfile?.preferredUnits ?? 'METRIC';

  // A day whose entries were all deleted keeps an empty log row: only days with
  // something in them count as logged.
  const loggedDays = (monthly?.days ?? []).filter(isLoggedDay);
  const daysLogged = loggedDays.length;
  const avgKcal =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((s, d) => s + d.totalKcal, 0) / loggedDays.length)
      : 0;
  // T-11.6: an average from one or two days is noise — show it from three.
  const enoughDays = hasEnoughDaysForAverage(daysLogged);
  const averageHint = moreDaysHint(daysLogged);
  const target = monthly?.dailyCalorieTarget ?? 2000;
  const diffPct = target > 0 ? Math.round(((avgKcal - target) / target) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">INSIGHTS</p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">Progress</h1>
      </div>

      {/* Stat summary */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          {
            icon: <Flame className="h-4 w-4 text-[#944a00]" />,
            label: 'Days logged',
            value: `${daysLogged}`,
          },
          ...(noNumbers
            ? []
            : [
                {
                  icon: <TrendingUp className="h-4 w-4 text-blue-500" />,
                  label: 'Avg kcal',
                  value: enoughDays && avgKcal > 0 ? avgKcal.toLocaleString() : '—',
                },
                {
                  icon: <Scale className="h-4 w-4 text-emerald-500" />,
                  label: 'vs target',
                  value: enoughDays && avgKcal > 0 ? `${diffPct > 0 ? '+' : ''}${diffPct}%` : '—',
                },
              ]),
        ].map((s, i) => (
          <div key={i} className="flex flex-col gap-1 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              {s.icon}
              {s.label}
            </div>
            <p className="text-xl font-bold text-neutral-800">{s.value}</p>
          </div>
        ))}
      </div>

      <div
        role="group"
        aria-label="Time range"
        className="mb-6 inline-flex rounded-xl bg-neutral-100 p-1"
      >
        {STATS_RANGES.map((n) => (
          <button
            key={n}
            type="button"
            data-testid={`progress-range-${n}`}
            aria-pressed={range === n}
            onClick={() => setRange(n)}
            className={`min-h-11 rounded-lg px-4 text-sm font-medium ${
              range === n ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
            }`}
          >
            {STATS_RANGE_LABELS[n]}
          </button>
        ))}
      </div>

      {!isLoading && averageHint && (
        <p data-testid="progress-average-hint" className="-mt-2 mb-6 text-xs text-neutral-500">
          {averageHint}
        </p>
      )}

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      )}

      {/* A failed load is not an empty history (audit F-X-3-1). */}
      {!isLoading && isError && !monthly && (
        <ErrorState
          title="Couldn't load your progress"
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
      )}

      {!isLoading && !(isError && !monthly) && !noNumbers && (
        <>
          {/* Calorie line chart */}
          <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">
              {`Calories — ${weekly ? 'Weekly Averages, ' : ''}Last ${STATS_RANGE_SPAN[range]}`}
            </p>
            {daysLogged === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
                No log data yet — start tracking in the{' '}
                <a
                  href="/tracker"
                  className="touch-target relative ml-1 text-[#944a00] hover:underline"
                >
                  Tracker
                </a>
                .
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    domain={[0, 'auto']}
                    allowDecimals={false}
                  />
                  <Tooltip formatter={(val) => [`${String(val)} kcal`]} />
                  <ReferenceLine
                    y={target}
                    stroke="#d1d5db"
                    strokeDasharray="4 4"
                    label={{ value: 'Target', position: 'right', fontSize: 10 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="logged"
                    stroke="#944a00"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={activeDot}
                    connectNulls={false}
                    name="Logged"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Macro stacked bar chart */}
          <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">
              {`Macros — ${weekly ? 'Weekly Averages, ' : ''}Last ${STATS_RANGE_SPAN[range]} (g)`}
            </p>
            {daysLogged === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
                No log data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    domain={[0, 'auto']}
                    allowDecimals={false}
                  />
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="protein" name="Protein" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="carbs" name="Carbs" stackId="a" fill="#10b981" />
                  <Bar dataKey="fat" name="Fat" stackId="a" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}

      {/* Weight: weigh-ins plus the trend line (lane D1) */}
      <WeightTrendSection
        entries={weightHistory ?? []}
        range={range}
        system={system}
        goal={preferences?.chefProfile?.goal}
      />

      {/* Body measurements: free, per-measure charts (lane D3) */}
      <BodyMeasurementsSection system={system} />
    </div>
  );
}
