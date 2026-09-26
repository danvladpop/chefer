'use client';

import Link from 'next/link';
import { useUnitSystem } from '@/hooks/useUnitSystem';
import { trpc } from '@/lib/trpc';
import { Scale } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import { bodyWeightInUnit, bodyWeightUnit, formatBodyWeight } from '@chefer/utils';
import { WeightLogForm } from './WeightLogForm';

// ─── Dashboard weight quick-entry + 30-day sparkline (F1, coach) ──────────────
// Weight logging is FREE — it's data honesty, and it feeds the free-tier
// review teaser. Persists through the EXISTING tracker.logWeight /
// tracker.weightHistory procedures (wave-0 deviation: no separate coach
// weight store). Chart conventions follow /progress (recharts, emerald line).

export function WeightCard() {
  const { data: history } = trpc.tracker.weightHistory.useQuery(
    { days: 30 },
    { staleTime: 60_000 },
  );
  const { data: review } = trpc.coach.currentReview.useQuery(undefined, { staleTime: 60_000 });
  // Stored in kg; shown in the user's unit (backlog P2-6).
  const system = useUnitSystem();
  const unit = bodyWeightUnit(system);

  const entries = history ?? [];
  const chartData = entries.map((w) => ({ weight: bodyWeightInUnit(w.weightKg, system) }));
  const latest = entries[entries.length - 1];
  const first = entries[0];
  const delta =
    latest != null && first != null && entries.length > 1 ? latest.weightKg - first.weightKg : null;

  const today = new Date().toDateString();
  const todayEntry =
    latest && new Date(latest.recordedAt).toDateString() === today ? latest : undefined;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-500">
          <Scale className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
          Weight
        </p>
        {latest && (
          <p className="min-w-0 truncate text-xs text-gray-500">
            <span className="font-semibold text-gray-800">
              {formatBodyWeight(latest.weightKg, system)}
            </span>
            {delta != null && Math.abs(delta) >= 0.05 && (
              <span className={delta < 0 ? 'text-emerald-600' : 'text-gray-500'}>
                {' '}
                ({formatBodyWeight(delta, system, { signed: true })} / 30d)
              </span>
            )}
          </p>
        )}
      </div>

      {/* 30-day sparkline — axis-free on purpose; /progress has the full chart. */}
      {chartData.length > 1 ? (
        <ResponsiveContainer width="100%" height={56}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Tooltip formatter={(val) => [`${String(val)} ${unit}`]} labelFormatter={() => ''} />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="py-2 text-sm text-gray-500">
          Log your weight a couple of times a week and your chef can read the trend.
        </p>
      )}

      {/* Quick entry */}
      <div className="mt-3">
        <WeightLogForm
          {...(todayEntry && {
            placeholder: `Logged today: ${formatBodyWeight(todayEntry.weightKg, system)}`,
          })}
        />
      </div>
      {entries.length > 0 && (
        <Link
          href="/progress#weight-entries"
          className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-[#944a00] hover:underline"
        >
          Edit or delete entries
        </Link>
      )}

      {/* Coaching hint — the engagement loop toward the Sunday review. */}
      {review?.status === 'none' && review.daysNeeded > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Log meals on {review.daysNeeded} more day{review.daysNeeded === 1 ? '' : 's'} this week
          and your chef will write you a Sunday review.
        </p>
      )}
    </div>
  );
}
