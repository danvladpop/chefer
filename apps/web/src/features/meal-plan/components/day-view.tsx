'use client';

import type { ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { Check, UtensilsCrossed } from 'lucide-react';
import type { PlanTailoring, PlanTrainingDay } from '@chefer/types';
import { pressControl } from '@chefer/ui';
import {
  cn,
  PLAN_TAILORING_COPY,
  tailoringDayLabel,
  tailoringDayState,
  trainingChipA11y,
  type TailoringDayState,
} from '@chefer/utils';
import { DayRecapBar } from './DayRecapBar';
import { MealCard } from './MealCard';
import { PreRunNote, preRunNoteFor, TrainingDayHeader, TrainingGlyph } from './TrainingDayHeader';

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
  /** F3 leftovers: source-day name when the slot re-plates a dinner. */
  leftoverOf?: string;
  /** P1-1: servings of the recipe this slot is (absent = 1). */
  portion?: number;
  /** §T-07.4/T-08.9: "Your pick" — survives Regenerate by default. */
  pinned?: boolean;
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
  /** P1-1: grams short of the protein target, when meaningfully short. */
  proteinGapG?: number;
  /**
   * §T-07.2/T-07.6: false when this day is outside the chosen plan shape
   * (`meals` is `[]`) — recomputed from the CURRENT stored shape on every
   * read, not just right after `generate`. Absent = treat as planned.
   */
  planned?: boolean;
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
  /** Daily calorie target for the DayRecapBar's off-target badge (P-1). */
  calorieTarget?: number | undefined;
  /**
   * Opens the replace-recipe sheet for a slot (mealType, mealName, index in
   * `day.meals`, and the recipe currently in it — T-08.10, never re-offered).
   */
  onReplaceMeal?:
    | ((mealType: string, mealName: string, slotIndex: number, recipeId: string) => void)
    | undefined;
  /** Toggles `pinned` on a slot (§T-07.4/T-08.9). */
  onTogglePin?: ((mealType: string, slotIndex: number, pinned: boolean) => void) | undefined;
  /** §T-07.6 (UX-07 "Plan this day"): fills this currently-unplanned day. */
  onPlanDay?: ((dayOfWeek: number) => void) | undefined;
  /** True while `onPlanDay`'s mutation is running for THIS day. */
  planDayPending?: boolean;
  /** Live summary of the plan shape, e.g. "Breakfast, lunch, dinner · every day". */
  planShapeSummary?: string | undefined;
  /** Live tailoring (premium instant week): per-day chip markers. */
  tailoring?: PlanTailoring | null | undefined;
  /** Days the chef replaced moments ago — their meals fade in. */
  updatedDays?: ReadonlySet<number> | undefined;
  /** T-06.8: the week's training days (glyph on the chip, header above the meals). */
  trainingDays?: readonly PlanTrainingDay[] | undefined;
  /** Opens the training explain dialog (owned by the page — the desktop grid shares it). */
  onOpenTrainingExplain?: (() => void) | undefined;
  /** T-11.3: opens the plan-miss sheet for a day whose total misses its target. */
  onOpenMiss?: ((dayOfWeek: number) => void) | undefined;
}

/**
 * A day's live-tailoring marker: ✓ tailored, a soft pulse while the chef is
 * on it, a hollow ring while it waits its turn; nothing otherwise. The pulse
 * is CSS, so the global reduced-motion rule stills it.
 */
export function TailoringDayMark({
  state,
  onDark = false,
}: {
  state: TailoringDayState;
  onDark?: boolean;
}) {
  if (state === 'tailored') {
    return (
      <Check
        aria-hidden="true"
        data-testid="tailor-mark-tailored"
        className={cn('h-3 w-3 shrink-0', onDark ? 'text-white' : 'text-emerald-600')}
      />
    );
  }
  if (state === 'tailoring') {
    return (
      <span
        aria-hidden="true"
        data-testid="tailor-mark-tailoring"
        className={cn(
          'h-2 w-2 shrink-0 animate-pulse rounded-full',
          onDark ? 'bg-white' : 'bg-[#944a00]',
        )}
      />
    );
  }
  if (state === 'waiting') {
    return (
      <span
        aria-hidden="true"
        data-testid="tailor-mark-waiting"
        className={cn(
          'h-2 w-2 shrink-0 rounded-full border',
          onDark ? 'border-white/80' : 'border-[#944a00]/50',
        )}
      />
    );
  }
  return null;
}

export function DayView({
  days,
  calorieTarget,
  planId,
  selectedDay,
  onSelectDay,
  todayIndex = null,
  weekStartDate,
  readOnly = false,
  imageOverrides = {},
  className,
  onReplaceMeal,
  onTogglePin,
  onPlanDay,
  planDayPending = false,
  planShapeSummary,
  tailoring,
  updatedDays,
  trainingDays,
  onOpenTrainingExplain,
  onOpenMiss,
}: DayViewProps) {
  const day = days.find((d) => d.dayOfWeek === selectedDay);
  const meals = day?.meals ?? [];
  const trainingToday = trainingDays?.find((t) => t.dayOfWeek === selectedDay);
  const preRun = preRunNoteFor(trainingDays, selectedDay);
  // A training day's target carries its bump when the viewer's tier applies it.
  const dayTarget =
    trainingToday?.applied && trainingToday.targetKcal !== undefined
      ? trainingToday.targetKcal
      : calorieTarget;

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
          const tailorState = tailoringDayState(tailoring, index);
          const tailorLabel = tailoringDayLabel(tailorState);
          const training = trainingDays?.find((t) => t.dayOfWeek === index);
          const marked =
            tailorState === 'tailored' || tailorState === 'tailoring' || tailorState === 'waiting';

          return (
            <button
              key={label}
              role="tab"
              aria-selected={isSelected}
              aria-label={`${
                training ? trainingChipA11y(DAY_LONG[index] ?? '', training.kind) : DAY_LONG[index]
              }${isToday ? ', today' : ''}${tailorLabel ? `, ${tailorLabel}` : ''}`}
              data-tailoring={tailorState}
              onClick={() => onSelectDay(index)}
              className={cn(
                'flex w-[60px] shrink-0 snap-start flex-col items-center gap-0.5 rounded-xl py-2.5',
                pressControl,
                isSelected
                  ? 'bg-[#944a00] text-white shadow-sm'
                  : isToday
                    ? 'bg-[#fff3e8] text-[#944a00] ring-1 ring-[#944a00]/30'
                    : 'bg-gray-100 text-gray-600',
              )}
            >
              <span className="flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide">
                {label}
                {training && <TrainingGlyph kind={training.kind} className="h-2.5 w-2.5" />}
              </span>
              {num !== null && <span className="text-sm font-bold leading-none">{num}</span>}
              {/* Fixed-height slot: the dot and the tailoring marks swap
                  without moving the chip's content. */}
              <span className="mt-0.5 flex h-3 items-center justify-center">
                {marked ? (
                  <TailoringDayMark state={tailorState} onDark={isSelected} />
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      !hasMeals ? 'bg-transparent' : isSelected ? 'bg-white/70' : 'bg-[#944a00]',
                    )}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected day heading */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-gray-900">
          {DAY_LONG[selectedDay]}
          {selectedDay === todayIndex && (
            <span className="ml-2 rounded-full bg-[#944a00] px-2 py-0.5 align-middle text-xs font-semibold uppercase tracking-wide text-white">
              Today
            </span>
          )}
        </h2>
        <span className="shrink-0 text-xs text-gray-500">
          {updatedDays?.has(selectedDay) ? (
            <span
              data-testid="plan-day-updated"
              className="font-semibold text-emerald-700 animate-in fade-in-0 duration-base"
            >
              {PLAN_TAILORING_COPY.dayUpdated}
            </span>
          ) : (
            <>
              {meals.length} {meals.length === 1 ? 'meal' : 'meals'}
            </>
          )}
        </span>
      </div>

      {trainingToday && onOpenTrainingExplain && (
        <TrainingDayHeader
          day={trainingToday}
          isToday={selectedDay === todayIndex}
          onOpen={onOpenTrainingExplain}
        />
      )}
      {preRun && <PreRunNote note={preRun} />}

      {/* Meals */}
      {meals.length === 0 ? (
        // §T-07.3/T-07.6 (UX-07 §2): a day outside the chosen shape says so
        // and offers to add it via `planDay` — `planned` is now reliable on
        // every read (T-07.6), not just right after generate.
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-gray-50 py-10 text-center">
          <UtensilsCrossed className="h-6 w-6 text-gray-400" aria-hidden="true" />
          {day?.planned === false ? (
            <>
              <p data-testid="plan-day-unplanned" className="text-sm text-gray-500">
                Not planned — you cook {planShapeSummary ?? 'some days'}.
              </p>
              {!readOnly && onPlanDay && (
                <button
                  type="button"
                  data-testid="plan-day-add"
                  disabled={planDayPending}
                  onClick={() => onPlanDay(selectedDay)}
                  className="min-h-11 px-2 text-xs font-semibold text-[#944a00] hover:underline disabled:opacity-50"
                >
                  {planDayPending ? 'Planning…' : 'Plan this day'}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">No meals planned for this day.</p>
          )}
        </div>
      ) : (
        <>
          <div
            // New meals from the chef fade in (MO-13 crossfade — opacity
            // only; instant under reduced motion via the global rule).
            key={meals.map((m) => m.recipe.id).join(',')}
            className={cn(
              'flex flex-col gap-3',
              updatedDays?.has(selectedDay) &&
                'animate-in fade-in-0 duration-deliberate ease-enter',
            )}
          >
            {meals.map((slot, slotIndex) => {
              const override = imageOverrides[slot.recipe.id];
              return (
                <MealCard
                  key={`${slot.type}-${slotIndex}`}
                  variant="row"
                  mealType={slot.type}
                  recipe={slot.recipe}
                  planId={planId}
                  dayOfWeek={selectedDay}
                  slotIndex={slotIndex}
                  readOnly={readOnly}
                  imageUrlOverride={override?.imageUrl}
                  imageStatusOverride={override?.status}
                  leftoverLabel={slot.leftoverOf}
                  portion={slot.portion}
                  pinned={slot.pinned}
                  onReplace={
                    onReplaceMeal
                      ? () => onReplaceMeal(slot.type, slot.recipe.name, slotIndex, slot.recipe.id)
                      : undefined
                  }
                  onTogglePin={
                    onTogglePin ? () => onTogglePin(slot.type, slotIndex, !slot.pinned) : undefined
                  }
                />
              );
            })}
          </div>
          <DayRecapBar
            meals={meals}
            calorieTarget={dayTarget}
            proteinGapG={day?.proteinGapG}
            onOpenMiss={!readOnly && onOpenMiss ? () => onOpenMiss(selectedDay) : undefined}
          />
        </>
      )}
    </div>
  );
}
