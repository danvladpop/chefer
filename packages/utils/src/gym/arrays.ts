// Tiny array helpers for the engine (noUncheckedIndexedAccess-friendly).

/** `arr[i]`, or `fallback` when out of range. */
export function at(arr: readonly number[], i: number, fallback: number): number {
  return arr[i] ?? fallback;
}

/** Last element, or `fallback` for an empty array. */
export function lastOr(arr: readonly number[], fallback: number): number {
  return arr[arr.length - 1] ?? fallback;
}

/** `n` copies of `value`. */
export function all(n: number, value: number): number[] {
  return Array.from({ length: Math.max(0, n) }, () => value);
}
