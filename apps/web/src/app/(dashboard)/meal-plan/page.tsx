'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { DayView } from '@/features/meal-plan/components/day-view';
import { DayRecapBar } from '@/features/meal-plan/components/DayRecapBar';
import { GenerateOverlay } from '@/features/meal-plan/components/GenerateOverlay';
import { MealCard } from '@/features/meal-plan/components/MealCard';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import type { ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { useIsPremium } from '@/hooks/useIsPremium';
import { useRecipeImageStream, type RecipeImageUpdate } from '@/hooks/useRecipeImageStream';
import { trpc } from '@/lib/trpc';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';

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
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawOffset = parseInt(searchParams.get('week') ?? '0', 10);
  const weekOffset = Number.isNaN(rawOffset)
    ? 0
    : Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, rawOffset));

  const setWeekOffset = (offset: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (offset === 0) {
      params.delete('week');
    } else {
      params.set('week', String(offset));
    }
    router.replace(`/meal-plan?${params.toString()}`, { scroll: false });
  };

  // Which day the mobile view shows. Kept in the URL alongside `week` so back,
  // forward and refresh all land on the day the user was actually looking at.
  const rawDay = parseInt(searchParams.get('day') ?? '', 10);
  const todayIndex = getTodayDayIndex();
  const selectedDay = Number.isNaN(rawDay) || rawDay < 0 || rawDay > 6 ? todayIndex : rawDay;

  const setSelectedDay = (day: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('day', String(day));
    router.replace(`/meal-plan?${params.toString()}`, { scroll: false });
  };

  const isPremium = useIsPremium();
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageOverrides, setImageOverrides] = useState<
    Record<string, { imageUrl: string | null; status: ImageStatusType }>
  >({});

  const isPast = weekOffset < 0;
  const isCurrent = weekOffset === 0;

  const {
    data: plan,
    isLoading,
    refetch,
  } = trpc.mealPlan.getForWeek.useQuery({ weekOffset }, { retry: false });

  // Collect pending recipe IDs for SSE subscription
  const pendingRecipeIds = useMemo(
    () =>
      plan
        ? plan.days
            .flatMap((d) => d.meals)
            .map((m) => m.recipe)
            .filter((r) => {
              const imageStatus = (r.imageStatus ?? 'DONE') as ImageStatusType;
              return imageStatus === 'PENDING' || imageStatus === 'GENERATING';
            })
            .map((r) => r.id)
        : [],
    [plan],
  );

  const handleImageUpdate = useCallback((update: RecipeImageUpdate) => {
    setImageOverrides((prev) => ({
      ...prev,
      [update.recipeId]: { imageUrl: update.imageUrl, status: update.status as ImageStatusType },
    }));
  }, []);

  // On SSE timeout, refetch real statuses from the DB instead of faking
  // failures — still-pending recipes re-open a fresh subscription.
  const handleStreamTimeout = useCallback(() => {
    void refetch();
  }, [refetch]);

  useRecipeImageStream(pendingRecipeIds, handleImageUpdate, handleStreamTimeout);

  // Photo generation progress (drives the pill next to Regenerate)
  const photosTotal = pendingRecipeIds.length;
  const photosReady = pendingRecipeIds.filter((id) => imageOverrides[id]).length;
  const photosInProgress = photosTotal > 0 && photosReady < photosTotal;

  const generateMutation = trpc.mealPlan.generate.useMutation({
    onMutate: () => setIsGenerating(true),
    onSettled: () => setIsGenerating(false),
    onSuccess: () => refetch(),
    onError: (err) => alert(`Failed to generate meal plan: ${err.message}`),
  });

  const handleGenerate = () => generateMutation.mutate({ weekOffset });

  // ── Navigation bar (always visible) ───────────────────────────────────────
  // Always derive label from weekOffset so it updates instantly on click,
  // regardless of whether a plan has loaded yet.
  const weekLabel = formatWeekLabel(getMondayOfWeekClient(weekOffset));

  const weekArrowCls =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8';

  const navBar = (
    <div className="flex shrink-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
      {/* Week navigator */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => setWeekOffset(Math.max(MIN_OFFSET, weekOffset - 1))}
          disabled={weekOffset <= MIN_OFFSET}
          aria-label="Previous week"
          className={weekArrowCls}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Flexes instead of a 200px floor, which overflowed once the status
            pill was alongside it. */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:flex-none sm:basis-[200px]">
          <CalendarDays className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-gray-700">{weekLabel}</span>
          {isPast && (
            <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:inline">
              Past
            </span>
          )}
          {isCurrent && (
            <span className="hidden shrink-0 rounded-full bg-[#fff3e8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#944a00] sm:inline">
              This Week
            </span>
          )}
          {weekOffset > 0 && (
            <span className="hidden shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600 sm:inline">
              Next Week
            </span>
          )}
        </div>

        <button
          onClick={() => setWeekOffset(Math.min(MAX_OFFSET, weekOffset + 1))}
          disabled={weekOffset >= MAX_OFFSET}
          aria-label="Next week"
          className={weekArrowCls}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Actions — only available for current/future weeks */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Photo generation progress */}
        {photosInProgress && (
          <span className="flex items-center gap-1.5 rounded-full border border-[#944a00]/20 bg-[#fff3e8] px-3 py-1 text-[11px] font-medium text-[#944a00]">
            <ImageIcon className="h-3 w-3 animate-pulse" />
            {photosReady} of {photosTotal} photos ready
          </span>
        )}

        {!isPast && (
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 sm:min-h-0 sm:flex-none"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            {plan ? 'Regenerate' : 'Generate'}
          </button>
        )}
      </div>
    </div>
  );

  // ── Always render navBar; swap only the body area ─────────────────────────
  return (
    <div className="flex h-full flex-col">
      {navBar}

      {/* Free-tier hint — generic plans, upgrade for personalisation */}
      {isPremium === false && (
        <div className="mx-4 mb-2 flex flex-col items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="flex items-start gap-2 text-xs text-amber-900">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            You&apos;re on the free plan: chef-picked generic recipes. Upgrade for AI plans tailored
            to your goals, allergies and preferences.
          </p>
          <UpgradeButton className="min-h-11 w-full sm:min-h-0 sm:w-auto sm:shrink-0" />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#944a00]/20 border-t-[#944a00]" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !plan && (
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
      )}

      {/* ── Mobile: one day at a time ──────────────────────────────────────── */}
      {!isLoading && plan && (
        <div className="px-4 pb-6 lg:hidden">
          <DayView
            days={plan.days}
            planId={plan.planId}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            todayIndex={isCurrent ? todayIndex : null}
            weekStartDate={getMondayOfWeekClient(weekOffset)}
            readOnly={isPast}
            imageOverrides={imageOverrides}
          />
        </div>
      )}

      {/* ── Desktop: the full week grid ────────────────────────────────────── */}
      {!isLoading && plan && (
        <div className="hidden flex-1 overflow-x-auto px-4 pb-6 lg:block">
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
                    {day.meals.map((slot) => {
                      const override = imageOverrides[slot.recipe.id];
                      return (
                        <MealCard
                          key={slot.type}
                          mealType={slot.type}
                          recipe={slot.recipe}
                          planId={plan.planId}
                          dayOfWeek={day.dayOfWeek}
                          readOnly={isPast}
                          imageUrlOverride={override?.imageUrl}
                          imageStatusOverride={override?.status}
                        />
                      );
                    })}

                    {/* Day totals */}
                    <DayRecapBar meals={day.meals} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isGenerating && <GenerateOverlay premium={isPremium !== false} />}
    </div>
  );
}
