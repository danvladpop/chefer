// ─── Progress averages need enough days (UX-11 T-11.6) ─────────────────────────
// One or two logged days make a misleading average and "vs target" percentage.
// Below three logged days the page shows a dash and says how many more days it
// needs, instead of a confident-looking number.

export const MIN_LOGGED_DAYS_FOR_AVERAGE = 3;

export function hasEnoughDaysForAverage(daysLogged: number): boolean {
  return daysLogged >= MIN_LOGGED_DAYS_FOR_AVERAGE;
}

/** `Log 2 more days to see your average` — null once there are enough days. */
export function moreDaysHint(daysLogged: number): string | null {
  if (hasEnoughDaysForAverage(daysLogged)) return null;
  const n = MIN_LOGGED_DAYS_FOR_AVERAGE - Math.max(0, daysLogged);
  return `Log ${n} more day${n === 1 ? '' : 's'} to see your average`;
}
