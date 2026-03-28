'use client';

import { useState } from 'react';
import { DayRecapBar } from '@/features/meal-plan/components/DayRecapBar';
import { GenerateOverlay } from '@/features/meal-plan/components/GenerateOverlay';
import { MealCard } from '@/features/meal-plan/components/MealCard';
import { trpc } from '@/lib/trpc';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Wand2 } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MIN_OFFSET = -1;
const MAX_OFFSET = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWeekLabel(weekStartDate: Date): string {
  const start = new Date(weekStartDate);
  const end = new Date(weekStartDate);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)}`;
}

/** Returns 0=Monday … 6=Sunday for today, matching dayOfWeek in the plan. */
function getTodayDayIndex(): number {
  const jsDay = new Date().getDay(); // 0=Sun, 1=Mon … 6=Sat
  return jsDay === 0 ? 6 : jsDay - 1;
}

// Client-side helper to compute Monday of a given week offset
function getMondayOfWeekClient(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MealPlanPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const isPast = weekOffset < 0;
  const isCurrent = weekOffset === 0;
  const todayIndex = getTodayDayIndex();

  const {
    data: plan,
    isLoading,
    refetch,
  } = trpc.mealPlan.getForWeek.useQuery({ weekOffset }, { retry: false });

  const generateMutation = trpc.mealPlan.generate.useMutation({
    onMutate: () => setIsGenerating(true),
    onSettled: () => setIsGenerating(false),
    onSuccess: () => refetch(),
    onError: (err) => alert(`Failed to generate meal plan: ${err.message}`),
  });

  const handleGenerate = () => generateMutation.mutate();

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#944a00]/20 border-t-[#944a00]" />
      </div>
    );
  }

  // ── Navigation bar (always visible) ───────────────────────────────────────
  const weekLabel = plan
    ? formatWeekLabel(plan.weekStartDate)
    : formatWeekLabel(getMondayOfWeekClient(weekOffset));

  const navBar = (
    <div className="flex shrink-0 items-center justify-between px-6 py-4">
      {/* Week navigator */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeekOffset((o) => Math.max(MIN_OFFSET, o - 1))}
          disabled={weekOffset <= MIN_OFFSET}
          aria-label="Previous week"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex min-w-[200px] items-center justify-center gap-2">
          <CalendarDays className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{weekLabel}</span>
          {isPast && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Past
            </span>
          )}
          {isCurrent && (
            <span className="rounded-full bg-[#fff3e8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#944a00]">
              This Week
            </span>
          )}
          {weekOffset > 0 && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
              Next Week
            </span>
          )}
        </div>

        <button
          onClick={() => setWeekOffset((o) => Math.min(MAX_OFFSET, o + 1))}
          disabled={weekOffset >= MAX_OFFSET}
          aria-label="Next week"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Actions — only available for current/future weeks */}
      {!isPast && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          {plan ? 'Regenerate' : 'Generate'}
        </button>
      )}
    </div>
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!plan) {
    return (
      <div className="flex h-full flex-col">
        {navBar}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#fff3e8] text-4xl">
            🍽️
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {isPast ? 'No plan for this week' : 'No meal plan yet'}
            </h2>
            <p className="mt-1 max-w-xs text-sm text-gray-500">
              {isPast
                ? 'No meal plan was created for this week.'
                : 'Generate a personalised 7-day plan based on your goals and dietary preferences.'}
            </p>
          </div>
          {!isPast && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 rounded-xl bg-[#944a00] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#7a3d00] disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" />
              Generate my meal plan
            </button>
          )}
        </div>
        {isGenerating && <GenerateOverlay />}
      </div>
    );
  }

  // ── Week view ──────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {navBar}

      {/* 7-day grid — horizontally scrollable on small screens */}
      <div className="flex-1 overflow-x-auto px-4 pb-6">
        <div className="grid min-w-[900px] grid-cols-7 gap-3">
          {plan.days.map((day) => {
            const isToday = isCurrent && day.dayOfWeek === todayIndex;
            return (
              <div key={day.dayOfWeek} className="flex flex-col gap-2">
                {/* Day header — fixed height so all headers are the same size */}
                <div
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-center transition-colors ${
                    isToday ? 'bg-[#944a00] shadow-sm' : 'bg-gray-100'
                  }`}
                >
                  <p
                    className={`text-xs font-semibold ${isToday ? 'text-white' : 'text-gray-700'}`}
                  >
                    {DAY_NAMES[day.dayOfWeek]}
                  </p>
                  {isToday && (
                    <span className="rounded-full bg-white/25 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">
                      Today
                    </span>
                  )}
                </div>

                {/* Column highlight wrapper for today */}
                <div
                  className={`flex flex-col gap-2 rounded-xl p-1 ${
                    isToday ? 'bg-[#944a00]/10 ring-2 ring-[#944a00]/40' : ''
                  }`}
                >
                  {/* Meal cards */}
                  {day.meals.map((slot) => (
                    <MealCard
                      key={slot.type}
                      mealType={slot.type}
                      recipe={slot.recipe}
                      planId={plan.planId}
                      dayOfWeek={day.dayOfWeek}
                      readOnly={isPast}
                    />
                  ))}

                  {/* Day totals */}
                  <DayRecapBar meals={day.meals} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isGenerating && <GenerateOverlay />}
    </div>
  );
}
