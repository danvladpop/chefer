// ─── "Still have these?" pantry check (audit F-PM-13, P2-8) ──────────────────
// The weekly pantry confirm used to open as a sheet over the shopping list on
// every open, asking about items checked off minutes earlier. It is now an
// inline banner that asks at most once a week, and only about items that
// have been in the kitchen for a few days.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Items bought or confirmed more recently than this are not asked about. */
export const PANTRY_CONFIRM_MIN_AGE_DAYS = 3;

export interface PantryItemAgeLike {
  id: string;
  updatedAt: Date | string;
}

/** Pantry items old enough to ask "still have this?" about, oldest first. */
export function pantryItemsToConfirm<T extends PantryItemAgeLike>(
  items: readonly T[],
  now: Date = new Date(),
  minAgeDays: number = PANTRY_CONFIRM_MIN_AGE_DAYS,
): T[] {
  const cutoff = now.getTime() - minAgeDays * DAY_MS;
  return items
    .filter((item) => new Date(item.updatedAt).getTime() <= cutoff)
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
}

/**
 * The Monday (local calendar day, YYYY-MM-DD) of the week `now` falls in.
 * The banner stores it once answered or dismissed, so it asks once a week.
 */
export function pantryConfirmWeekKey(now: Date = new Date()): string {
  const day = now.getDay();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${monday.getFullYear()}-${mm}-${dd}`;
}
