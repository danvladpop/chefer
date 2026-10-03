import { randomUUID } from 'node:crypto';
import type { LoggedMealEntry } from '@chefer/database';

/** A planned-recipe entry (as opposed to a custom quick-add or scan). */
export function isRecipeEntry(m: LoggedMealEntry): m is LoggedMealEntry & { recipeId: string } {
  return typeof m.recipeId === 'string' && !m.custom;
}

/**
 * Same identity rule `logRecipe` uses to replace-not-duplicate: same recipe,
 * and (when the target names a slot) the same slot, else the same meal type.
 * Shared with `unlogRecipe` (T-19.4, one-save model) so ticking and
 * unticking a plan row agree on which stored entry a row corresponds to.
 */
export function matchesRecipeSlot(
  m: LoggedMealEntry,
  target: { recipeId: string; mealType: string; slotIndex?: number | undefined },
): boolean {
  return (
    m.recipeId === target.recipeId &&
    (target.slotIndex !== undefined
      ? m.slotIndex === target.slotIndex
      : m.mealType === target.mealType)
  );
}

/**
 * Assigns a stable `entryId` to every entry that doesn't have one yet (bug
 * B-34, T-19.2). Pure and idempotent: entries that already carry an id are
 * returned unchanged, so calling this on every read/write is safe and never
 * reassigns an id a client is already holding.
 */
export function ensureEntryIds(entries: LoggedMealEntry[]): LoggedMealEntry[] {
  return entries.map((m) => (m.entryId ? m : { ...m, entryId: randomUUID() }));
}

/** True when at least one entry is missing an `entryId` (needs a backfill write). */
export function needsEntryIdBackfill(entries: LoggedMealEntry[]): boolean {
  return entries.some((m) => !m.entryId);
}

/** A fresh, stable id for a new logged entry. */
export function newEntryId(): string {
  return randomUUID();
}

// ─── Recent entries (search-first Log sheet, T-19.1) ───────────────────────────
// "Recent" groups the last 15 DISTINCT things logged, most frequent first —
// distinct by recipe (recipeId) or by name (custom entries, case-insensitive).
// Deleted entries never appear here: they're gone from the days scanned, not
// filtered out separately.

export interface RecentLogDay {
  /** The day's local calendar date (YYYY-MM-DD), for the recency tie-break. */
  dateStr: string;
  entries: LoggedMealEntry[];
}

export interface RecentAggregate {
  /** `recipe:<id>` or `custom:<normalized name>` — the de-dupe key. */
  key: string;
  recipeId?: string;
  customName?: string;
  estimatedBy?: 'vision' | 'manual';
  mealType: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  unknownMacros?: ('protein' | 'carbs' | 'fat')[];
  portionMultiplier?: number;
  /** How many times this was logged in the scanned window. */
  count: number;
  /** The most recent day (of the scanned window) it was logged. */
  lastLoggedAt: string;
}

/**
 * Aggregates logged entries across days into distinct "recent" rows, most
 * frequent first (ties broken by most recent). `days` may be given in any
 * order — only each entry's own `dateStr` decides recency. Each aggregate's
 * displayed macros/mealType come from its MOST RECENT occurrence (a recipe's
 * macros can change; the last log is the most representative one).
 */
export function aggregateRecents(days: RecentLogDay[], limit = 15): RecentAggregate[] {
  const byKey = new Map<string, RecentAggregate>();
  const sortedDays = [...days].sort((a, b) => (a.dateStr < b.dateStr ? -1 : 1)); // oldest first
  for (const day of sortedDays) {
    for (const entry of day.entries) {
      const key = entry.recipeId
        ? `recipe:${entry.recipeId}`
        : entry.custom
          ? `custom:${entry.custom.name.trim().toLowerCase()}`
          : null;
      if (!key) continue;
      const count = (byKey.get(key)?.count ?? 0) + 1;
      byKey.set(key, {
        key,
        ...(entry.recipeId && { recipeId: entry.recipeId }),
        ...(entry.custom && {
          customName: entry.custom.name,
          estimatedBy: entry.custom.estimatedBy,
        }),
        mealType: entry.mealType,
        kcal: entry.kcal,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        ...(entry.unknownMacros &&
          entry.unknownMacros.length > 0 && { unknownMacros: entry.unknownMacros }),
        ...(entry.portionMultiplier !== undefined && {
          portionMultiplier: entry.portionMultiplier,
        }),
        count,
        lastLoggedAt: day.dateStr,
      });
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || (a.lastLoggedAt < b.lastLoggedAt ? 1 : -1))
    .slice(0, limit);
}

/**
 * Merges a client's tracker save into the stored day.
 *
 * `tracker.upsertDay` used to replace the whole day with what the client
 * sent, and the tracker only renders today's planned meals. So a meal logged
 * from cook mode whose recipe later left the plan (regenerate or swap) was
 * invisible on the page and deleted by the next save (audit F-PM-1), and a
 * stale tab's copy of the custom entries overwrote entries added elsewhere
 * (F-TRK-1-2). Now:
 *
 * - Custom entries (quick-add, photo scan) are server-owned: added by
 *   logCustomMeal, removed by deleteCustomMeal, never by a day save. Whatever
 *   custom entries the client echoes back are ignored.
 * - Planned-recipe entries the client could see (today's planned recipes, or
 *   any recipe it sends) are replaced by the client's list — that is how the
 *   tracker ticks and unticks meals.
 * - Every other stored recipe entry is kept: the client never saw it, so it
 *   can't have meant to remove it.
 */
export function mergeLoggedMeals(
  stored: LoggedMealEntry[],
  incoming: LoggedMealEntry[],
  plannedRecipeIds: ReadonlySet<string>,
): LoggedMealEntry[] {
  const incomingRecipes = incoming.filter(isRecipeEntry);
  const clientManaged = new Set<string>([
    ...plannedRecipeIds,
    ...incomingRecipes.map((m) => m.recipeId),
  ]);
  const keptRecipes = stored.filter(
    (m) => m.recipeId && !m.custom && !clientManaged.has(m.recipeId),
  );
  const customs = stored.filter((m) => m.custom);
  return [...incomingRecipes, ...keptRecipes, ...customs];
}
