'use client';

import Link from 'next/link';
import type { RouterOutputs } from '@/lib/trpc';
import { ChevronRight } from 'lucide-react';
import { cn, dayNutritionCaption, PLAN_STATUS_LABEL, planStatus } from '@chefer/utils';

// ─── Nutrition summary ────────────────────────────────────────────────────────
// Calorie ring + macro bars for today. Lives in the dashboard's right rail at
// xl+, and inline in the main column below that — it used to be `hidden lg:flex`
// only, which meant phones lost the most useful panel on the page entirely.

type Nutrition = RouterOutputs['dashboard']['summary']['nutrition'];

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Percentage of target, capped at 100 so the bar/ring never overshoots. */
function pct(value: number, target: number): number {
  return Math.min(Math.round((value / (target || 1)) * 100), 100);
}

interface NutritionSummaryProps {
  nutrition: Nutrition;
  /** Name of the next planned meal, used for the AI hint. Omit to hide it. */
  nextMealName?: string | undefined;
  className?: string;
}

export function NutritionSummary({ nutrition: n, nextMealName, className }: NutritionSummaryProps) {
  // The ring shows what was EATEN today (audit F-DASH-1-2: it showed planned
  // food — "540 remaining" with 6,070 kcal logged). The chip judges the plan
  // (three-state honesty, review P-2) via the shared rules in @chefer/utils.
  const calPct = pct(n.eatenKcal, n.dailyCalorieTarget);
  const overEaten = n.eatenKcal > n.dailyCalorieTarget;
  const targetStatus = planStatus(n.plannedKcal, n.dailyCalorieTarget);
  const ringFill = RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * calPct) / 100;

  return (
    <div
      data-testid="nutrition-summary"
      className={cn('rounded-2xl border bg-white p-4 shadow-sm sm:p-5', className)}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Today</p>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase',
            targetStatus === 'over' && 'bg-red-100 text-red-700',
            targetStatus === 'under' && 'bg-amber-100 text-amber-700',
            targetStatus === 'on' && 'bg-emerald-100 text-emerald-700',
            targetStatus === 'none' && 'bg-gray-100 text-gray-600',
          )}
        >
          {PLAN_STATUS_LABEL[targetStatus]}
        </span>
      </div>

      {/* Ring + macros sit side by side on wide phones/tablets, stacked in the
          narrow desktop rail. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 xl:flex-col xl:gap-4">
        {/* Calorie ring */}
        <div className="flex shrink-0 flex-col items-center gap-2 self-center py-2">
          <div className="relative">
            <svg
              width="128"
              height="128"
              viewBox="0 0 128 128"
              role="img"
              aria-label={`${n.eatenKcal} of ${n.dailyCalorieTarget} kcal eaten today`}
            >
              <circle
                cx="64"
                cy="64"
                r={RING_RADIUS}
                fill="none"
                stroke="#f3f4f6"
                strokeWidth="12"
              />
              <circle
                cx="64"
                cy="64"
                r={RING_RADIUS}
                fill="none"
                stroke={overEaten ? '#d97706' : '#944a00'}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringFill}
                transform="rotate(-90 64 64)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-xl font-bold text-gray-900">{n.eatenKcal.toLocaleString()}</p>
              <p className="text-xs text-gray-500">
                of {n.dailyCalorieTarget.toLocaleString()} kcal eaten
              </p>
            </div>
          </div>
          <p className="text-center text-xs text-gray-500">
            {dayNutritionCaption(n.eatenKcal, n.plannedKcal, n.dailyCalorieTarget)}
          </p>
        </div>

        {/* Macro bars */}
        <div className="flex flex-1 flex-col gap-3 sm:min-w-0">
          {[
            { label: 'Protein', v: n.protein.eaten, t: n.protein.targetG },
            { label: 'Carbs', v: n.carbs.eaten, t: n.carbs.targetG },
            { label: 'Fat', v: n.fat.eaten, t: n.fat.targetG },
          ].map(({ label, v, t }) => (
            <div key={label}>
              {/* gap-2 + whitespace-nowrap: in the 288px rail a three-digit
                  pair ("135g / 140g") butted straight up against the label. */}
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-gray-700">{label}</span>
                <span className="whitespace-nowrap text-gray-500">
                  {v}g / {t}g
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    v > t ? 'bg-amber-600' : 'bg-[#944a00]',
                  )}
                  style={{ width: `${pct(v, t)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next meal + a way to log it — the old line claimed every meal
          "supports your daily nutrition goals", which wasn't checked (F-PM-4). */}
      {nextMealName && (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-[#fff3e8] px-3 py-2.5">
          <p className="min-w-0 text-xs text-[#944a00]">
            Up next: <strong>{nextMealName}</strong>
          </p>
          <Link
            href="/tracker"
            className="flex min-h-11 shrink-0 items-center text-xs font-semibold text-[#944a00] hover:underline"
          >
            Log what you ate
          </Link>
        </div>
      )}

      {/* Quick links — redundant with the tab bar on mobile, so rail-only */}
      <div className="mt-4 hidden flex-col gap-1.5 xl:flex">
        <Link
          href="/meal-plan"
          className="flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium text-gray-600 hover:border-[#944a00]/30 hover:text-[#944a00]"
        >
          Meal Planner <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/shopping-list"
          className="flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium text-gray-600 hover:border-[#944a00]/30 hover:text-[#944a00]"
        >
          Shopping List <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
