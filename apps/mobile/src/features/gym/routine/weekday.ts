import type { Translator } from '@chefer/i18n';

// Weekday convention: 0 = Monday … 6 = Sunday (matches packages/types/gym/templates.ts).
export const WEEKDAY_SHORT_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const WEEKDAY_FULL_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** weekdayLabel() in the UI language: "Monday" / "luni", or "No fixed day". */
export function weekdayName(t: Translator['t'], weekday: number | null): string {
  const key = weekday === null ? undefined : WEEKDAY_KEYS[weekday];
  return key ? t(`common.weekdays.${key}`) : t('today.shell.training.noFixedDay');
}

export function weekdayLabel(weekday: number | null): string {
  if (weekday === null) return 'No fixed day';
  return WEEKDAY_FULL_LABELS[weekday] ?? 'No fixed day';
}
