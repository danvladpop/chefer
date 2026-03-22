'use client';

import { useState } from 'react';
import { DayRecapBar } from '@/features/meal-plan/components/DayRecapBar';
import { GenerateOverlay } from '@/features/meal-plan/components/GenerateOverlay';
import { MealCard } from '@/features/meal-plan/components/MealCard';
import { trpc } from '@/lib/trpc';
import { CalendarDays, RefreshCw, Wand2 } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MealPlanPage() {
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    data: plan,
    isLoading,
    refetch,
  } = trpc.mealPlan.getActive.useQuery(undefined, {
    retry: false,
  });

  const generateMutation = trpc.mealPlan.generate.useMutation({
    onMutate: () => setIsGenerating(true),
    onSettled: () => setIsGenerating(false),
    onSuccess: () => refetch(),
    onError: (err) => {
      alert(`Failed to generate meal plan: ${err.message}`);
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate();
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#944a00]/20 border-t-[#944a00]" />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!plan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#fff3e8] text-4xl">
          🍽️
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">No meal plan yet</h2>
          <p className="mt-1 max-w-xs text-sm text-gray-500">
            Generate a personalised 7-day plan based on your goals and dietary preferences.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-2 rounded-xl bg-[#944a00] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#7a3d00] disabled:opacity-50"
        >
          <Wand2 className="h-4 w-4" aria-hidden="true" />
          Generate my meal plan
        </button>
        {isGenerating && <GenerateOverlay />}
      </div>
    );
  }

  // ── Week view ──────────────────────────────────────────────────────────────
  const weekLabel = formatWeekLabel(plan.weekStartDate);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          <span>{weekLabel}</span>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Regenerate
        </button>
      </div>

      {/* 7-day grid — horizontally scrollable on small screens */}
      <div className="flex-1 overflow-x-auto px-4 pb-6">
        <div className="grid min-w-[900px] grid-cols-7 gap-3">
          {plan.days.map((day) => (
            <div key={day.dayOfWeek} className="flex flex-col gap-2">
              {/* Day header */}
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-center">
                <p className="text-xs font-semibold text-gray-700">{DAY_NAMES[day.dayOfWeek]}</p>
              </div>

              {/* Meal cards */}
              <div className="flex flex-col gap-2">
                {day.meals.map((slot) => (
                  <MealCard
                    key={slot.type}
                    mealType={slot.type}
                    recipe={slot.recipe}
                    planId={plan.planId}
                    dayOfWeek={day.dayOfWeek}
                  />
                ))}
              </div>

              {/* Day totals */}
              <DayRecapBar meals={day.meals} />
            </div>
          ))}
        </div>
      </div>

      {isGenerating && <GenerateOverlay />}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWeekLabel(weekStartDate: Date): string {
  const start = new Date(weekStartDate);
  const end = new Date(weekStartDate);
  end.setDate(end.getDate() + 6);

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `Week of ${start.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)}`;
}
