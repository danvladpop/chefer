import { addDaysLocal, weekdayOf, weekStartOf } from '../gym/weeks';

/**
 * Which week's recap is open today (idea 52): Sunday opens this week's, Monday
 * and Tuesday still offer last week's, the rest of the week offers none.
 * Returns the Monday of that week, or null.
 */
export function recapWeekFor(today: string): string | null {
  const weekday = weekdayOf(today);
  if (weekday === 6) return weekStartOf(today);
  if (weekday <= 1) return addDaysLocal(weekStartOf(today), -7);
  return null;
}
