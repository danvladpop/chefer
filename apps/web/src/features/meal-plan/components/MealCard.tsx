import Link from 'next/link';
import { AllergenWarningChip } from '@/features/recipes/components/AllergenWarning';
import { RecipeImage, type ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { ArrowLeftRight, Clock } from 'lucide-react';
import { formatPortion, scaleNutrition, slotPortion } from '@chefer/utils';

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
  allergenWarnings?: string[];
}

interface MealCardProps {
  mealType: string;
  recipe: RecipeDto;
  planId: string;
  dayOfWeek: number;
  /**
   * The slot's index in `day.meals` (a curated day can hold two snacks).
   * Carried to the recipe page as `slot` so its swap/replace hit this slot.
   */
  slotIndex?: number | undefined;
  readOnly?: boolean;
  imageUrlOverride?: string | null | undefined;
  imageStatusOverride?: ImageStatusType | undefined;
  /**
   * `grid` is the tall card used by the desktop week grid, sized for a ~120px
   * column. `row` is the wide horizontal card used by the mobile day view,
   * where the full width is available and the grid proportions look starved.
   */
  variant?: 'grid' | 'row';
  /** F3 leftovers: source-day name ("Tuesday") when this slot re-plates a dinner. */
  leftoverLabel?: string | undefined;
  /**
   * P1-1: servings of the recipe this slot is (absent = 1). The card shows
   * the portion's kcal/macros and the recipe page opens pre-set to it.
   */
  portion?: number | undefined;
  /** Opens the replace-recipe sheet for this slot (hidden when absent/readOnly). */
  onReplace?: (() => void) | undefined;
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
  slotIndex,
  readOnly = false,
  imageUrlOverride,
  imageStatusOverride,
  variant = 'grid',
  leftoverLabel,
  portion: rawPortion,
  onReplace,
}: MealCardProps) {
  // Cards are Links — the replace button lives inside, so stop the navigation.
  const replaceButton = (extraClass: string) =>
    onReplace && !readOnly ? (
      <button
        type="button"
        aria-label={`Replace ${recipe.name}`}
        data-testid={`plan-meal-swap-${mealType}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onReplace();
        }}
        className={`flex items-center justify-center text-[#944a00] transition-colors hover:bg-orange-50 ${extraClass}`}
      >
        <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
      </button>
    ) : null;
  const totalTime = recipe.prepTimeMins + recipe.cookTimeMins;
  const portion = slotPortion(rawPortion);
  const href = `/recipes/${recipe.id}?planId=${planId}&day=${dayOfWeek}&meal=${mealType}${
    slotIndex !== undefined ? `&slot=${slotIndex}` : ''
  }${portion !== 1 ? `&portion=${portion}` : ''}`;
  const scaled = scaleNutrition(recipe.nutritionInfo, portion);
  const n = {
    calories: scaled.calories,
    protein: Math.round(scaled.protein),
    carbs: Math.round(scaled.carbs),
    fat: Math.round(scaled.fat),
  };
  // "1½ portions" — the slot is sized to the day's targets (P1-1).
  const portionBadge =
    portion !== 1 ? (
      <span
        className="inline-block rounded-full bg-[#fff3e8] px-2 py-0.5 text-xs font-semibold text-[#944a00]"
        title={`${formatPortion(portion)} the recipe's serving, sized to your daily targets`}
      >
        {formatPortion(portion)} portion
      </span>
    ) : null;

  const effectiveImageUrl =
    imageUrlOverride !== undefined ? imageUrlOverride : (recipe.imageUrl ?? null);
  const effectiveImageStatus: ImageStatusType = imageStatusOverride ?? recipe.imageStatus ?? 'DONE';

  // ── Row variant — image left, details right, full container width ─────────
  if (variant === 'row') {
    const rowInner = (
      <>
        <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-l-xl">
          <RecipeImage
            imageUrl={effectiveImageUrl}
            imageStatus={effectiveImageStatus}
            recipeName={recipe.name}
            cuisineType={recipe.cuisineType}
            className="h-full w-full"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-1 py-2.5 pl-3 pr-3">
          <div className="min-w-0">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${MEAL_TYPE_COLORS[mealType] ?? 'bg-gray-100 text-gray-700'}`}
            >
              {MEAL_TYPE_LABELS[mealType] ?? mealType}
            </span>
            {leftoverLabel && (
              <span className="ml-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Leftovers from {leftoverLabel}
              </span>
            )}
            {portionBadge && <span className="ml-1">{portionBadge}</span>}
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-gray-900">
              {recipe.name}
            </p>
            <AllergenWarningChip warnings={recipe.allergenWarnings} className="mt-1" />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {totalTime} min
            </span>
            <span className="font-medium text-gray-800">{n.calories} kcal</span>
            <span className="text-gray-500">
              P {n.protein}g · C {n.carbs}g · F {n.fat}g
            </span>
          </div>
        </div>
        {replaceButton('w-11 shrink-0 self-stretch border-l border-gray-100')}
      </>
    );

    if (readOnly) {
      return (
        <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {rowInner}
        </div>
      );
    }

    return (
      <Link
        href={href}
        className="flex min-h-11 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-[#944a00]/40 hover:shadow-md"
      >
        {rowInner}
      </Link>
    );
  }

  // ── Grid variant — the original tall card ─────────────────────────────────
  const inner = (
    <>
      {/* Recipe thumbnail */}
      <div className="relative h-24 w-full overflow-hidden">
        <RecipeImage
          imageUrl={effectiveImageUrl}
          imageStatus={effectiveImageStatus}
          recipeName={recipe.name}
          cuisineType={recipe.cuisineType}
          className="h-full w-full transition-transform duration-300 group-hover:scale-105"
        />
        {/* Meal type badge (+ the slot's portion when not 1×, P1-1) */}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide backdrop-blur-sm ${MEAL_TYPE_COLORS[mealType] ?? 'bg-gray-100 text-gray-700'}`}
        >
          {MEAL_TYPE_LABELS[mealType] ?? mealType}
          {portion !== 1 && (
            <span className="normal-case tracking-normal"> · {formatPortion(portion)}</span>
          )}
        </span>
        <AllergenWarningChip
          warnings={recipe.allergenWarnings}
          className="absolute bottom-2 right-2 max-w-[calc(100%-1rem)] truncate text-xs"
        />
        {leftoverLabel && (
          <span className="absolute bottom-2 left-2 rounded-full bg-emerald-100/90 px-2 py-0.5 text-xs font-semibold text-emerald-800 backdrop-blur-sm">
            Leftovers · {leftoverLabel.slice(0, 3)}
          </span>
        )}
        {replaceButton(
          'touch-target absolute right-1.5 top-1.5 h-8 w-8 rounded-full bg-white/90 shadow-sm backdrop-blur-sm',
        )}
      </div>

      {/* Card body — fixed height so all cards are the same size */}
      <div className="flex h-[104px] flex-col justify-between overflow-hidden p-2.5">
        {/* Recipe name */}
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-gray-900 group-hover:text-[#944a00]">
          {recipe.name}
        </p>

        {/* Bottom row: left = time · kcal, right = stacked macros */}
        <div className="flex items-end justify-between gap-1">
          {/* Time + calories */}
          <div className="flex flex-col gap-0.5 text-xs text-gray-500">
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {totalTime} min
            </span>
            <span className="font-medium text-gray-700">{n.calories} kcal</span>
          </div>

          {/* Macros stacked — compact, right-aligned */}
          <div className="space-y-px text-right text-xs leading-tight">
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
