'use client';

import Link from 'next/link';
import { use } from 'react';
import { MealCard } from '@/features/meal-plan/components/MealCard';
import { trpc } from '@/lib/trpc';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export default function HistoryPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);

  const { data: plan, isLoading } = trpc.mealPlan.getById.useQuery(
    { planId },
    { staleTime: 60_000 },
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mb-6 h-6 w-48 animate-pulse rounded bg-neutral-200" />
        <div className="grid grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-6 animate-pulse rounded bg-neutral-200" />
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="h-32 animate-pulse rounded-xl bg-neutral-100" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-neutral-500">Plan not found.</p>
        <Link href="/history" className="mt-4 text-sm text-primary hover:underline">
          ← Back to History
        </Link>
      </div>
    );
  }

  const weekStart = new Date(plan.weekStartDate);

  return (
    <div className="p-4">
      {/* Back link */}
      <Link
        href="/history"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to History
      </Link>

      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          READ-ONLY VIEW
        </p>
        <h1 className="text-xl font-bold">Week of {format(weekStart, 'dd MMM yyyy')}</h1>
      </div>

      {/* Week grid */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 gap-3">
          {DAY_LABELS.map((label, colIdx) => {
            const dayPlan = plan.days.find((d) => d.dayOfWeek === colIdx);
            const dayDate = new Date(weekStart);
            dayDate.setDate(weekStart.getDate() + colIdx);

            return (
              <div key={label} className="space-y-2">
                {/* Column header */}
                <div className="py-2 text-center">
                  <p className="text-xs font-semibold text-neutral-500">{label}</p>
                  <p className="text-sm font-bold text-neutral-700">{format(dayDate, 'd')}</p>
                </div>

                {/* Meal rows */}
                {MEAL_TYPES.map((mealType) => {
                  const slot = dayPlan?.meals.find((m) => m.type === mealType);
                  if (!slot) {
                    return (
                      <div
                        key={mealType}
                        className="flex h-28 items-center justify-center rounded-xl border border-dashed border-neutral-200"
                      >
                        <span className="text-xs text-neutral-300">—</span>
                      </div>
                    );
                  }
                  return (
                    <div key={mealType} className="pointer-events-none opacity-90">
                      <MealCard
                        mealType={mealType}
                        recipe={slot.recipe}
                        planId={plan.planId}
                        dayOfWeek={colIdx}
                        readOnly
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
