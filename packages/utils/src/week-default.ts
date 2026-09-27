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
