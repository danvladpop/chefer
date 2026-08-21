import { describe, expect, it } from 'vitest';
import { groupBy, omit, pick, removeNullish } from './object';

describe('pick', () => {
  it('keeps only the requested keys', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('ignores keys missing from the source', () => {
    const source: Record<string, number> = { a: 1 };
    expect(pick(source, ['a', 'b'])).toEqual({ a: 1 });
  });
});

describe('omit', () => {
  it('removes the requested keys without mutating the source', () => {
    const source = { a: 1, b: 2, c: 3 };
    expect(omit(source, ['b'])).toEqual({ a: 1, c: 3 });
    expect(source).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('removeNullish', () => {
  it('drops undefined and null values but keeps falsy ones', () => {
    expect(removeNullish({ a: undefined, b: null, c: 0, d: '', e: false })).toEqual({
      c: 0,
      d: '',
      e: false,
    });
  });

  it('drops explicitly-undefined optional props (the Prisma input case)', () => {
    // Callers build inputs from zod-parsed data where absent fields are
    // explicit `undefined`; those keys must not reach Prisma under
    // exactOptionalPropertyTypes.
    const input: { name?: string | undefined; role?: string | undefined } = {
      name: undefined,
      role: 'ADMIN',
    };
    const cleaned = removeNullish(input);
    expect('name' in cleaned).toBe(false);
    expect(cleaned.role).toBe('ADMIN');
  });
});

describe('groupBy', () => {
  it('groups items by the given key', () => {
    const items = [
      { type: 'a', val: 1 },
      { type: 'b', val: 2 },
      { type: 'a', val: 3 },
    ];
    expect(groupBy(items, 'type')).toEqual({
      a: [
        { type: 'a', val: 1 },
        { type: 'a', val: 3 },
      ],
      b: [{ type: 'b', val: 2 }],
    });
  });

  it('returns an empty object for an empty list', () => {
    expect(groupBy([], 'anything')).toEqual({});
  });
});
