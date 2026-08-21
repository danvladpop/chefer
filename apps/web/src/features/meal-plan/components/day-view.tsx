'use client';

import type { ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { UtensilsCrossed } from 'lucide-react';
import { cn } from '@chefer/utils';
import { DayRecapBar } from './DayRecapBar';
import { MealCard } from './MealCard';

// ─── Mobile day view ──────────────────────────────────────────────────────────
// A seven-column week grid has no phone equivalent — the desktop version needs
// 900px, which leaves about 38% of one column visible at 375px. Rather than
// shrink it, this presents one day at a time behind a horizontal day picker.
// Shared by the meal planner and the read-only history detail page.

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface NutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

interface MealSlot {
  type: string;
  recipe: {
    id: string;
    name: string;
    description: string;
    cuisineType: string;
    prepTimeMins: number;
    cookTimeMins: number;
    nutritionInfo: NutritionInfo;
    imageUrl?: string | null;
    imageStatus?: ImageStatusType;
  };
}

export interface PlanDay {
  dayOfWeek: number;
  meals: MealSlot[];
}

export type ImageOverrides = Record<string, { imageUrl: string | null; status: ImageStatusType }>;

interface DayViewProps {
  days: PlanDay[];
  planId: string;
  selectedDay: number;
  onSelectDay: (day: number) => void;
  /** 0-6 when the plan covers the current week, otherwise null. */
  todayIndex?: number | null;
  /** Date the week starts on, used for the day-number labels. */
  weekStartDate?: Date | undefined;
  readOnly?: boolean;
  imageOverrides?: ImageOverrides;
  className?: string;
}

export function DayView({
  days,
  planId,
  selectedDay,
  onSelectDay,
  todayIndex = null,
  weekStartDate,
  readOnly = false,
  imageOverrides = {},
  className,
}: DayViewProps) {
  const day = days.find((d) => d.dayOfWeek === selectedDay);
  const meals = day?.meals ?? [];

  const dayNumber = (index: number): number | null => {
    if (!weekStartDate) return null;
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + index);
    return date.getDate();
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Day picker — fixed-width snap chips so each stays a comfortable
          target instead of being divided down to ~41px. */}
      <div role="tablist" aria-label="Day of week" className="scroll-rail -mx-4 gap-2 px-4 pb-1">
        {DAY_SHORT.map((label, index) => {
          const isSelected = index === selectedDay;
          const isToday = index === todayIndex;
          const hasMeals = days.some((d) => d.dayOfWeek === index && d.meals.length > 0);
          const num = dayNumber(index);

          return (
            <button
              key={label}
              role="tab"
              aria-selected={isSelected}
              aria-label={`${DAY_LONG[index]}${isToday ? ', today' : ''}`}
              onClick={() => onSelectDay(index)}
              className={cn(
                'flex w-[60px] shrink-0 snap-start flex-col items-center gap-0.5 rounded-xl py-2.5 transition-colors',
                isSelected
                  ? 'bg-[#944a00] text-white shadow-sm'
                  : isToday
                    ? 'bg-[#fff3e8] text-[#944a00] ring-1 ring-[#944a00]/30'
                    : 'bg-gray-100 text-gray-600',
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
              {num !== null && <span className="text-sm font-bold leading-none">{num}</span>}
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 h-1.5 w-1.5 rounded-full',
                  !hasMeals ? 'bg-transparent' : isSelected ? 'bg-white/70' : 'bg-[#944a00]',
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Selected day heading */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-gray-900">
          {DAY_LONG[selectedDay]}
          {selectedDay === todayIndex && (
            <span className="ml-2 rounded-full bg-[#944a00] px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-white">
              Today
            </span>
          )}
        </h2>
        <span className="shrink-0 text-xs text-gray-500">
          {meals.length} {meals.length === 1 ? 'meal' : 'meals'}
        </span>
      </div>

      {/* Meals */}
      {meals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-gray-50 py-10 text-center">
          <UtensilsCrossed className="h-6 w-6 text-gray-400" aria-hidden="true" />
          <p className="text-sm text-gray-500">No meals planned for this day.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {meals.map((slot) => {
              const override = imageOverrides[slot.recipe.id];
              return (
                <MealCard
                  key={slot.type}
                  variant="row"
                  mealType={slot.type}
                  recipe={slot.recipe}
                  planId={planId}
                  dayOfWeek={selectedDay}
                  readOnly={readOnly}
                  imageUrlOverride={override?.imageUrl}
                  imageStatusOverride={override?.status}
                />
              );
            })}
          </div>
          <DayRecapBar meals={meals} />
        </>
      )}
    </div>
  );
}
