// ─── Following profile: date and label formatting ─────────────────────────────
// Fixed English labels (no Intl: Hermes' locale data varies by build), the
// same Mon-first weekday convention as the plan (0 = Monday … 6 = Sunday).
// Dates from the API are the OWNER's local calendar days (`YYYY-MM-DD`), so
// they are read as plain calendar dates, never shifted through a time zone.

export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const WEEKDAYS_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

type CalendarDay = { year: number; month: number; day: number; weekday: number };

/** `2026-09-29` → its parts and Mon-first weekday; null for anything else. */
export function parseCalendarDay(iso: string): CalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(utc.getTime())) return null;
  return { year, month, day, weekday: (utc.getUTCDay() + 6) % 7 };
}

/** `2026-09-28` → `28 Sep` (the `Week of {d MMM}` fragment). */
export function formatDayMonth(iso: string): string {
  const c = parseCalendarDay(iso);
  if (!c) return iso;
  return `${c.day} ${MONTHS_SHORT[c.month - 1] ?? ''}`.trim();
}

/** `2026-09-29` → `Tue 29 Sep` (a workout card's date). */
export function formatWeekdayDayMonth(iso: string): string {
  const c = parseCalendarDay(iso);
  if (!c) return iso;
  return `${WEEKDAYS_SHORT[c.weekday] ?? ''} ${formatDayMonth(iso)}`.trim();
}

/** 0 → `Monday`. */
export function weekdayFull(dayOfWeek: number): string {
  return WEEKDAYS_FULL[dayOfWeek] ?? '';
}

/** 0 → `Mon`. */
export function weekdayShort(dayOfWeek: number): string {
  return WEEKDAYS_SHORT[dayOfWeek] ?? '';
}

/** `lunch` as it reads mid-sentence (`Add to Tue lunch`). */
export function mealTypeLabel(type: string): string {
  return type.toLowerCase();
}

/** Rest in seconds → `2:30` (UX §10 `m:ss`). */
export function formatRest(restSec: number): string {
  const s = Math.max(0, Math.round(restSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A time of day for the offline line (`showing what was saved 14:05`). */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
