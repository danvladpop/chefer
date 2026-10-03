'use client';

import Link from 'next/link';
import { useState } from 'react';
import { format } from 'date-fns';
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

  const weekStart = new Date(plan.weekStartDate);
  const weekEnd = new Date(plan.weekEndDate);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5 transition hover:shadow-md">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-neutral-500" />
          <span className="text-sm font-semibold">
            Week of {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
          </span>
        </div>
        {/* Only a replaced week needs a badge; the raw "ACTIVE" enum on every
            past week read as if the week were still running. */}
        {plan.status !== 'ACTIVE' && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES['ARCHIVED']}`}
          >
            Replaced
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
        <span>
          <span className="font-medium text-neutral-700">{plan.macroSummary.avgKcal}</span> kcal avg
        </span>
        <span>
          <span className="font-medium text-neutral-700">{plan.macroSummary.avgProtein}g</span> P
        </span>
        <span>
          <span className="font-medium text-neutral-700">{plan.macroSummary.avgCarbs}g</span> C
        </span>
        <span>
          <span className="font-medium text-neutral-700">{plan.macroSummary.avgFat}g</span> F
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link
          href={`/history/${plan.id}`}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          View <ChevronRight className="h-3 w-3" />
        </Link>
        {/* UX-PLAN-11: any past week can be cooked again, into this or next week. */}
        <button
          type="button"
          data-testid={`past-week-use-again-${plan.id}`}
          onClick={() => setUseAgainOpen(true)}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-300 px-3 text-xs font-medium text-orange-600 transition hover:bg-orange-50"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Use again
        </button>
      </div>
      <UseWeekAgainSheet
        planId={plan.id}
        weekLabel={format(weekStart, 'dd MMM')}
        open={useAgainOpen}
        onClose={() => setUseAgainOpen(false)}
        {...(onRestored && { onDone: onRestored })}
      />
    </div>
  );
}
