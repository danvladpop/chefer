'use client';

import { Fragment } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import type { ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { groupDaySlots, mealGroupTotalLine, slotStates, type DaySlotEntry } from '@chefer/utils';
import { MealCard, type MealCardRecipe } from './MealCard';
import { PlanMealGroup } from './PlanMealGroup';
import { isSlotMuted, PlanSlotShell, slotLogActions, type PlanSlotUi } from './PlanSlotShell';

// ─── A day's meal cards, grouped by meal type (FB7-04, FB7-11) ────────────────
// Shared by the phone/tablet day view and the desktop week grid: one card per
// slot, same-type slots rendered as one meal group (main, compact sides, total),
// every action addressing the slot by its ORIGINAL index however the grouping
// reorders the display.

export type ImageOverrides = Record<string, { imageUrl: string | null; status: ImageStatusType }>;

export interface PlanMealSlot {
  type: string;
  /** F3 leftovers: source-day name when the slot re-plates a dinner. */
  leftoverOf?: string | undefined;
  /** P1-1: servings of the recipe this slot is (absent = 1). */
  portion?: number | undefined;
  /** §T-07.4/T-08.9: "Your pick" — survives Regenerate by default. */
  pinned?: boolean | undefined;
  recipe: MealCardRecipe;
}

export interface PlanDayMealsProps {
  meals: readonly PlanMealSlot[];
  planId: string;
  dayOfWeek: number;
  variant: 'row' | 'grid';
  readOnly?: boolean | undefined;
  imageOverrides?: ImageOverrides | undefined;
  /** WP-06: the day's log + flow ("Ate something else" / "Skipped it"). */
  slotUi?: PlanSlotUi | undefined;
  /** UX-PLAN-11: recipes logged as eaten that day (the read-only history view). */
  loggedRecipeIds?: readonly string[] | undefined;
  /** Opens the replace-recipe sheet for a slot. */
  onReplaceMeal?:
    | ((mealType: string, mealName: string, slotIndex: number, recipeId: string) => void)
    | undefined;
  /** Toggles `pinned` on a slot (§T-07.4/T-08.9). */
  onTogglePin?: ((mealType: string, slotIndex: number, pinned: boolean) => void) | undefined;
  /** FB7-04: opens the picker to add a second dish to the slot's meal. */
  onAddSide?:
    | ((mealType: string, mealName: string, slotIndex: number, recipeId: string) => void)
    | undefined;
  /** FB7-04: takes a side dish off the plan. */
  onRemoveSide?:
    | ((mealType: string, slotIndex: number, recipe: { id: string; name: string }) => void)
    | undefined;
}

export function PlanDayMeals({
  meals,
  planId,
  dayOfWeek,
  variant,
  readOnly = false,
  imageOverrides = {},
  slotUi,
  loggedRecipeIds,
  onReplaceMeal,
  onTogglePin,
  onAddSide,
  onRemoveSide,
}: PlanDayMealsProps) {
  const { proteinOnly } = useNumbersMode(); // WP-08
  // WP-06: what became of each slot (planned / eaten / replaced / skipped).
  const states = slotUi
    ? slotStates(
        meals.map((m, i) => ({ type: m.type, recipeId: m.recipe.id, slotIndex: i })),
        slotUi.loggedMeals,
        slotUi.skippedSlots,
      )
    : null;
  const groups = groupDaySlots(meals);

  const renderEntry = (entry: DaySlotEntry<PlanMealSlot>, role: 'solo' | 'main' | 'side') => {
    const { meal, slotIndex } = entry;
    const isSide = role === 'side';
    const state = states?.[slotIndex];
    const override = imageOverrides[meal.recipe.id];
    const card = (
      <MealCard
        variant={variant}
        mealType={meal.type}
        recipe={meal.recipe}
        planId={planId}
        dayOfWeek={dayOfWeek}
        slotIndex={slotIndex}
        readOnly={readOnly}
        imageUrlOverride={override?.imageUrl}
        imageStatusOverride={override?.status}
        leftoverLabel={meal.leftoverOf}
        portion={meal.portion}
        pinned={meal.pinned}
        side={isSide}
        hideTypeBadge={role !== 'solo'}
        muted={isSlotMuted(state)}
        eaten={
          states ? state?.status === 'eaten' : loggedRecipeIds?.includes(meal.recipe.id) === true
        }
        logActions={slotUi ? slotLogActions(meal.type, slotIndex, state, slotUi.flow) : undefined}
        onReplace={
          onReplaceMeal
            ? () => onReplaceMeal(meal.type, meal.recipe.name, slotIndex, meal.recipe.id)
            : undefined
        }
        onTogglePin={
          onTogglePin ? () => onTogglePin(meal.type, slotIndex, !meal.pinned) : undefined
        }
        onAddSide={
          onAddSide
            ? () => onAddSide(meal.type, meal.recipe.name, slotIndex, meal.recipe.id)
            : undefined
        }
        onRemove={
          isSide && onRemoveSide
            ? () =>
                onRemoveSide(meal.type, slotIndex, { id: meal.recipe.id, name: meal.recipe.name })
            : undefined
        }
      />
    );
    const key = `${meal.type}-${slotIndex}`;
    return slotUi ? (
      <PlanSlotShell
        key={key}
        mealType={meal.type}
        slotIndex={slotIndex}
        state={state}
        flow={slotUi.flow}
      >
        {card}
      </PlanSlotShell>
    ) : (
      <Fragment key={key}>{card}</Fragment>
    );
  };

  return (
    <>
      {groups.map((group) =>
        group.sides.length === 0 ? (
          renderEntry(group.main, 'solo')
        ) : (
          <PlanMealGroup
            key={group.mealType}
            mealType={group.mealType}
            dishCount={group.entries.length}
            totalLine={mealGroupTotalLine(
              group.entries.map((e) => e.meal),
              proteinOnly,
            )}
            compact={variant === 'grid'}
            main={renderEntry(group.main, 'main')}
            sides={group.sides.map((e) => renderEntry(e, 'side'))}
          />
        ),
      )}
    </>
  );
}
