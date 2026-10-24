import type {
  IMealPlanRepository,
  LoggedMealEntry,
  MealPlanDay,
  SlotRefJson,
} from '@chefer/database';
import { planSlotMealTypeSchema, type PlanSlotMealType } from '@chefer/types';
import {
  mealSourceId,
  slotStates,
  type DayFacts,
  type PlannedMealSlot,
  type SlotRef as TodaySlotRef,
} from '@chefer/utils';

// ─── One tracker day → DayFacts (tech-plan.md §4.1) ───────────────────────────
// The pure half of `onDayChanged` and of back-dating: it reads the logged
// entries, the skipped slots and the day's plan slots exactly as the tracker's
// ticks do (`slotStates`), and returns the facts the pure rules score.

export type PlanMealRef = { type: string; recipeId: string; slotIndex: number };

const mealTypeOf = (value: string): PlanSlotMealType | undefined => {
  const parsed = planSlotMealTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

export function buildDayFacts(input: {
  date: string;
  entries: LoggedMealEntry[];
  skippedSlots: SlotRefJson[];
  /** The day's plan slots whose recipe still exists (a slot the user can't see can't be handled). */
  planMeals: PlanMealRef[];
  totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  proteinTargetG: number | null;
}): DayFacts {
  const { date, entries, skippedSlots } = input;
  const slots: PlannedMealSlot[] = input.planMeals.map((m) => ({
    type: m.type,
    recipeId: m.recipeId,
    slotIndex: m.slotIndex,
  }));
  const skipped: TodaySlotRef[] = skippedSlots.map((s) => ({
    mealType: s.mealType,
    slotIndex: s.slotIndex,
  }));
  const states = slotStates(slots, entries, skipped);

  const eaten = new Set<LoggedMealEntry>();
  const planSlots: DayFacts['planSlots'] = [];
  const handledSlots: DayFacts['handledSlots'] = [];
  slots.forEach((slot, i) => {
    const mealType = mealTypeOf(slot.type);
    if (!mealType) return; // not a rule slot (unknown type): it can't be handled either
    const ref = { mealType, slotIndex: slot.slotIndex ?? i };
    planSlots.push(ref);
    const state = states[i];
    if (!state || state.status === 'planned') return;
    handledSlots.push(ref);
    if (state.status === 'eaten') eaten.add(state.entry);
  });

  return {
    date,
    entries: entries.map((entry, index) => {
      const isRecipe = !!entry.recipeId && !entry.custom;
      const mealType = mealTypeOf(entry.mealType);
      return {
        sourceId: mealSourceId({
          date,
          // A custom entry's key is its entry id, never the meal type.
          ...(isRecipe && mealType && { mealType }),
          ...(entry.slotIndex !== undefined && { slotIndex: entry.slotIndex }),
          ...(entry.recipeId !== undefined && { recipeId: entry.recipeId }),
          ...(entry.entryId !== undefined && { entryId: entry.entryId }),
          index,
        }),
        ...(mealType && { mealType }),
        ...(isRecipe && entry.slotIndex !== undefined && { slotIndex: entry.slotIndex }),
        ...(isRecipe && entry.recipeId !== undefined && { recipeId: entry.recipeId }),
        onPlan: eaten.has(entry),
      };
    }),
    planSlots,
    handledSlots,
    totals: {
      kcal: input.totals.kcal,
      proteinG: input.totals.proteinG,
      carbsG: input.totals.carbsG,
      fatG: input.totals.fatG,
    },
    proteinTargetG: input.proteinTargetG,
  };
}

/** 0 = Monday … 6 = Sunday for a `YYYY-MM-DD` calendar day. */
export function dayIndexOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * The plan's slots for `date` whose recipe still exists, as `tracker.getDay`
 * lists them (a slot whose recipe is gone is invisible, so it can't be handled).
 * `recipes` is looked up once per call; back-dating passes a preloaded set.
 */
export async function resolvePlanMeals(
  plans: Pick<IMealPlanRepository, 'findRecipesByIds'>,
  days: Pick<MealPlanDay, 'dayOfWeek' | 'meals'>[] | undefined,
  date: string,
  knownRecipes?: ReadonlyMap<string, { name: string }>,
): Promise<(PlanMealRef & { recipeName: string })[]> {
  const day = days?.find((x) => x.dayOfWeek === dayIndexOf(date));
  if (!day) return [];
  const slots = day.meals as unknown as { type: string; recipeId: string }[];
  const names =
    knownRecipes ??
    new Map(
      (await plans.findRecipesByIds(slots.map((s) => s.recipeId))).map((r) => [
        r.id,
        { name: r.name },
      ]),
    );
  return slots.flatMap((slot, slotIndex) => {
    const recipe = names.get(slot.recipeId);
    return recipe
      ? [{ type: slot.type, recipeId: slot.recipeId, slotIndex, recipeName: recipe.name }]
      : [];
  });
}
