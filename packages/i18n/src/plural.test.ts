import { describe, expect, it } from 'vitest';
import { pluralCategory } from './plural';

describe('pluralCategory', () => {
  it('English: one for exactly 1, other otherwise', () => {
    expect(pluralCategory('en', 1)).toBe('one');
    for (const n of [0, 2, 5, 21, 1.5, 100]) expect(pluralCategory('en', n)).toBe('other');
  });

  it('Romanian: one / few / other per CLDR', () => {
    expect(pluralCategory('ro', 1)).toBe('one');
    // few: 0, fractions, and 1–19 past a hundred
    for (const n of [0, 2, 5, 19, 101, 102, 119, 1.5, 0.5]) {
      expect(pluralCategory('ro', n)).toBe('few');
    }
    // other: 20–99 past a hundred, whole hundreds ("20 de rețete")
    for (const n of [20, 21, 45, 99, 100, 120, 1000]) {
      expect(pluralCategory('ro', n)).toBe('other');
    }
  });

  it('ignores the sign', () => {
    expect(pluralCategory('ro', -1)).toBe('one');
    expect(pluralCategory('ro', -20)).toBe('other');
  });
});
