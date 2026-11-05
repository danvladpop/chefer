'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { useT } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { Calendar, ChevronRight, RotateCcw } from 'lucide-react';
import { UseWeekAgainSheet } from './UseWeekAgainSheet';

interface PlanHistoryCardProps {
  plan: {
    id: string;
    weekStartDate: Date | string;
    weekEndDate: Date | string;
    status: string;
    createdAt: Date | string;
    recipePreview: string[];
    macroSummary: {
      avgKcal: number;
      avgProtein: number;
      avgCarbs: number;
      avgFat: number;
    };
  };
  onRestored?: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-orange-100 text-orange-700',
  ARCHIVED: 'bg-neutral-100 text-neutral-600',
  DRAFT: 'bg-blue-100 text-blue-600',
};

export function PlanHistoryCard({ plan, onRestored }: PlanHistoryCardProps) {
  const [useAgainOpen, setUseAgainOpen] = useState(false);
  const { proteinOnly, noNumbers } = useNumbersMode();
  const { t, date } = useT();

  const weekStart = new Date(plan.weekStartDate);
  const weekEnd = new Date(plan.weekEndDate);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5 transition hover:shadow-md">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-neutral-500" />
          <span className="text-sm font-semibold">
            {t('plan.history.weekRange', {
              start: date(weekStart, 'short'),
              end: date(weekEnd, 'medium'),
            })}
          </span>
        </div>
        {/* Only a replaced week needs a badge; the raw "ACTIVE" enum on every
            past week read as if the week were still running. */}
        {plan.status !== 'ACTIVE' && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES['ARCHIVED']}`}
          >
            {t('plan.history.replaced')}
          </span>
        )}
      </div>

      {/* Recipe preview chips */}
      {plan.recipePreview.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {plan.recipePreview.map((name) => (
            <span
              key={name}
              className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Macro summary */}
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        {/* WP-08: protein-only mode shows protein, never kcal, for a past week too;
            lane E3 "Hide numbers" shows neither. */}
        {noNumbers ? null : proteinOnly ? (
          <span>
            {rich(t, 'plan.history.proteinAvg', {
              protein: (
                <span className="font-medium text-neutral-700">{plan.macroSummary.avgProtein}</span>
              ),
            })}
          </span>
        ) : (
          <>
            <span>
              {rich(t, 'plan.history.kcalAvg', {
                kcal: (
                  <span className="font-medium text-neutral-700">{plan.macroSummary.avgKcal}</span>
                ),
              })}
            </span>
            <span>
              {rich(t, 'plan.history.proteinShortP', {
                protein: (
                  <span className="font-medium text-neutral-700">
                    {plan.macroSummary.avgProtein}
                  </span>
                ),
              })}
            </span>
            <span>
              {rich(t, 'plan.history.macrosCarbsShort', {
                carbs: (
                  <span className="font-medium text-neutral-700">{plan.macroSummary.avgCarbs}</span>
                ),
              })}
            </span>
            <span>
              {rich(t, 'plan.history.macrosFatShort', {
                fat: (
                  <span className="font-medium text-neutral-700">{plan.macroSummary.avgFat}</span>
                ),
              })}
            </span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link
          href={`/history/${plan.id}`}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          {t('plan.history.view')} <ChevronRight className="h-3 w-3" />
        </Link>
        {/* UX-PLAN-11: any past week can be cooked again, into this or next week. */}
        <button
          type="button"
          data-testid={`past-week-use-again-${plan.id}`}
          onClick={() => setUseAgainOpen(true)}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-300 px-3 text-xs font-medium text-orange-600 transition hover:bg-orange-50"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          {t('plan.history.useAgain')}
        </button>
      </div>
      <UseWeekAgainSheet
        planId={plan.id}
        weekLabel={date(weekStart, 'short')}
        open={useAgainOpen}
        onClose={() => setUseAgainOpen(false)}
        {...(onRestored && { onDone: onRestored })}
      />
    </div>
  );
}
