'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { UseWeekAgainSheet } from '@/features/history/components/UseWeekAgainSheet';
import { DayView } from '@/features/meal-plan/components/day-view';
import { MealCard } from '@/features/meal-plan/components/MealCard';
import { trpc } from '@/lib/trpc';
import { format } from 'date-fns';
import { ArrowLeft, BookmarkPlus, RotateCcw } from 'lucide-react';
import { defaultSavedWeekName, userFacingErrorMessage } from '@chefer/utils';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function HistoryPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  // Local state is enough here: unlike the planner there is no week param to
  // stay in sync with, and this is a read-only view.
  const [selectedDay, setSelectedDay] = useState(0);
  const [useAgainOpen, setUseAgainOpen] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);

  // UX-PLAN-11: keep this week as one of the (max 4) saved weeks.
  const saveAsWeek = trpc.mealPlan.saveAsTemplate.useMutation({
    meta: { silent: true },
    onSuccess: (saved) => setSavedName(saved.name),
  });

  const { data: plan, isLoading } = trpc.mealPlan.getById.useQuery(
    { planId },
    { staleTime: 60_000 },
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mb-6 h-6 w-48 animate-pulse rounded bg-neutral-200" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
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
        <Link
          href="/my-weeks"
          className="mt-4 inline-flex min-h-11 items-center text-sm text-primary hover:underline"
        >
          ← Back to My weeks
        </Link>
      </div>
    );
  }

  const weekStart = new Date(plan.weekStartDate);

  return (
    <div className="p-4">
      {/* Back link */}
      <Link
        href="/my-weeks"
        className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm text-neutral-600 transition hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My weeks
      </Link>

      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          READ-ONLY VIEW
        </p>
        <h1 className="text-xl font-bold">Week of {format(weekStart, 'dd MMM yyyy')}</h1>
      </div>

      {/* UX-PLAN-11: a past week can be cooked again, or kept as a saved week. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="history-plan-use-again"
          onClick={() => setUseAgainOpen(true)}
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-orange-300 px-4 text-sm font-medium text-orange-600 transition hover:bg-orange-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Use this week again
        </button>
        <button
          type="button"
          data-testid="history-plan-save-week"
          disabled={saveAsWeek.isPending || savedName !== null}
          onClick={() =>
            saveAsWeek.mutate({ planId: plan.planId, name: defaultSavedWeekName(weekStart) })
          }
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-neutral-200 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
        >
          <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
          Save as a week
        </button>
        {savedName && (
          <p role="status" className="text-xs text-emerald-700">
            Saved as “{savedName}” in My weeks.
          </p>
        )}
        {saveAsWeek.error && (
          <p role="alert" className="text-xs text-red-600">
            {userFacingErrorMessage(saveAsWeek.error)}
          </p>
        )}
      </div>
      <UseWeekAgainSheet
        planId={plan.planId}
        weekLabel={format(weekStart, 'dd MMM')}
        open={useAgainOpen}
        onClose={() => setUseAgainOpen(false)}
      />

      {/* Mobile: one day at a time, same component the planner uses */}
      <div className="lg:hidden">
        <DayView
          days={plan.days}
          planId={plan.planId}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          weekStartDate={weekStart}
          readOnly
        />
      </div>

      {/* Desktop: the full week grid */}
      <div className="hidden overflow-x-auto lg:block">
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

                {/* Every slot in plan order, like the planner grid: a curated
                    day can hold two snacks, and picking one slot per meal
                    type hid the second. */}
                {dayPlan && dayPlan.meals.length > 0 ? (
                  dayPlan.meals.map((slot, slotIndex) => (
                    <div
                      key={`${slot.type}-${slotIndex}`}
                      className="pointer-events-none opacity-90"
                    >
                      <MealCard
                        mealType={slot.type}
                        recipe={slot.recipe}
                        planId={plan.planId}
                        dayOfWeek={colIdx}
                        slotIndex={slotIndex}
                        leftoverLabel={slot.leftoverOf}
                        portion={slot.portion}
                        eaten={dayPlan.loggedRecipeIds?.includes(slot.recipe.id) === true}
                        readOnly
                      />
                    </div>
                  ))
                ) : (
                  <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-neutral-200">
                    <span className="text-xs text-neutral-300">—</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
