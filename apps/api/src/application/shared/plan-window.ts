// ─── Which days of a plan still need shopping (audit F-PM-3) ──────────────────
// A plan created mid-week (a new user signing up on Friday, a regenerate on
// Thursday, a carry-forward copy first opened on Wednesday) used to price and
// list all seven days: the first number a new user saw was ~€169 / 97 items
// for one person, about twice their real shop. The list and the planner's
// cost chip now cover the plan from the day it was created.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Index (0 = Monday … 6 = Sunday) of the first day to shop for: the day the
 * plan was created if that falls inside its week, else Monday. A plan made
 * before its week starts (next week's, the Sunday worker's) shops all 7 days.
 */
export function firstShoppingDay(weekStartDate: Date, createdAt: Date | undefined): number {
  if (!createdAt) return 0;
  const days = Math.floor((createdAt.getTime() - weekStartDate.getTime()) / DAY_MS);
  return Math.min(6, Math.max(0, days));
}

/** The plan's days from `fromDay` on (dayOfWeek order is untouched). */
export function daysFrom<T extends { dayOfWeek: number }>(days: T[], fromDay: number): T[] {
  return fromDay > 0 ? days.filter((d) => d.dayOfWeek >= fromDay) : days;
}
