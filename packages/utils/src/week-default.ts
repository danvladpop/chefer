// ─── Default week (§2.5, T-08.1) ────────────────────────────────────────────────
// Which week Plan/Shop open to by default: this week, unless it's late enough
// on Friday that most people are already thinking about next week.

/** 0 = this week, 1 = next week. Fri >= 15:00 (local) switches to next week. */
export function defaultWeekOffset(now: Date): 0 | 1 {
  const day = now.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
  if (day === 5 && now.getHours() >= 15) return 1;
  if (day === 6) return 1;
  return 0;
}

// ─── Week start (T-08.1, UX-08 §0) ──────────────────────────────────────────────
// The one Monday-of-week calculation Plan, Shop and the week-outlook must all
// share — previously duplicated (and able to drift) across
// `app/(food)/meal-plan.tsx`, `app/(food)/shopping-list.tsx` and
// `week-outlook.tsx`. All arithmetic is in LOCAL calendar days: `setDate`
// moves by calendar day (DST-safe — a "day" stays a day across a spring-
// forward/fall-back transition) and `setHours(0, 0, 0, 0)` re-normalises to
// local midnight, so the result is always that calendar day's midnight even
// when the offset crosses a DST boundary.
/** The local midnight of the Monday that starts the week `offset` weeks from `now`'s week. */
export function getWeekStartDate(offset: number, now: Date = new Date()): Date {
  const day = now.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * UX-FOOD-02: the Monday (UTC midnight) of the week containing the calendar
 * day `dateStr` (`YYYY-MM-DD`, the client's LOCAL day). The plan-for-a-date
 * lookups (tracker, rebalance, coach, pantry, shop) all resolve a plan with
 * this instead of "the newest ACTIVE plan", which returns next week's plan
 * once next week has been opened. UTC arithmetic: the date string carries no
 * time zone, so reading its weekday must not shift with the server's.
 */
export function weekStartForDate(dateStr: string): Date {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const jsDay = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  date.setUTCDate(date.getUTCDate() - (jsDay === 0 ? 6 : jsDay - 1));
  return date;
}
