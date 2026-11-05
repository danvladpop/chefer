import type { Translator } from '@chefer/i18n';

// ─── Following profile: date and label formatting ─────────────────────────────
// Names come from the `common` catalog tables (no Intl: Hermes' locale data
// varies by build), the same Mon-first weekday convention as the plan
// (0 = Monday … 6 = Sunday). Dates from the API are the OWNER's local calendar
// days (`YYYY-MM-DD`), so they are read as plain calendar dates, never shifted
// through a time zone.

const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

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
export function formatDayMonth(iso: string, t: Translator['t']): string {
  const c = parseCalendarDay(iso);
  if (!c) return iso;
  const month = MONTH_KEYS[c.month - 1];
  if (!month) return iso;
  return t('friends.format.dayMonth', { day: c.day, month: t(`common.monthsShort.${month}`) });
}

/** `2026-09-29` → `Tue 29 Sep` (a workout card's date). */
export function formatWeekdayDayMonth(iso: string, t: Translator['t']): string {
  const c = parseCalendarDay(iso);
  if (!c) return iso;
  return t('friends.format.weekdayDayMonth', {
    weekday: weekdayShort(c.weekday, t),
    dayMonth: formatDayMonth(iso, t),
  });
}

/** 0 → `Monday`. */
export function weekdayFull(dayOfWeek: number, t: Translator['t']): string {
  const key = WEEKDAY_KEYS[dayOfWeek];
  return key ? t(`common.weekdays.${key}`) : '';
}

/** 0 → `Mon`. */
export function weekdayShort(dayOfWeek: number, t: Translator['t']): string {
  const key = WEEKDAY_KEYS[dayOfWeek];
  return key ? t(`common.weekdaysShort.${key}`) : '';
}

/** `lunch` as it reads mid-sentence (`Add to Tue lunch`). */
export function mealTypeLabel(type: string, t: Translator['t']): string {
  const lower = type.toLowerCase();
  switch (lower) {
    case 'breakfast':
      return t('friends.meal.breakfast');
    case 'lunch':
      return t('friends.meal.lunch');
    case 'dinner':
      return t('friends.meal.dinner');
    case 'snack':
      return t('friends.meal.snack');
    default:
      return lower;
  }
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
