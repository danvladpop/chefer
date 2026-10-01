// "Today" and "this week" for ANOTHER person's data are the OWNER's, not the
// viewer's and not the server's (PRD FD-15). All date arithmetic is on
// YYYY-MM-DD strings treated as UTC midnights (reusing the gym helpers), so a
// daylight-saving change can never shift a day.
import { addDaysLocal, weekdayOf, weekStartOf } from '../gym/weeks';

/**
 * The owner's local calendar date (`YYYY-MM-DD`) at instant `now` in IANA time
 * zone `tz`. A missing or unknown zone falls back to UTC.
 */
export function ownerLocalDate(now: Date, tz: string | null | undefined): string {
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
      const y = get('year');
      const m = get('month');
      const d = get('day');
      if (y && m && d) return `${y.padStart(4, '0')}-${m}-${d}`;
    } catch {
      // RangeError for an invalid zone: fall through to UTC.
    }
  }
  return now.toISOString().slice(0, 10);
}

/**
 * The UTC midnight of the Monday that starts the week containing `localDate`:
 * the value `MealPlan.weekStartDate` holds (the API runs in UTC).
 */
export function mondayUtcOf(localDate: string): Date {
  return new Date(`${weekStartOf(localDate)}T00:00:00.000Z`);
}

/** 0 = Monday … 6 = Sunday (the plan's `dayOfWeek`). */
export function weekdayIndex(localDate: string): number {
  return weekdayOf(localDate);
}

/** The local date `n` days before `localDate` (`n` = 6 gives the 7-day window's first day). */
export function localDateMinusDays(localDate: string, n: number): string {
  return addDaysLocal(localDate, -n);
}
