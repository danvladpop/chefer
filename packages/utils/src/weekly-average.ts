import { formatKcal, formatNumber } from './format';

// "This week you averaged 1,640 kcal · 112 g protein a day" (WP-06, Food 2),
// shared by the mobile tracker and web Today.
// The week's average is the number the tracker praises; a single day over or
// under is not judged. Today is left out (it is still being logged), and it
// needs at least two logged days before "average" means anything.

export type WeekDay = { date: string; totalKcal: number; totalProtein: number; hasLog: boolean };

export const WEEKLY_AVERAGE_MIN_DAYS = 2;

export function weeklyAverage(
  days: readonly WeekDay[],
  today: string,
): { kcal: number; protein: number; days: number } | null {
  const logged = days.filter((d) => d.date !== today && d.hasLog && d.totalKcal > 0);
  if (logged.length < WEEKLY_AVERAGE_MIN_DAYS) return null;
  const total = logged.reduce(
    (t, d) => ({ kcal: t.kcal + d.totalKcal, protein: t.protein + d.totalProtein }),
    { kcal: 0, protein: 0 },
  );
  return {
    kcal: Math.round(total.kcal / logged.length),
    protein: Math.round(total.protein / logged.length),
    days: logged.length,
  };
}

export function weeklyAverageText(avg: { kcal: number; protein: number }): string {
  return `This week you averaged ${formatKcal(avg.kcal)} kcal · ${formatNumber(avg.protein)} g protein a day`;
}
