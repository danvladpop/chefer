import Link from 'next/link';
import { Clock, Flame } from 'lucide-react';

interface NutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

interface RecipeDto {
  id: string;
  name: string;
  description: string;
  cuisineType: string;
  prepTimeMins: number;
  cookTimeMins: number;
  nutritionInfo: NutritionInfo;
}

interface MealCardProps {
  mealType: string;
  recipe: RecipeDto;
  planId: string;
  dayOfWeek: number;
}

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

export function MealCard({ mealType, recipe, planId, dayOfWeek }: MealCardProps) {
  const totalTime = recipe.prepTimeMins + recipe.cookTimeMins;

  const href = `/recipes/${recipe.id}?planId=${planId}&day=${dayOfWeek}&meal=${mealType}`;

  return (
    <Link
      href={href}
      className="group block rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm transition-all hover:border-[#944a00]/40 hover:shadow-md"
    >
      {/* Meal type badge */}
      <span
        className={`mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${MEAL_TYPE_COLORS[mealType] ?? 'bg-gray-100 text-gray-700'}`}
      >
        {MEAL_TYPE_LABELS[mealType] ?? mealType}
      </span>

      {/* Recipe name */}
      <p className="mb-1 text-sm font-semibold leading-snug text-gray-900 group-hover:text-[#944a00]">
        {recipe.name}
      </p>

      {/* Cuisine */}
      <p className="mb-3 text-[11px] text-gray-400">{recipe.cuisineType}</p>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <Flame className="h-3 w-3 text-[#944a00]" aria-hidden="true" />
          {recipe.nutritionInfo.calories} kcal
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {totalTime} min
        </span>
      </div>
    </Link>
  );
}
