// Short dates for the coaching copy ("2 Oct", "Wed 30 Sep"). Fixed English
// abbreviations (not Intl) so web and mobile read the same and "Sept" never
// appears. `YYYY-MM-DD` strings are device-local calendar dates and are parsed
// without a timezone shift; anything else is an ISO date-time shown in the
// viewer's local time.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value: string): Date | null {
  const m = LOCAL_DATE.exec(value);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 0 = Monday, matching `RoutineDay.plannedWeekday`. */
function mondayFirst(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** "2 Oct". */
export function formatShortDay(value: string): string {
  const date = toDate(value);
  return date ? `${date.getDate()} ${MONTHS[date.getMonth()]}` : value;
}

/** "Wed 30 Sep". */
export function formatDayWithWeekday(value: string): string {
  const date = toDate(value);
  return date
    ? `${WEEKDAYS_MON_FIRST[mondayFirst(date)]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
    : value;
}

/** "Tue" for a planned weekday index (0 = Monday, as `RoutineDay.plannedWeekday`). */
export function weekdayName(index: number): string {
  return WEEKDAYS_MON_FIRST[((index % 7) + 7) % 7] ?? '';
}

/** Weekday index (0 = Monday) of a `YYYY-MM-DD` date, or null when it does not parse. */
export function weekdayIndexOf(value: string): number | null {
  const date = toDate(value);
  return date ? mondayFirst(date) : null;
}
