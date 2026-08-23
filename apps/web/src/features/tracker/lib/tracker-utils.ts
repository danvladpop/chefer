// ─── Tracker custom-entry helpers (F4 Snap-to-Log) ────────────────────────────
// Pure functions behind the tracker page's custom-entry rows — kept out of the
// component so the rendering rules (which entries show, what the chip says,
// which index a delete targets) are unit-testable.

/** Structural mirror of the API's LoggedMealEntry (daily-log.repository). */
export interface LoggedMealEntryLike {
  recipeId?: string | undefined;
  custom?: { name: string; estimatedBy: 'vision' | 'manual' } | undefined;
  mealType: string;
  portionMultiplier: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface CustomEntryRow {
  /** Index in the day's FULL loggedMeals array — what deleteCustomMeal takes. */
  entryIndex: number;
  name: string;
  estimatedBy: 'vision' | 'manual';
  mealType: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
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
        name: entry.custom.name,
        estimatedBy: entry.custom.estimatedBy,
        mealType: entry.mealType,
        kcal: entry.kcal,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
      },
    ];
  });
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
