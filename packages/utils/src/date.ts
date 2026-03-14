import {
  format,
  formatDistanceToNow,
  formatRelative,
  isValid,
  parseISO,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  addDays,
  addHours,
  startOfDay,
  endOfDay,
  isAfter,
  isBefore,
  isEqual,
} from 'date-fns';

export type DateInput = Date | string | number;

/**
 * Normalizes various date input types to a Date object.
 */
function toDate(date: DateInput): Date {
  if (date instanceof Date) {
    return date;
  }
  if (typeof date === 'string') {
    return parseISO(date);
  }
  return new Date(date);
}

/**
 * Formats a date with a given format string.
 * @default 'MMM dd, yyyy'
 */
export function formatDate(date: DateInput, formatStr = 'MMM dd, yyyy'): string {
  const d = toDate(date);
  if (!isValid(d)) {
    return 'Invalid date';
  }
  return format(d, formatStr);
}

/**
 * Formats a date as a relative time string (e.g., "2 hours ago").
 */
export function formatRelativeTime(date: DateInput): string {
  const d = toDate(date);
  if (!isValid(d)) {
    return 'Invalid date';
  }
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Formats a date relative to a base date.
 */
export function formatRelativeTo(date: DateInput, baseDate: DateInput = new Date()): string {
  const d = toDate(date);
  const base = toDate(baseDate);
  if (!isValid(d) || !isValid(base)) {
    return 'Invalid date';
  }
  return formatRelative(d, base);
}

/**
 * Formats a date as ISO string for API consumption.
 */
export function formatIso(date: DateInput): string {
  return toDate(date).toISOString();
}

/**
 * Formats a date for display in a datetime-local input.
 */
export function formatForInput(date: DateInput): string {
  return formatDate(date, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Returns the number of days between two dates.
 */
export function daysBetween(dateLeft: DateInput, dateRight: DateInput): number {
  return differenceInDays(toDate(dateLeft), toDate(dateRight));
}

/**
 * Returns the number of hours between two dates.
 */
export function hoursBetween(dateLeft: DateInput, dateRight: DateInput): number {
  return differenceInHours(toDate(dateLeft), toDate(dateRight));
}

/**
 * Returns the number of minutes between two dates.
 */
export function minutesBetween(dateLeft: DateInput, dateRight: DateInput): number {
  return differenceInMinutes(toDate(dateLeft), toDate(dateRight));
}

/**
 * Checks if a date is valid.
 */
export function isValidDate(date: DateInput): boolean {
  return isValid(toDate(date));
}

/**
 * Returns the start of the day for a given date.
 */
export function getStartOfDay(date: DateInput = new Date()): Date {
  return startOfDay(toDate(date));
}

/**
 * Returns the end of the day for a given date.
 */
export function getEndOfDay(date: DateInput = new Date()): Date {
  return endOfDay(toDate(date));
}

/**
 * Adds days to a date.
 */
export function addDaysToDate(date: DateInput, days: number): Date {
  return addDays(toDate(date), days);
}

/**
 * Adds hours to a date.
 */
export function addHoursToDate(date: DateInput, hours: number): Date {
  return addHours(toDate(date), hours);
}

/**
 * Checks if dateLeft is after dateRight.
 */
export function isDateAfter(dateLeft: DateInput, dateRight: DateInput): boolean {
  return isAfter(toDate(dateLeft), toDate(dateRight));
}

/**
 * Checks if dateLeft is before dateRight.
 */
export function isDateBefore(dateLeft: DateInput, dateRight: DateInput): boolean {
  return isBefore(toDate(dateLeft), toDate(dateRight));
}

/**
 * Checks if two dates are equal.
 */
export function isDateEqual(dateLeft: DateInput, dateRight: DateInput): boolean {
  return isEqual(toDate(dateLeft), toDate(dateRight));
}

/**
 * Checks if a date is in the past.
 */
export function isPast(date: DateInput): boolean {
  return isBefore(toDate(date), new Date());
}

/**
 * Checks if a date is in the future.
 */
export function isFuture(date: DateInput): boolean {
  return isAfter(toDate(date), new Date());
}
