import { matchLoggedToSlots, type SlotRef } from './today';

// ─── Tracker day: derived ticks + optimistic cache edits (UX-FOOD-01/06) ──────
// The tracker used to copy the server's log into component state once per day
// and mutate that copy, so Undo, a log made on Today or a failed write left
// the screen out of step with the server. Ticks are now DERIVED from the
// cached `tracker.getDay` data on every render, and a tap edits that cached
// data optimistically (rolled back on error, re-fetched on settle). These are
// the pure edits both clients apply — one rule set for mobile and web.

/** The slice of a logged entry these helpers read and write. */
export interface DayEntry {
  entryId?: string | undefined;
  recipeId?: string | undefined;
  custom?: { name: string; estimatedBy: 'vision' | 'manual' } | undefined;
  mealType: string;
  slotIndex?: number | undefined;
  /** WP-06: the plan slot this custom entry replaces ("Ate something else"). */
  replacesSlot?: SlotRef | undefined;
  portionMultiplier: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** An "Also eaten" row: a logged recipe that is not on the day's plan. */
export interface OffPlanRowLike {
  entryId?: string | undefined;
  mealType: string;
  portionMultiplier?: number | undefined;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** The slice of `tracker.getDay` data these helpers read and write. */
export interface DayLike {
  log: {
    loggedMeals: DayEntry[];
    totalKcal: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
  } | null;
  offPlanLogged?: OffPlanRowLike[];
  /** WP-06: the plan slots the user skipped (`tracker.getDay` `skippedSlots`). */
  skippedSlots?: SlotRef[] | undefined;
}

/** A planned row's key: its plan slot, so two identical snacks tick separately. */
export const plannedRowKey = (meal: { slotIndex?: number | undefined }, i: number): string =>
  String(meal.slotIndex ?? i);

/**
 * Which planned rows are ticked, and at what portion, according to the log.
 * Each logged entry ticks ONE slot (`matchLoggedToSlots`): its own slot when it
 * carries a `slotIndex`, else the first free slot of its recipe and meal type.
 */
export function tickStateFromLog(
  plannedMeals: readonly {
    mealType: string;
    recipeId: string;
    slotIndex?: number | undefined;
  }[],
  loggedMeals: readonly DayEntry[],
): Record<string, { checked: boolean; portion: number }> {
  const matched = matchLoggedToSlots(
    plannedMeals.map((m, i) => ({
      type: m.mealType,
      recipeId: m.recipeId,
      slotIndex: m.slotIndex ?? i,
    })),
    loggedMeals,
  );
  const ticks: Record<string, { checked: boolean; portion: number }> = {};
  plannedMeals.forEach((m, i) => {
    const entry = matched[i];
    if (entry) ticks[plannedRowKey(m, i)] = { checked: true, portion: entry.portionMultiplier };
  });
  return ticks;
}

/** The day's totals: the sum of everything logged, whatever kind of entry. */
export function sumLogged(loggedMeals: readonly DayEntry[]): {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  return loggedMeals.reduce(
    (t, m) => ({
      kcal: t.kcal + m.kcal,
      protein: t.protein + m.protein,
      carbs: t.carbs + m.carbs,
      fat: t.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/**
 * The server's identity rule for a planned-recipe entry (`logRecipe` /
 * `unlogRecipe`): same recipe, and the same slot when the target names one,
 * else the same meal type.
 */
export function matchesRecipeSlot(
  m: DayEntry,
  target: { recipeId: string; mealType: string; slotIndex?: number | undefined },
): boolean {
  return (
    m.recipeId === target.recipeId &&
    (target.slotIndex !== undefined
      ? m.slotIndex === target.slotIndex
      : m.mealType === target.mealType)
  );
}

function withLog<D extends DayLike>(day: D, loggedMeals: DayEntry[]): D {
  const totals = sumLogged(loggedMeals);
  return {
    ...day,
    log: {
      ...(day.log ?? {}),
      loggedMeals,
      totalKcal: totals.kcal,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFat: totals.fat,
    },
  };
}

const sameSlot = (a: SlotRef, b: SlotRef): boolean =>
  a.mealType === b.mealType && a.slotIndex === b.slotIndex;

/** The skips that survive logging something for `slot`: ticking a skipped slot un-skips it. */
function withoutSkip(day: DayLike, slot: SlotRef | undefined): SlotRef[] | undefined {
  if (!day.skippedSlots || !slot) return day.skippedSlots;
  return day.skippedSlots.filter((s) => !sameSlot(s, slot));
}

/** Optimistic `logRecipe`: replaces the slot's entry (or adds one). */
export function withRecipeLogged<D extends DayLike>(day: D, entry: DayEntry): D {
  const stored = day.log?.loggedMeals ?? [];
  const target = {
    recipeId: entry.recipeId ?? '',
    mealType: entry.mealType,
    slotIndex: entry.slotIndex,
  };
  const next = withLog(day, [...stored.filter((m) => !matchesRecipeSlot(m, target)), entry]);
  const slot =
    entry.slotIndex === undefined
      ? undefined
      : { mealType: entry.mealType, slotIndex: entry.slotIndex };
  const skippedSlots = withoutSkip(day, slot);
  return skippedSlots ? { ...next, skippedSlots } : next;
}

/**
 * Optimistic `logCustomMeal` with `replacesSlot` ("Ate something else"): the
 * custom `entry` (which carries `replacesSlot`) takes the slot, like the
 * server — a ticked recipe entry or an earlier replacement for that slot is
 * dropped, and a skip on it is cleared.
 */
export function withSlotReplaced<D extends DayLike>(
  day: D,
  entry: DayEntry & { replacesSlot: SlotRef },
): D {
  const slot = entry.replacesSlot;
  const kept = (day.log?.loggedMeals ?? []).filter(
    (m) =>
      !(m.replacesSlot && sameSlot(m.replacesSlot, slot)) &&
      !(m.recipeId && !m.custom && m.slotIndex === slot.slotIndex && m.mealType === slot.mealType),
  );
  const next = withLog(day, [...kept, entry]);
  const skippedSlots = withoutSkip(day, slot);
  return skippedSlots ? { ...next, skippedSlots } : next;
}

/** Optimistic `skipSlot`: idempotent. */
export function withSlotSkipped<D extends DayLike>(day: D, slot: SlotRef): D {
  const current = day.skippedSlots ?? [];
  if (current.some((s) => sameSlot(s, slot))) return day;
  return { ...day, skippedSlots: [...current, slot] };
}

/** Optimistic `unskipSlot`. */
export function withSlotUnskipped<D extends DayLike>(day: D, slot: SlotRef): D {
  return { ...day, skippedSlots: (day.skippedSlots ?? []).filter((s) => !sameSlot(s, slot)) };
}

/** Optimistic `unlogRecipe`. */
export function withRecipeUnlogged<D extends DayLike>(
  day: D,
  target: { recipeId: string; mealType: string; slotIndex?: number | undefined },
): D {
  if (!day.log) return day;
  return withLog(
    day,
    day.log.loggedMeals.filter((m) => !matchesRecipeSlot(m, target)),
  );
}

/**
 * Optimistic removal of entries by stable id (a bin, an off-plan delete, the
 * Undo of Copy day) or, for an entry that has no id yet, by its index in the
 * full `loggedMeals` array. Off-plan rows disappear with their entry.
 */
export function withEntriesRemoved<D extends DayLike>(
  day: D,
  target: { entryIds?: readonly string[]; entryIndex?: number },
): D {
  if (!day.log) return day;
  const ids = new Set(target.entryIds ?? []);
  const kept = day.log.loggedMeals.filter(
    (m, i) => !(m.entryId !== undefined && ids.has(m.entryId)) && i !== target.entryIndex,
  );
  const next = withLog(day, kept);
  return day.offPlanLogged
    ? { ...next, offPlanLogged: day.offPlanLogged.filter((o) => !o.entryId || !ids.has(o.entryId)) }
    : next;
}

/** Optimistic `restoreCustomMeal` / re-add: idempotent on `entryId`. */
export function withEntryRestored<D extends DayLike>(day: D, entry: DayEntry): D {
  const stored = day.log?.loggedMeals ?? [];
  if (entry.entryId && stored.some((m) => m.entryId === entry.entryId)) return day;
  return withLog(day, [...stored, entry]);
}

/** Optimistic `updateRecipeEntry`: portion and/or meal of one logged recipe. */
export function withRecipeEntryEdited<D extends DayLike>(
  day: D,
  entryId: string,
  edit: { portionMultiplier?: number | undefined; mealType?: string | undefined },
  /** What the recipe's macros are at ×1 (the server recomputes from the recipe). */
  perServing: { kcal: number; protein: number; carbs: number; fat: number },
): D {
  if (!day.log) return day;
  const portion = edit.portionMultiplier;
  const scaled = () =>
    portion === undefined
      ? {}
      : {
          portionMultiplier: portion,
          kcal: Math.round(perServing.kcal * portion),
          protein: Math.round(perServing.protein * portion * 10) / 10,
          carbs: Math.round(perServing.carbs * portion * 10) / 10,
          fat: Math.round(perServing.fat * portion * 10) / 10,
        };
  const loggedMeals = day.log.loggedMeals.map((m) =>
    m.entryId === entryId ? { ...m, mealType: edit.mealType ?? m.mealType, ...scaled() } : m,
  );
  const next = withLog(day, loggedMeals);
  return day.offPlanLogged
    ? {
        ...next,
        offPlanLogged: day.offPlanLogged.map((o) =>
          o.entryId === entryId ? { ...o, mealType: edit.mealType ?? o.mealType, ...scaled() } : o,
        ),
      }
    : next;
}
