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
}

export function DayRecapBar({ meals }: DayRecapBarProps) {
  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.recipe.nutritionInfo.calories,
      protein: acc.protein + m.recipe.nutritionInfo.protein,
      carbs: acc.carbs + m.recipe.nutritionInfo.carbs,
      fat: acc.fat + m.recipe.nutritionInfo.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Day total</p>
      <p className="text-sm font-bold text-[#944a00]">{totals.calories} kcal</p>
      <div className="mt-1 flex gap-3 text-[10px] text-gray-500">
        <span>P {totals.protein}g</span>
        <span>C {totals.carbs}g</span>
        <span>F {totals.fat}g</span>
      </div>
    </div>
  );
}
