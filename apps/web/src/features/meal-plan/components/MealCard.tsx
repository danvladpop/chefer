import Link from 'next/link';
import {
  RecipeImage,
  type ImageStatusType,
} from '@/features/recipes/components/RecipeImage';
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
  imageStatus?: ImageStatusType;
}

interface MealCardProps {
  mealType: string;
  recipe: RecipeDto;
  planId: string;
  dayOfWeek: number;
  readOnly?: boolean;
  imageUrlOverride?: string | null;
  imageStatusOverride?: ImageStatusType;
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

export function MealCard({
  mealType,
  recipe,
  planId,
  dayOfWeek,
  readOnly = false,
  imageUrlOverride,
  imageStatusOverride,
}: MealCardProps) {
  const totalTime = recipe.prepTimeMins + recipe.cookTimeMins;
  const href = `/recipes/${recipe.id}?planId=${planId}&day=${dayOfWeek}&meal=${mealType}`;
  const n = recipe.nutritionInfo;

  const effectiveImageUrl =
    imageUrlOverride !== undefined ? imageUrlOverride : (recipe.imageUrl ?? null);
  const effectiveImageStatus: ImageStatusType =
    imageStatusOverride ?? recipe.imageStatus ?? 'DONE';

  const inner = (
    <>
      {/* Recipe thumbnail */}
      <div className="relative h-24 w-full overflow-hidden">
        <RecipeImage
          imageUrl={effectiveImageUrl}
          imageStatus={effectiveImageStatus}
          recipeName={recipe.name}
          className="h-full w-full transition-transform duration-300 group-hover:scale-105"
        />
        {/* Meal type badge */}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur-sm ${MEAL_TYPE_COLORS[mealType] ?? 'bg-gray-100 text-gray-700'}`}
        >
          {MEAL_TYPE_LABELS[mealType] ?? mealType}
        </span>
      </div>

      {/* Card body — fixed height so all cards are the same size */}
      <div className="flex h-[88px] flex-col justify-between overflow-hidden p-2.5">
        {/* Recipe name */}
        <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-gray-900 group-hover:text-[#944a00]">
          {recipe.name}
        </p>

        {/* Bottom row: left = time · kcal, right = stacked macros */}
        <div className="flex items-end justify-between gap-1">
          {/* Time + calories */}
          <div className="flex flex-col gap-0.5 text-[10px] text-gray-500">
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" aria-hidden="true" />
              {totalTime} min
            </span>
            <span className="font-medium text-gray-700">{n.calories} kcal</span>
          </div>

          {/* Macros stacked — compact, right-aligned */}
          <div className="space-y-px text-right text-[10px] leading-tight">
            <div>
              <span className="text-blue-500">P </span>
              <span className="font-medium text-gray-700">{n.protein}g</span>
            </div>
            <div>
              <span className="text-amber-500">C </span>
              <span className="font-medium text-gray-700">{n.carbs}g</span>
            </div>
            <div>
              <span className="text-green-500">F </span>
              <span className="font-medium text-gray-700">{n.fat}g</span>
            </div>
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
