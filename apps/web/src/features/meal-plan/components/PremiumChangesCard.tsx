'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Sparkles, X } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import { sumPlanDay } from '@chefer/utils';
import { dismissChanges, isChangesDismissed, missLines, type PlanMiss } from '../plan-miss';

// ─── What Premium changed (UX-10 §8, T-10.7) ───────────────────────────────────
// One-time card above the day view after a premium regeneration: what the
// generation did (server-built lines, honest about a miss), `Fix it` for a day
// outside the band, and `Compare with your free week` — both weeks' daily
// kcal/protein side by side. Dismissed per plan id.

export interface PremiumChangesData {
  lines: string[];
  targetHits: number;
  missDays: number;
  misses?: PlanMiss[] | undefined;
}

interface DayLike {
  dayOfWeek: number;
  meals: { type: string; portion?: number | undefined; recipe: { nutritionInfo: NutritionLike } }[];
}
interface NutritionLike {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PremiumChangesCard({
  planId,
  previousPlanId,
  changes,
  currentDays,
  onFix,
  className,
}: {
  planId: string;
  previousPlanId?: string | undefined;
  changes: PremiumChangesData;
  currentDays: readonly DayLike[];
  onFix: (dayOfWeek: number) => void;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(() => isChangesDismissed(planId));
  const [compareOpen, setCompareOpen] = useState(false);
  if (dismissed) return null;
  const misses = missLines(changes.misses ?? []);

  return (
    <div
      data-testid="premium-changes"
      className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 ${className ?? ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-amber-900">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          What Premium changed
        </h2>
        <button
          type="button"
          onClick={() => {
            dismissChanges(planId);
            setDismissed(true);
          }}
          aria-label="Dismiss what Premium changed"
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-amber-700 hover:bg-amber-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="mt-1 space-y-1 text-sm text-amber-900">
        {changes.lines.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true">·</span>
            <span className="min-w-0">{line}</span>
          </li>
        ))}
        {misses.map((miss) => (
          <li key={miss.text} className="flex flex-wrap items-center gap-x-2">
            <span aria-hidden="true">·</span>
            <span className="min-w-0">{miss.text}</span>
            <button
              type="button"
              data-testid="premium-changes-fix"
              onClick={() => onFix(miss.firstDay)}
              className="min-h-11 px-1 text-sm font-semibold text-[#944a00] underline-offset-2 hover:underline"
            >
              Fix it
            </button>
          </li>
        ))}
      </ul>
      {previousPlanId && (
        <button
          type="button"
          data-testid="premium-changes-compare"
          onClick={() => setCompareOpen(true)}
          className="mt-1 min-h-11 text-sm font-semibold text-[#944a00] underline-offset-2 hover:underline"
        >
          Compare with your free week
        </button>
      )}
      {previousPlanId && (
        <CompareDialog
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          previousPlanId={previousPlanId}
          currentDays={currentDays}
        />
      )}
    </div>
  );
}

function dayTotals(days: readonly DayLike[], dayOfWeek: number): { kcal: number; protein: number } {
  const day = days.find((d) => d.dayOfWeek === dayOfWeek);
  if (!day || day.meals.length === 0) return { kcal: 0, protein: 0 };
  const { kcal, protein } = sumPlanDay(day.meals);
  return { kcal: Math.round(kcal), protein: Math.round(protein) };
}

function CompareDialog({
  open,
  onClose,
  previousPlanId,
  currentDays,
}: {
  open: boolean;
  onClose: () => void;
  previousPlanId: string;
  currentDays: readonly DayLike[];
}) {
  const { data, isLoading, isError } = trpc.mealPlan.getById.useQuery(
    { planId: previousPlanId },
    { enabled: open, staleTime: 60_000 },
  );
  const cell = (t: { kcal: number; protein: number }) =>
    t.kcal > 0 ? `${t.kcal.toLocaleString('en-US')} kcal · ${t.protein} g` : 'Not planned';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Compare with your free week"
      description="Daily calories and protein, before and after"
      size="md"
    >
      <div className="px-5 pb-5" data-testid="premium-compare">
        {isLoading && <p className="py-6 text-center text-sm text-gray-500">Loading…</p>}
        {isError && (
          <p role="alert" className="py-6 text-center text-sm text-red-600">
            Couldn&apos;t load the free week.
          </p>
        )}
        {data && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th scope="col" className="py-2 pr-2">
                  Day
                </th>
                <th scope="col" className="py-2 pr-2">
                  Free week
                </th>
                <th scope="col" className="py-2">
                  Premium week
                </th>
              </tr>
            </thead>
            <tbody>
              {DAY_SHORT.map((label, dayOfWeek) => (
                <tr key={label} className="border-t border-gray-100">
                  <th scope="row" className="py-2 pr-2 font-medium text-gray-700">
                    {label}
                  </th>
                  <td className="py-2 pr-2 text-gray-600">
                    {cell(dayTotals(data.days, dayOfWeek))}
                  </td>
                  <td className="py-2 font-medium text-gray-900">
                    {cell(dayTotals(currentDays, dayOfWeek))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Sheet>
  );
}
