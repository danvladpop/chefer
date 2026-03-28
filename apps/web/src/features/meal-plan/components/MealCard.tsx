import Image from 'next/image';
import Link from 'next/link';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { Clock } from 'lucide-react';

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
  imageUrl?: string | null;
}

interface MealCardProps {
  mealType: string;
  recipe: RecipeDto;
  planId: string;
  dayOfWeek: number;
  readOnly?: boolean;
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

export function MealCard({ mealType, recipe, planId, dayOfWeek, readOnly = false }: MealCardProps) {
  const totalTime = recipe.prepTimeMins + recipe.cookTimeMins;
  const href = `/recipes/${recipe.id}?planId=${planId}&day=${dayOfWeek}&meal=${mealType}`;
  const imgProps = getRecipeImageProps(recipe.imageUrl);
  const n = recipe.nutritionInfo;

  const inner = (
    <>
      {/* Recipe thumbnail */}
      <div className="relative h-24 w-full overflow-hidden">
        <Image
          {...imgProps}
          alt={recipe.name}
          fill
          sizes="(max-width: 1280px) 130px, 160px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Meal type badge */}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur-sm ${MEAL_TYPE_COLORS[mealType] ?? 'bg-gray-100 text-gray-700'}`}
        >
          {MEAL_TYPE_LABELS[mealType] ?? mealType}
        </span>
      </div>

      {/* Card body */}
      <div className="overflow-hidden p-3">
        {/* Recipe name */}
        <p className="mb-1 line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 group-hover:text-[#944a00]">
          {recipe.name}
        </p>

        {/* Cuisine */}
        <p className="mb-2 text-[11px] text-gray-400">{recipe.cuisineType}</p>

        {/* Time + calories */}
        <div className="mb-2 flex items-center gap-2 text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {totalTime} min
          </span>
          <span className="text-gray-300">·</span>
          <span className="font-medium text-gray-700">{n.calories} kcal</span>
        </div>

        {/* Macros stacked */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-blue-500">Protein</span>
            <span className="font-medium text-gray-700">{n.protein}g</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-amber-500">Carbs</span>
            <span className="font-medium text-gray-700">{n.carbs}g</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-green-500">Fat</span>
            <span className="font-medium text-gray-700">{n.fat}g</span>
          </div>
        </div>
      </div>
    </>
  );

  if (readOnly) {
    return (
      <div className="group block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-[#944a00]/40 hover:shadow-md"
    >
      {inner}
    </Link>
  );
}
