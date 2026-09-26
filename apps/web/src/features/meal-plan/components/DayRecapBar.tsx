import { cn } from '@chefer/utils';

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
}

interface DayRecapBarProps {
  meals: MealSlot[];
  /**
   * The user's daily calorie target (WeekPlanDto.calorieTarget). When the
   * day's total strays more than ±15% from it, the bar says so instead of
   * letting an under-planned day pass silently (trust fix P-1).
   */
  calorieTarget?: number | undefined;
}

/** Matches the API's PLAN_KCAL_TOLERANCE — one band, every surface. */
const TARGET_BAND = 0.15;

export function DayRecapBar({ meals, calorieTarget }: DayRecapBarProps) {
  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.recipe.nutritionInfo.calories,
      protein: acc.protein + m.recipe.nutritionInfo.protein,
      carbs: acc.carbs + m.recipe.nutritionInfo.carbs,
      fat: acc.fat + m.recipe.nutritionInfo.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

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
    </div>
  );
}
