import { slotPortion } from './meal-portion';

// ─── Today: which planned meal is next (audit F-PM-10, P2-2) ─────────────────
// The Today surface (web /dashboard, mobile Today tab) shows ONE next meal
// with a one-tap "I ate this". It used to pick by clock only, so after
// "Made it!" on dinner the same dinner stayed "next". A meal the user already
// logged today is now skipped, and the next open one takes its place.

/** Chronological order of a day's meal slots. */
export const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

/** The hour (exclusive) at which each meal's window closes. */
export const MEAL_WINDOW_END: Record<string, number> = {
  breakfast: 10,
  lunch: 14,
  snack: 17,
  dinner: 21,
};

/** A planned meal slot: its type and the recipe that fills it. */
export interface PlannedMealSlot {
  type: string;
  recipeId: string;
  /**
   * The slot's index in the plan day's `meals` array, when the caller knows
   * it. Absent = its position in the list passed in.
   */
  slotIndex?: number | undefined;
}

/** Structural subset of a logged tracker entry (daily_logs.loggedMeals). */
export interface LoggedMealRef {
  recipeId?: string | undefined;
  custom?: { name: string; estimatedBy: 'vision' | 'manual' } | undefined;
  mealType: string;
  /**
   * The plan slot this entry was logged from (tracker tick, Today's "I ate
   * this"). Absent on entries from older clients and cook mode.
   */
  slotIndex?: number | undefined;
  /**
   * WP-06 "Ate something else": on a CUSTOM entry, the plan slot it replaces.
   * That slot counts as eaten with this entry's numbers (status `replaced`).
   */
  replacesSlot?: SlotRef | undefined;
}

/** A plan slot of one day: its meal type and its index in the day's `meals`. */
export interface SlotRef {
  mealType: string;
  slotIndex: number;
}

/**
 * What a planned slot is today (WP-06):
 * - `planned`  — still to eat;
 * - `eaten`    — the planned recipe was logged;
 * - `replaced` — "Ate something else": a custom entry carries `replacesSlot`
 *   for it. Counts as EATEN, with the replacement's numbers; the planned
 *   recipe leaves the day's planned totals;
 * - `skipped`  — "Skipped it": neither eaten nor remaining, and it leaves the
 *   planned totals too. Precedence when data disagrees: replaced > eaten > skipped.
 */
export type SlotStatus = 'planned' | 'eaten' | 'replaced' | 'skipped';

/** Does `ref` point at this slot? Without a slot index only the meal type is compared. */
function refTargets(ref: SlotRef, type: string, slotIndex: number | undefined): boolean {
  return ref.mealType === type && (slotIndex === undefined || ref.slotIndex === slotIndex);
}

/** The custom entry that replaces `slot`, if any ("You had: Shawarma"). */
export function replacementFor<E extends LoggedMealRef>(
  slot: PlannedMealSlot,
  logged: readonly E[],
): E | undefined {
  return logged.find(
    (e) =>
      !e.recipeId &&
      e.replacesSlot !== undefined &&
      refTargets(e.replacesSlot, slot.type, slot.slotIndex),
  );
}

/** Whether the user skipped `slot` ("Skipped it"). */
export function isSlotSkipped(slot: PlannedMealSlot, skipped: readonly SlotRef[] = []): boolean {
  return skipped.some((ref) => refTargets(ref, slot.type, slot.slotIndex));
}

/**
 * Pairs logged recipe entries with planned slots, ONE entry per slot, so two
 * slots holding the same recipe (two identical snacks) need two entries to
 * both count as eaten. Returns the matched entry per position in `slots`.
 *
 * 1. An entry with a `slotIndex` claims that slot, if it still holds the
 *    entry's recipe (a swap since then makes it an ordinary entry).
 * 2. Every other recipe entry claims the first unclaimed slot, in `slots`
 *    order, with its recipe and meal type;
 * 3. then, with `crossType`, the first unclaimed slot with its recipe under
 *    any type (cook mode guesses the type from the clock).
 *
 * Custom entries never match here — see resolveTodayMeals.
 */
export function matchLoggedToSlots<E extends LoggedMealRef>(
  slots: readonly PlannedMealSlot[],
  logged: readonly E[],
  opts: { crossType?: boolean } = {},
): (E | undefined)[] {
  const matched: (E | undefined)[] = slots.map(() => undefined);
  const indexOf = (i: number) => slots[i]?.slotIndex ?? i;
  const recipeEntries = logged.filter((e) => typeof e.recipeId === 'string' && !e.custom);
  const rest: E[] = [];
  for (const entry of recipeEntries) {
    const at =
      entry.slotIndex === undefined
        ? -1
        : slots.findIndex(
            (slot, i) =>
              indexOf(i) === entry.slotIndex &&
              slot.recipeId === entry.recipeId &&
              matched[i] === undefined,
          );
    if (at === -1) rest.push(entry);
    else matched[at] = entry;
  }
  const claim = (entry: E, sameType: boolean) => {
    const at = slots.findIndex(
      (slot, i) =>
        matched[i] === undefined &&
        slot.recipeId === entry.recipeId &&
        (!sameType || slot.type === entry.mealType),
    );
    if (at === -1) return false;
    matched[at] = entry;
    return true;
  };
  const unclaimed = rest.filter((entry) => !claim(entry, true));
  if (opts.crossType) for (const entry of unclaimed) claim(entry, false);
  return matched;
}

/**
 * Whether a planned slot counts as eaten today, looking at the slot alone.
 * resolveTodayMeals uses matchLoggedToSlots instead, which also tells two
 * slots of the same recipe apart.
 *
 * - The same recipe was logged (cook mode's "Made it!", the tracker, or
 *   Today's "I ate this"), whatever meal type it was logged under: cook mode
 *   guesses the type from the clock when opened outside a slot.
 * - Or a custom entry replaces this very slot (`replacesSlot`, WP-06 "Ate
 *   something else"). That entry covers ONLY its slot.
 * - Or a custom entry WITHOUT `replacesSlot` (photo scan or quick add,
 *   including older clients') was logged for the same meal type: the user ate
 *   something else for that meal. Snacks are the exception, because web
 *   quick-adds always land as "snack" and would otherwise swallow a planned
 *   snack.
 *
 * A skipped slot is NOT eaten; use `slotStatus` to tell the four states apart.
 */
export function isSlotEaten(slot: PlannedMealSlot, logged: readonly LoggedMealRef[]): boolean {
  return logged.some((entry) => {
    if (entry.recipeId) return entry.recipeId === slot.recipeId;
    if (entry.replacesSlot) return refTargets(entry.replacesSlot, slot.type, slot.slotIndex);
    return entry.custom !== undefined && slot.type !== 'snack' && entry.mealType === slot.type;
  });
}

/**
 * The single-slot status (see SlotStatus). Eaten-ness follows `isSlotEaten`
 * (so it cannot tell two slots of one recipe apart — use `slotStates` for a
 * whole day). Pass `slot.slotIndex` so replace/skip target the right slot.
 */
export function slotStatus(
  slot: PlannedMealSlot,
  logged: readonly LoggedMealRef[] = [],
  skipped: readonly SlotRef[] = [],
): SlotStatus {
  if (replacementFor(slot, logged)) return 'replaced';
  if (isSlotEaten(slot, logged)) return 'eaten';
  return isSlotSkipped(slot, skipped) ? 'skipped' : 'planned';
}

/** One slot's resolved state; `entry` is the logged entry behind `eaten` / `replaced`. */
export type SlotState<E extends LoggedMealRef = LoggedMealRef> =
  | { status: 'planned' }
  | { status: 'skipped' }
  | { status: 'eaten'; entry: E }
  | { status: 'replaced'; entry: E };

/**
 * The state of every slot of one day, aligned with `slots` — the ONE helper
 * the tracker, Plan day and Today rows should use (web and mobile).
 *
 * A slot is `eaten` when a logged RECIPE entry claims it (matchLoggedToSlots:
 * `slotIndex` first, then recipe + meal type), `replaced` when a custom entry
 * has `replacesSlot` for it, `skipped` when listed in `skipped`, else
 * `planned`. Unlike `isSlotEaten`/Today it does not apply the legacy "any
 * custom entry of the same meal type" rule, matching the tracker's ticks.
 * A slot's index is its `slotIndex`, or its position in `slots`.
 */
export function slotStates<E extends LoggedMealRef>(
  slots: readonly PlannedMealSlot[],
  logged: readonly E[],
  skipped: readonly SlotRef[] = [],
): SlotState<E>[] {
  const indexed = slots.map((slot, i) => ({ ...slot, slotIndex: slot.slotIndex ?? i }));
  const matched = matchLoggedToSlots(indexed, logged);
  return indexed.map((slot, i): SlotState<E> => {
    const replacement = replacementFor(slot, logged);
    if (replacement) return { status: 'replaced', entry: replacement };
    const entry = matched[i];
    if (entry) return { status: 'eaten', entry };
    return isSlotSkipped(slot, skipped) ? { status: 'skipped' } : { status: 'planned' };
  });
}

/** Per-serving macros of a plan row, with the slot's portion (`DayPlanMeal`). */
export interface PlannedMacros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  portion?: number | undefined;
}

export interface MacroTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

function sumSlots(
  meals: readonly PlannedMacros[],
  states: readonly { status: SlotStatus }[],
  keep: (status: SlotStatus) => boolean,
): MacroTotals {
  const totals: MacroTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  meals.forEach((meal, i) => {
    const status = states[i]?.status ?? 'planned';
    if (!keep(status)) return;
    const p = slotPortion(meal.portion);
    totals.kcal += meal.kcal * p;
    totals.protein += meal.protein * p;
    totals.carbs += meal.carbs * p;
    totals.fat += meal.fat * p;
  });
  return totals;
}

/**
 * The day's PLANNED totals: every slot still `planned` or `eaten` as planned.
 * A replaced slot's recipe leaves the plan (its replacement is in the eaten
 * total instead) and a skipped slot is dropped. `meals` and `states` align.
 */
export function plannedTotals(
  meals: readonly PlannedMacros[],
  states: readonly { status: SlotStatus }[],
): MacroTotals {
  return sumSlots(meals, states, (s) => s === 'planned' || s === 'eaten');
}

/** The planned meals still to eat: only `planned` slots (not eaten, replaced or skipped). */
export function remainingTotals(
  meals: readonly PlannedMacros[],
  states: readonly { status: SlotStatus }[],
): MacroTotals {
  return sumSlots(meals, states, (s) => s === 'planned');
}

export interface TodayMeals<T extends PlannedMealSlot> {
  /** The meal to put in the spotlight, or null when none is left today. */
  next: T | null;
  /** Meals after `next` that are still to come (not eaten). */
  later: T[];
  /**
   * Today's slots already eaten, in day order. Replaced slots are in here too
   * (a replaced slot IS eaten — with the replacement's numbers).
   */
  eaten: T[];
  /** The subset of `eaten` that was replaced ("Ate something else"), WP-06. */
  replaced: T[];
  /** Slots the user skipped: neither eaten nor remaining (WP-06). */
  skipped: T[];
}

/**
 * Resolves today's meals against the clock and the log.
 *
 * `next` is the first slot, in day order, that is not eaten and whose window
 * is still open. A meal that was logged early (breakfast eaten at 7:00)
 * advances the spotlight at once; a meal whose window closed unlogged is left
 * behind (the full-day tracker still lists it). Unknown meal types sort last
 * and never close. A replaced slot is eaten; a skipped slot is in `skipped`
 * and in none of next / later / eaten.
 */
export function resolveTodayMeals<T extends PlannedMealSlot>(
  slots: readonly T[],
  currentHour: number,
  logged: readonly LoggedMealRef[] = [],
  skipped: readonly SlotRef[] = [],
): TodayMeals<T> {
  const rank = (type: string) => {
    const i = (MEAL_ORDER as readonly string[]).indexOf(type);
    return i === -1 ? MEAL_ORDER.length : i;
  };
  // Keep each slot's plan index through the sort, so logged `slotIndex`
  // values still point at the right slot.
  const ordered = slots
    .map((slot, i) => ({ slot, slotIndex: slot.slotIndex ?? i }))
    .sort((a, b) => rank(a.slot.type) - rank(b.slot.type));
  const matched = matchLoggedToSlots(
    ordered.map(({ slot, slotIndex }) => ({ type: slot.type, recipeId: slot.recipeId, slotIndex })),
    logged,
    { crossType: true },
  );
  // Legacy rule: a custom entry without `replacesSlot` covers its meal type.
  // An entry that names its slot covers only that slot (replacedAt below).
  const customEaten = (slot: T) =>
    logged.some(
      (entry) =>
        !entry.recipeId &&
        entry.custom !== undefined &&
        entry.replacesSlot === undefined &&
        slot.type !== 'snack' &&
        entry.mealType === slot.type,
    );
  const replacedAt = ordered.map(({ slot, slotIndex }) =>
    logged.some(
      (e) =>
        !e.recipeId &&
        e.replacesSlot !== undefined &&
        refTargets(e.replacesSlot, slot.type, slotIndex),
    ),
  );
  const skippedAt = ordered.map(({ slot, slotIndex }) =>
    skipped.some((ref) => refTargets(ref, slot.type, slotIndex)),
  );

  // UX-PLAN-01: "dinner done" is read from the LOG, not from the slot's recipe
  // id. A recipe logged for a meal type that no slot holds any more (the plan
  // was regenerated or swapped after the user ate, or they logged something
  // else from search) still means that meal is done — otherwise Today offers a
  // second dinner. Same rule as a custom entry: one stray recipe entry covers
  // ONE still-open slot of its meal type, and snacks are exempt (a logged
  // snack must not swallow a planned one).
  const claimed = new Set<unknown>(matched.filter((entry) => entry !== undefined));
  const strayEaten = new Set<number>();
  for (const entry of logged) {
    if (!entry.recipeId || entry.custom || claimed.has(entry) || entry.mealType === 'snack') {
      continue;
    }
    const at = ordered.findIndex(
      ({ slot }, i) =>
        matched[i] === undefined &&
        !strayEaten.has(i) &&
        slot.type === entry.mealType &&
        !replacedAt[i] &&
        !skippedAt[i] &&
        !customEaten(slot),
    );
    if (at !== -1) strayEaten.add(at);
  }

  let next: T | null = null;
  const later: T[] = [];
  const eaten: T[] = [];
  const replaced: T[] = [];
  const skippedSlots: T[] = [];

  for (const [i, { slot }] of ordered.entries()) {
    if (replacedAt[i]) {
      eaten.push(slot);
      replaced.push(slot);
      continue;
    }
    if (matched[i] !== undefined || strayEaten.has(i) || customEaten(slot)) {
      eaten.push(slot);
      continue;
    }
    if (skippedAt[i]) {
      skippedSlots.push(slot);
      continue;
    }
    if (next) {
      later.push(slot);
      continue;
    }
    const windowEnd = MEAL_WINDOW_END[slot.type] ?? 24;
    if (currentHour < windowEnd) next = slot;
  }

  return { next, later, eaten, replaced, skipped: skippedSlots };
}
