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
 * - Or a custom entry (photo scan or quick add) was logged for the same meal
 *   type: the user ate something else for that meal. Snacks are the
 *   exception, because web quick-adds always land as "snack" and would
 *   otherwise swallow a planned snack.
 */
export function isSlotEaten(slot: PlannedMealSlot, logged: readonly LoggedMealRef[]): boolean {
  return logged.some((entry) => {
    if (entry.recipeId) return entry.recipeId === slot.recipeId;
    return entry.custom !== undefined && slot.type !== 'snack' && entry.mealType === slot.type;
  });
}

export interface TodayMeals<T extends PlannedMealSlot> {
  /** The meal to put in the spotlight, or null when none is left today. */
  next: T | null;
  /** Meals after `next` that are still to come (not eaten). */
  later: T[];
  /** Today's slots already eaten, in day order. */
  eaten: T[];
}

/**
 * Resolves today's meals against the clock and the log.
 *
 * `next` is the first slot, in day order, that is not eaten and whose window
 * is still open. A meal that was logged early (breakfast eaten at 7:00)
 * advances the spotlight at once; a meal whose window closed unlogged is left
 * behind (the full-day tracker still lists it). Unknown meal types sort last
 * and never close.
 */
export function resolveTodayMeals<T extends PlannedMealSlot>(
  slots: readonly T[],
  currentHour: number,
  logged: readonly LoggedMealRef[] = [],
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
  const customEaten = (slot: T) =>
    logged.some(
      (entry) =>
        !entry.recipeId &&
        entry.custom !== undefined &&
        slot.type !== 'snack' &&
        entry.mealType === slot.type,
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
        !customEaten(slot),
    );
    if (at !== -1) strayEaten.add(at);
  }

  let next: T | null = null;
  const later: T[] = [];
  const eaten: T[] = [];

  for (const [i, { slot }] of ordered.entries()) {
    if (matched[i] !== undefined || strayEaten.has(i) || customEaten(slot)) {
      eaten.push(slot);
      continue;
    }
    if (next) {
      later.push(slot);
      continue;
    }
    const windowEnd = MEAL_WINDOW_END[slot.type] ?? 24;
    if (currentHour < windowEnd) next = slot;
  }

  return { next, later, eaten };
}
