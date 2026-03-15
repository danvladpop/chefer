export { cn } from './cn';

export {
  formatDate,
  formatRelativeTime,
  formatRelativeTo,
  formatIso,
  formatForInput,
  daysBetween,
  hoursBetween,
  minutesBetween,
  isValidDate,
  getStartOfDay,
  getEndOfDay,
  addDaysToDate,
  addHoursToDate,
  isDateAfter,
  isDateBefore,
  isDateEqual,
  isPast,
  isFuture,
  type DateInput,
} from './date';

export {
  pick,
  omit,
  deepClone,
  isPlainObject,
  deepMerge,
  removeNullish,
  groupBy,
  keyBy,
  flattenObject,
} from './object';

export {
  invariant,
  assertDefined,
  assertString,
  assertNumber,
  assertBoolean,
  isDefined,
  assertNever,
  InvariantError,
  safeInvariant,
} from './assert';

// ─── Async Utilities ──────────────────────────────────────────────────────────

/**
 * Returns a promise that resolves after `ms` milliseconds.
 *
 * @example
 * await sleep(1000); // Wait 1 second
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function up to `maxAttempts` times with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffFactor?: number;
    onError?: (error: unknown, attempt: number) => void;
  } = {},
): Promise<T> {
  const { maxAttempts = 3, delayMs = 100, backoffFactor = 2, onError } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      onError?.(error, attempt);

      if (attempt < maxAttempts) {
        await sleep(delayMs * Math.pow(backoffFactor, attempt - 1));
      }
    }
  }

  throw lastError;
}

// ─── String Utilities ─────────────────────────────────────────────────────────

/**
 * Converts a string to a URL-safe slug.
 *
 * @example
 * slugify('Hello World!') // 'hello-world'
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Capitalizes the first letter of a string.
 */
export function capitalize(str: string): string {
  if (str.length === 0) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Truncates a string to a maximum length, adding an ellipsis if truncated.
 */
export function truncate(str: string, maxLength: number, ellipsis = '...'): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}

// ─── Number Utilities ─────────────────────────────────────────────────────────

/**
 * Clamps a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generates a random integer between min and max (inclusive).
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Array Utilities ──────────────────────────────────────────────────────────

/**
 * Removes duplicate values from an array.
 */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Chunks an array into subarrays of the given size.
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Flattens a nested array one level deep.
 */
export function flatten<T>(arr: T[][]): T[] {
  return ([] as T[]).concat(...arr);
}

/**
 * Returns the last element of an array.
 */
export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

/**
 * Returns the first element of an array.
 */
export function first<T>(arr: T[]): T | undefined {
  return arr[0];
}
