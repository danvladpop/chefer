import type { Translator } from '@chefer/i18n';

// Coaching dates ("2 Oct", "Wed 30 Sep") come from the one shared formatter in
// `@chefer/utils`, so web and mobile read the same and "Sept" never appears.
// The `…T` variants say the same in the UI language, through the fixed
// `common` month and weekday tables (no Intl: ICU versions disagree).
export { formatDayWithWeekday, formatShortDay, weekdayIndexOf, weekdayName } from '@chefer/utils';

type T = Translator['t'];

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

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` is a device-local calendar day (no shift); anything else an ISO date-time. */
function toDate(value: string): Date | null {
  const m = LOCAL_DATE.exec(value);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Tue" / "mar." for a weekday index (0 = Monday, as `RoutineDay.plannedWeekday`). */
export function weekdayNameT(index: number, t: T): string {
  const key = WEEKDAY_KEYS[((index % 7) + 7) % 7] ?? 'mon';
  return t(`common.weekdaysShort.${key}`);
}

/** "Monday" / "luni" for a weekday index (0 = Monday). */
export function weekdayLongT(index: number, t: T): string {
  const key = WEEKDAY_KEYS[((index % 7) + 7) % 7] ?? 'sun';
  return t(`common.weekdays.${key}`);
}

/** "2 Oct" / "2 oct.". */
export function formatShortDayT(value: string, t: T): string {
  const date = toDate(value);
  if (!date) return value;
  const month = MONTH_KEYS[date.getMonth()] ?? 'jan';
  return t('coaching.format.dayMonth', {
    day: String(date.getDate()),
    month: t(`common.monthsShort.${month}`),
  });
}

/** "Wed 30 Sep" / "Mie 30 sept.". */
export function formatDayWithWeekdayT(value: string, t: T): string {
  const date = toDate(value);
  if (!date) return value;
  const month = MONTH_KEYS[date.getMonth()] ?? 'jan';
  return t('coaching.format.weekdayDayMonth', {
    weekday: weekdayNameT((date.getDay() + 6) % 7, t),
    day: String(date.getDate()),
    month: t(`common.monthsShort.${month}`),
  });
}
