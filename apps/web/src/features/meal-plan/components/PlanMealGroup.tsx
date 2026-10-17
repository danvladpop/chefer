import type { ReactNode } from 'react';
import { cn, PLAN_MEAL_MENU_COPY } from '@chefer/utils';

// ─── One meal, several dishes (FB7-04) ────────────────────────────────────────
// Same-type slots of a day (a main + sides, or two snacks) read as ONE meal: a
// single type header with the dish count, the main card, the compact side cards
// indented under it, and a total line for the whole meal.

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-100 text-amber-800',
  lunch: 'bg-green-100 text-green-800',
  dinner: 'bg-blue-100 text-blue-800',
  snack: 'bg-purple-100 text-purple-800',
};

export function PlanMealGroup({
  mealType,
  dishCount,
  totalLine,
  main,
  sides,
  compact = false,
}: {
  mealType: string;
  dishCount: number;
  /** "687 kcal · P 32 g · C 60 g · F 18 g" (or the protein-only form). */
  totalLine: string;
  /** The main dish's card. */
  main: ReactNode;
  /** The compact side cards. */
  sides: ReactNode;
  /** The narrow desktop week column. */
  compact?: boolean;
}) {
  const label = MEAL_TYPE_LABELS[mealType] ?? mealType;
  const totalLabel = PLAN_MEAL_MENU_COPY.groupTotal(mealType);
  return (
    <section
      aria-label={`${label}, ${PLAN_MEAL_MENU_COPY.dishCount(dishCount)}`}
      data-testid={`plan-meal-group-${mealType}`}
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="flex min-w-0 items-center gap-2 px-1">
        <span
          className={cn(
            'inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
            MEAL_TYPE_COLORS[mealType] ?? 'bg-gray-100 text-gray-700',
          )}
        >
          {label}
        </span>
        <span className="text-xs text-gray-500">{PLAN_MEAL_MENU_COPY.dishCount(dishCount)}</span>
      </div>
      {main}
      <div
        className={cn(
          'flex min-w-0 flex-col gap-2 border-l-2 border-gray-200',
          compact ? 'ml-1.5 pl-1.5' : 'ml-4 pl-2',
        )}
      >
        {sides}
      </div>
      <p
        data-testid={`plan-meal-group-${mealType}-total`}
        className="flex min-w-0 flex-wrap items-center gap-x-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-700"
      >
        <span className="font-semibold uppercase text-gray-500">{totalLabel}</span>
        <span className="min-w-0">{totalLine}</span>
      </p>
    </section>
  );
}
