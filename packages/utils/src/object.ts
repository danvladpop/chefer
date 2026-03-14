/**
 * Creates a new object with only the specified keys from the source object.
 *
 * @example
 * pick({ a: 1, b: 2, c: 3 }, ['a', 'c']) // { a: 1, c: 3 }
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Creates a new object excluding the specified keys from the source object.
 *
 * @example
 * omit({ a: 1, b: 2, c: 3 }, ['b']) // { a: 1, c: 3 }
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/**
 * Deep clones an object using structured clone (available in Node 17+).
 */
export function deepClone<T>(obj: T): T {
  return structuredClone(obj);
}

/**
 * Checks if a value is a plain object (not null, array, Date, etc.).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Deep merges two objects. Arrays are replaced, not merged.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }

    const sourceVal = source[key];
    const targetVal = result[key];

    if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      ) as T[Extract<keyof T, string>];
    } else {
      result[key] = sourceVal as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Removes undefined and null values from an object (shallow).
 */
export function removeNullish<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]: NonNullable<T[K]> } {
  const result = {} as { [K in keyof T]: NonNullable<T[K]> };
  for (const key in obj) {
    if (obj[key] !== null && obj[key] !== undefined) {
      result[key] = obj[key] as NonNullable<T[typeof key]>;
    }
  }
  return result;
}

/**
 * Groups an array of objects by a key.
 *
 * @example
 * groupBy([{ type: 'a', val: 1 }, { type: 'b', val: 2 }, { type: 'a', val: 3 }], 'type')
 * // { a: [{ type: 'a', val: 1 }, { type: 'a', val: 3 }], b: [{ type: 'b', val: 2 }] }
 */
export function groupBy<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const groupKey = String(item[key]);
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(item);
    return acc;
  }, {});
}

/**
 * Creates an object keyed by a specific field from an array.
 *
 * @example
 * keyBy([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }], 'id')
 * // { '1': { id: '1', name: 'Alice' }, '2': { id: '2', name: 'Bob' } }
 */
export function keyBy<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
): Record<string, T> {
  return items.reduce<Record<string, T>>((acc, item) => {
    acc[String(item[key])] = item;
    return acc;
  }, {});
}

/**
 * Flattens a nested object into a single-level object with dot-notation keys.
 *
 * @example
 * flattenObject({ a: { b: { c: 1 } } }) // { 'a.b.c': 1 }
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      continue;
    }

    const newKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (isPlainObject(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
}
