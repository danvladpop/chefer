/**
 * Asserts that a condition is truthy, throwing an error with the given message if not.
 * This is a type guard that narrows the type of `condition` to `true`.
 *
 * @example
 * invariant(user !== null, 'User must not be null');
 * // After this line, TypeScript knows user is not null
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new InvariantError(message);
  }
}

/**
 * Asserts that a value is non-null and non-undefined.
 *
 * @example
 * const user = assertDefined(getUser(), 'User not found');
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  invariant(value !== null && value !== undefined, message);
}

/**
 * Asserts that a value is a string.
 */
export function assertString(value: unknown, message: string): asserts value is string {
  invariant(typeof value === 'string', message);
}

/**
 * Asserts that a value is a number.
 */
export function assertNumber(value: unknown, message: string): asserts value is number {
  invariant(typeof value === 'number' && !Number.isNaN(value), message);
}

/**
 * Asserts that a value is a boolean.
 */
export function assertBoolean(value: unknown, message: string): asserts value is boolean {
  invariant(typeof value === 'boolean', message);
}

/**
 * Type guard that checks if a value is non-null and non-undefined.
 * Useful for array filters: `items.filter(isDefined)`
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Exhaustive type checking helper. Use in switch statement default cases
 * to ensure all enum values are handled.
 *
 * @example
 * switch (role) {
 *   case 'ADMIN': return 'admin';
 *   case 'USER': return 'user';
 *   default: return assertNever(role);
 * }
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

/**
 * Custom error class for invariant violations.
 */
export class InvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantError';
  }
}

/**
 * A safe version of invariant that returns a Result type instead of throwing.
 */
export function safeInvariant(
  condition: unknown,
  message: string,
): { ok: true } | { ok: false; error: string } {
  if (!condition) {
    return { ok: false, error: message };
  }
  return { ok: true };
}
