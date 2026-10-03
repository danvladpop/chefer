// ─── Tracker custom-entry helpers (F4 Snap-to-Log) ────────────────────────────
// Pure functions behind the tracker page's custom-entry rows — kept out of the
// component so the rendering rules (which entries show, what the chip says,
// which index a delete targets) are unit-testable.

/** Structural mirror of the API's LoggedMealEntry (daily-log.repository). */
export interface LoggedMealEntryLike {
  /** Stable id (T-19.2, B-34) — optional: an entry read before the lazy
   * backfill (tracker.getDay) may not have one yet. */
  entryId?: string | undefined;
  recipeId?: string | undefined;
  custom?: { name: string; estimatedBy: 'vision' | 'manual' } | undefined;
  mealType: string;
  portionMultiplier: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** UX-FOOD-11: macros the user left blank (stored as 0 g). */
  unknownMacros?: readonly ('protein' | 'carbs' | 'fat')[] | undefined;
}

export interface CustomEntryRow {
  /** Index in the day's FULL loggedMeals array — what deleteCustomMeal takes. */
  entryIndex: number;
  /** Stable id (T-19.2, B-34) — what updateCustomMeal/restoreCustomMeal take.
   * Practically always present (tracker.getDay backfills it), kept optional
   * only to match the source type. */
  entryId?: string | undefined;
  name: string;
  estimatedBy: 'vision' | 'manual';
  mealType: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** UX-FOOD-11: macros the user left blank (stored as 0 g). */
  unknownMacros?: readonly ('protein' | 'carbs' | 'fat')[] | undefined;
}

/**
 * The day's custom entries (photo scans + quick-adds) with their position in
 * the full loggedMeals array preserved — deletion is by that index, so it
 * must survive the filtering.
 */
export function customEntryRows(loggedMeals: LoggedMealEntryLike[]): CustomEntryRow[] {
  return loggedMeals.flatMap((entry, entryIndex) => {
    if (!entry.custom || entry.recipeId) return [];
    return [
      {
        entryIndex,
        entryId: entry.entryId,
        name: entry.custom.name,
        estimatedBy: entry.custom.estimatedBy,
        mealType: entry.mealType,
        kcal: entry.kcal,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        ...(entry.unknownMacros && entry.unknownMacros.length > 0
          ? { unknownMacros: entry.unknownMacros }
          : {}),
      },
    ];
  });
}

/**
 * Which macros of a custom entry are unknown rather than 0 g (UX-FOOD-11).
 * The stored flag wins; an entry from before the flag whose macros are all 0
 * is a calories-only quick add, so all three are unknown.
 */
export function entryUnknownMacros(entry: {
  protein: number;
  carbs: number;
  fat: number;
  unknownMacros?: readonly ('protein' | 'carbs' | 'fat')[] | undefined;
}): ('protein' | 'carbs' | 'fat')[] {
  if (entry.unknownMacros) return [...entry.unknownMacros];
  return entry.protein === 0 && entry.carbs === 0 && entry.fat === 0
    ? ['protein', 'carbs', 'fat']
    : [];
}

/** Chip copy: vision estimates are honest about being estimates. */
export function customEntryChipLabel(estimatedBy: 'vision' | 'manual'): string {
  return estimatedBy === 'vision' ? 'estimated' : 'quick add';
}

/**
 * Macro totals of the custom entries alone. Their macros are stored
 * pre-scaled (portionMultiplier is always 1), so no multiplication here —
 * the page adds these on top of the checked planned meals.
 */
export function customEntryTotals(loggedMeals: LoggedMealEntryLike[]): {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  return customEntryRows(loggedMeals).reduce(
    (acc, row) => ({
      kcal: acc.kcal + row.kcal,
      protein: acc.protein + row.protein,
      carbs: acc.carbs + row.carbs,
      fat: acc.fat + row.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

// ─── "Also eaten" grouping and copy (UX-FOOD-25) ─────────────────────────────

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/**
 * Groups rows under their meal slot, in day order (breakfast → snack, then any
 * unknown meal type), keeping each group's rows in the order given. Off-plan
 * recipes and custom entries share one "Also eaten" list this way instead of
 * two stacked sections that lost the meal they belong to.
 */
export function groupByMeal<T extends { mealType: string }>(
  rows: readonly T[],
): { mealType: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.mealType.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const rank = (meal: string): number => {
    const i = (MEAL_ORDER as readonly string[]).indexOf(meal);
    return i === -1 ? MEAL_ORDER.length : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([mealType, groupRows]) => ({ mealType, rows: groupRows }));
}

/** "Copied 1 entry" / "Copied 3 entries" / "Nothing to copy from yesterday". */
export function copyDayMessage(count: number, fromLabel: string): string {
  if (count <= 0) return `Nothing to copy from ${fromLabel}`;
  return `Copied ${count} ${count === 1 ? 'entry' : 'entries'}`;
}

/**
 * The device-local clock time of the next 00:00 UTC — when the daily AI
 * allowances reset ("3:00 AM" in Bucharest, "5:00 PM" in Los Angeles) — so
 * copy can say when the user's own day rolls over instead of "midnight UTC".
 */
export function dailyAllowanceResetTime(now: Date = new Date()): string {
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
