import { formatKcal } from '@chefer/utils';

// The weekly average is the number Today praises (WP-06, Food 2): a day over or
// under is just a day, and the week is what the user is actually steering.

type WeekDay = { totalKcal: number; totalProtein: number; hasLog: boolean };

/** Fewer logged days than this and "this week you averaged" would be one day's number. */
const MIN_LOGGED_DAYS = 2;

/** The average of the days that have a log, or null when too few days are logged. */
export function weekAverages(days: readonly WeekDay[]): { kcal: number; protein: number } | null {
  const logged = days.filter((d) => d.hasLog);
  if (logged.length < MIN_LOGGED_DAYS) return null;
  const mean = (pick: (d: WeekDay) => number) =>
    Math.round(logged.reduce((sum, d) => sum + pick(d), 0) / logged.length);
  return { kcal: mean((d) => d.totalKcal), protein: mean((d) => d.totalProtein) };
}

/** "This week you averaged 1,640 kcal · 112 g protein a day", or null. */
export function weekAverageLine(days: readonly WeekDay[]): string | null {
  const avg = weekAverages(days);
  return avg
    ? `This week you averaged ${formatKcal(avg.kcal)} kcal · ${avg.protein} g protein a day`
    : null;
}
