'use client';

import Link from 'next/link';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { AiGeneratedChip } from '@/features/privacy/components/AiGeneratedChip';
import { AllergenWarningChip } from '@/features/recipes/components/AllergenWarning';
import { RecipeImage, type ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { CheckedForChip } from '@/features/safety/components/CheckedForChip';
import { ArrowLeftRight, Bookmark, CheckCircle2, Clock } from 'lucide-react';
import { pressControl, pressTransition } from '@chefer/ui';
import {
  cn,
  formatPortion,
  PLAN_MEAL_MENU_COPY,
  planMealMacroLine,
  planMealMacros,
  planMealMetaLine,
  slotPortion,
  verifiedLabels,
  type ConflictLike,
} from '@chefer/utils';
import { PlanMealMenu, planMealMenuHasItems, type SlotLogActions } from './PlanMealMenu';

interface NutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export type MealCardRecipe = RecipeDto;

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
  safetyChecks?: {
    checked: { label: string; who: string }[];
    conflicts: string[];
    unchecked: string[];
    taggedOnly?: { label: string; who: string }[] | undefined;
    conflictDetails?: ConflictLike[] | undefined;
    labelCaveats?: { ingredient: string; rule: string }[] | undefined;
  };
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
  /**
   * §T-07.4/T-08.9: the user chose this exact dish (Replace, AI swap or an
   * own recipe) — shows a "Your pick" badge; it survives Regenerate by
   * default (`generate({ keepPinned: true })`).
   */
  pinned?: boolean | undefined;
  /** Toggles `pinned` on this slot (hidden when absent/readOnly). */
  onTogglePin?: (() => void) | undefined;
  /** UX-PLAN-11: the past-week view marks a meal the user logged as eaten. */
  eaten?: boolean | undefined;
  /** FB7-04: a side dish — a compact card with a "+ side" badge. */
  side?: boolean | undefined;
  /** FB7-04: inside a meal group the header names the type once. */
  hideTypeBadge?: boolean | undefined;
  /** WP-06: the slot was replaced or skipped — the photo and text are muted. */
  muted?: boolean | undefined;
  /** FB7-11: "Ate something else" / "Skipped it" in the "…" menu (slot still to eat). */
  logActions?: SlotLogActions | undefined;
  /** FB7-04: "Add a side dish" in the "…" menu. */
  onAddSide?: (() => void) | undefined;
  /** FB7-04: "Remove from plan" in the "…" menu — a side dish only. */
  onRemove?: (() => void) | undefined;
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
  pinned = false,
  onTogglePin,
  eaten = false,
  side = false,
  hideTypeBadge = false,
  muted = false,
  logActions,
  onAddSide,
  onRemove,
}: MealCardProps) {
  // WP-08: protein-only mode shows protein per meal instead of kcal (the plan still balances kcal).
  const { proteinOnly } = useNumbersMode();
  // A side dish shares its meal type with the main: ids carry the slot too.
  const slotKey = side && slotIndex !== undefined ? `${mealType}-${slotIndex}` : mealType;
  // Cards are Links — the swap button and the "…" menu live inside, so stop navigation.
  const swapButton = (extraClass: string) =>
    onReplace && !readOnly ? (
      <button
        type="button"
        aria-label={PLAN_MEAL_MENU_COPY.swap(recipe.name)}
        data-testid={`plan-meal-swap-${slotKey}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onReplace();
        }}
        className={cn(
          'flex items-center justify-center text-[#944a00] hover:bg-orange-50',
          pressControl,
          extraClass,
        )}
      >
        <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
      </button>
    ) : null;
  const menuProps = {
    mealName: recipe.name,
    slotKey,
    pinned,
    onTogglePin,
    logActions,
    onAddSide,
    onRemove,
  };
  const moreMenu = (compact = false) =>
    !readOnly && planMealMenuHasItems(menuProps) ? (
      <PlanMealMenu {...menuProps} compact={compact} />
    ) : null;
  // FB7-11: a pinned meal shows a small bookmark on its photo — the pin button
  // itself lives in the "…" menu.
  const pinnedBadge = pinned ? (
    <span
      data-testid={`plan-meal-${slotKey}-pinned`}
      role="img"
      aria-label={PLAN_MEAL_MENU_COPY.pinnedBadge}
      title={PLAN_MEAL_MENU_COPY.pinnedBadge}
      className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[#944a00] shadow-sm"
    >
      <Bookmark className="h-3 w-3" aria-hidden="true" fill="currentColor" />
    </span>
  ) : null;
  const eatenBadge = eaten ? (
    <span
      data-testid={`plan-meal-${mealType}-eaten`}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
    >
      <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
      Eaten
    </span>
  ) : null;
  const sideBadge = side ? (
    <span
      data-testid={`plan-meal-${slotKey}-side`}
      className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600"
    >
      {PLAN_MEAL_MENU_COPY.sideBadge}
    </span>
  ) : null;
  const typeBadge = hideTypeBadge ? null : (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${MEAL_TYPE_COLORS[mealType] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {MEAL_TYPE_LABELS[mealType] ?? mealType}
    </span>
  );
  const totalTime = recipe.prepTimeMins + recipe.cookTimeMins;
  const portion = slotPortion(rawPortion);
  const href = `/recipes/${recipe.id}?planId=${planId}&day=${dayOfWeek}&meal=${mealType}${
    slotIndex !== undefined ? `&slot=${slotIndex}` : ''
  }${portion !== 1 ? `&portion=${portion}` : ''}`;
  const n = planMealMacros(recipe.nutritionInfo, portion);
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
  const mutedCls = muted ? 'opacity-60' : undefined;

  // ── Row variant — image | body | one compact action column ────────────────
  if (variant === 'row') {
    const macroLine = planMealMacroLine(recipe.nutritionInfo, portion, proteinOnly);
    const actions =
      !readOnly && (onReplace || planMealMenuHasItems(menuProps)) ? (
        <div className="flex w-11 shrink-0 flex-col items-center justify-center self-stretch border-l border-gray-100">
          {swapButton('h-11 w-11')}
          {moreMenu()}
        </div>
      ) : null;
    const rowInner = (
      <>
        <div
          className={cn(
            'relative shrink-0 self-stretch overflow-hidden rounded-l-xl',
            side ? 'w-14' : 'h-[88px] w-[88px]',
            mutedCls,
          )}
        >
          <RecipeImage
            imageUrl={effectiveImageUrl}
            imageStatus={effectiveImageStatus}
            recipeName={recipe.name}
            cuisineType={recipe.cuisineType}
            className="h-full w-full"
          />
          {pinnedBadge && <div className="absolute left-1 top-1">{pinnedBadge}</div>}
        </div>

        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col justify-between gap-1 py-2.5 pl-3 pr-2',
            mutedCls,
          )}
        >
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {typeBadge}
              {sideBadge}
              {leftoverLabel && (
                <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  Leftovers from {leftoverLabel}
                </span>
              )}
              {portionBadge}
              {eatenBadge}
            </div>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-gray-900">
              {recipe.name}
            </p>
            <AllergenWarningChip
              warnings={recipe.allergenWarnings}
              details={recipe.safetyChecks?.conflictDetails}
              className="mt-1"
            />
            <CheckedForChip labels={verifiedLabels(recipe.safetyChecks)} className="mt-1" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-600">
              <AiGeneratedChip recipe={recipe} variant="icon" />
              <span
                data-testid={`plan-meal-${slotKey}-meta`}
                className="flex min-w-0 items-center gap-1"
              >
                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="font-medium text-gray-800">
                  {planMealMetaLine(totalTime, recipe.nutritionInfo, portion, proteinOnly)}
                </span>
              </span>
            </div>
            {macroLine !== null && (
              <p
                data-testid={`plan-meal-${slotKey}-macros`}
                className="mt-0.5 truncate text-xs text-gray-500"
              >
                {macroLine}
              </p>
            )}
          </div>
        </div>
        {actions}
      </>
    );

    // No overflow clipping on the card: the "…" menu drops out of it. The photo
    // rounds its own left corners.
    const rowCls = cn(
      'relative flex min-h-11 rounded-xl border border-gray-200 bg-white shadow-sm',
      side && 'min-h-14',
    );
    if (readOnly) {
      return <div className={rowCls}>{rowInner}</div>;
    }

    return (
      <Link
        href={href}
        className={cn(
          rowCls,
          pressTransition,
          'hover:border-[#944a00]/40 hover:shadow-md focus-within:z-10',
        )}
      >
        {rowInner}
      </Link>
    );
  }

  // ── Grid variant — the original tall card ─────────────────────────────────
  const inner = (
    <>
      {/* Recipe thumbnail */}
      <div className={cn('relative w-full', side ? 'h-[72px]' : 'h-24', mutedCls)}>
        <div className="absolute inset-0 overflow-hidden rounded-t-xl">
          <RecipeImage
            imageUrl={effectiveImageUrl}
            imageStatus={effectiveImageStatus}
            recipeName={recipe.name}
            cuisineType={recipe.cuisineType}
            className="h-full w-full transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        {/* Meal type badge (+ the slot's portion when not 1×, P1-1) */}
        {(!hideTypeBadge || portion !== 1) && (
          <span
            className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide backdrop-blur-sm ${MEAL_TYPE_COLORS[mealType] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {!hideTypeBadge && (MEAL_TYPE_LABELS[mealType] ?? mealType)}
            {portion !== 1 && (
              <span className="normal-case tracking-normal">
                {hideTypeBadge ? '' : ' · '}
                {formatPortion(portion)}
              </span>
            )}
          </span>
        )}
        {side && (
          <span className="absolute bottom-1.5 left-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-gray-700 shadow-sm">
            {PLAN_MEAL_MENU_COPY.sideBadge}
          </span>
        )}
        {!side && (
          <div className="absolute bottom-2 right-2 flex max-w-[calc(100%-1rem)] flex-col items-end gap-1">
            <AllergenWarningChip
              warnings={recipe.allergenWarnings}
              details={recipe.safetyChecks?.conflictDetails}
              className="truncate text-xs"
            />
            <CheckedForChip
              labels={verifiedLabels(recipe.safetyChecks)}
              className="truncate text-xs"
            />
          </div>
        )}
        {eaten && (
          <span
            data-testid={`plan-meal-${mealType}-eaten`}
            className="absolute right-12 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-100/90 px-2 py-0.5 text-xs font-semibold text-emerald-700 backdrop-blur-sm"
          >
            <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
            Eaten
          </span>
        )}
        {leftoverLabel && !side && (
          <span className="absolute bottom-2 left-2 rounded-full bg-emerald-100/90 px-2 py-0.5 text-xs font-semibold text-emerald-800 backdrop-blur-sm">
            Leftovers · {leftoverLabel.slice(0, 3)}
          </span>
        )}
        {/* A pinned meal: a small bookmark on the photo (the pin button is in the "…" menu). */}
        {pinnedBadge && <div className="absolute left-2 top-9">{pinnedBadge}</div>}
        {/* Swap above "…" — one compact action column over the photo. */}
        <div className="absolute right-1 top-1 flex flex-col rounded-full bg-white/90 shadow-sm backdrop-blur-sm">
          {swapButton('touch-target relative h-8 w-8 rounded-full')}
          {moreMenu(true)}
        </div>
      </div>

      {/* Card body — fixed height so all cards are the same size */}
      <div
        className={cn(
          'flex flex-col justify-between overflow-hidden rounded-b-xl p-2.5',
          side ? 'h-[72px]' : 'h-[104px]',
          mutedCls,
        )}
      >
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
            {!proteinOnly && <span className="font-medium text-gray-700">{n.kcal} kcal</span>}
          </div>

          {/* Macros stacked — compact, right-aligned (WP-08: protein only in protein-only mode) */}
          {!side && (
            <div className="space-y-px text-right text-xs leading-tight">
              <div>
                <span className="text-blue-500">P </span>
                <span className="font-medium text-gray-700">{n.protein}g</span>
              </div>
              {!proteinOnly && (
                <>
                  <div>
                    <span className="text-amber-500">C </span>
                    <span className="font-medium text-gray-700">{n.carbs}g</span>
                  </div>
                  <div>
                    <span className="text-green-500">F </span>
                    <span className="font-medium text-gray-700">{n.fat}g</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (readOnly) {
    return (
      <div className="group relative block rounded-xl border border-gray-200 bg-white shadow-sm">
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        'group relative block rounded-xl border border-gray-200 bg-white shadow-sm',
        pressTransition,
        'hover:border-[#944a00]/40 hover:shadow-md focus-within:z-10',
      )}
    >
      {inner}
    </Link>
  );
}
