import { cn, sumPlanDay } from '@chefer/utils';

interface NutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

interface MealSlot {
  type: string;
  recipe: { nutritionInfo: NutritionInfo };
  /** P1-1: servings of the recipe this slot is (absent = 1). */
  portion?: number | undefined;
}

interface DayRecapBarProps {
  meals: MealSlot[];
  /**
   * The user's daily calorie target (WeekPlanDto.calorieTarget). When the
   * day's total strays more than ±15% from it, the bar says so instead of
   * letting an under-planned day pass silently (trust fix P-1).
   */
  calorieTarget?: number | undefined;
  /**
   * P1-1: grams the day's protein falls short of target (DayPlanDto.proteinGapG,
   * present only when meaningfully short) — shown as an honest hint.
   */
  proteinGapG?: number | undefined;
}

/** Matches the API's PLAN_KCAL_TOLERANCE — one band, every surface. */
const TARGET_BAND = 0.15;

export function DayRecapBar({ meals, calorieTarget, proteinGapG }: DayRecapBarProps) {
  // Totals count each slot at its portion (P1-1) — same sum as mobile.
  const { kcal, protein, carbs, fat } = sumPlanDay(meals);
  const totals = { calories: kcal, protein, carbs, fat };

  const delta = calorieTarget ? totals.calories - calorieTarget : 0;
  const offTarget = calorieTarget ? Math.abs(delta) / calorieTarget > TARGET_BAND : false;

  return (
    <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Day total</p>
      <p className="text-sm font-bold text-[#944a00]">{totals.calories} kcal</p>
      {offTarget && (
        <p
          className={cn(
            'mt-0.5 inline-block rounded-full px-1.5 py-px text-xs font-semibold',
            delta < 0 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700',
          )}
        >
          {delta < 0 ? `${Math.abs(delta)} kcal under target` : `${delta} kcal over target`}
        </p>
      )}
      <div className="mt-1 flex gap-3 text-xs text-gray-500">
        <span>P {totals.protein}g</span>
        <span>C {totals.carbs}g</span>
        <span>F {totals.fat}g</span>
      </div>
      {proteinGapG !== undefined && proteinGapG > 0 && (
        <p
          data-testid="day-protein-gap"
          className="mt-1 rounded-md bg-amber-50 px-1.5 py-1 text-xs font-medium text-amber-800"
        >
          Protein short by {proteinGapG} g — add a snack
        </p>
      )}
    </div>
  );
}
