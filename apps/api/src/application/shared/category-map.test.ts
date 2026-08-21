import { describe, expect, it } from 'vitest';
import { inferCategory } from './category-map.js';

describe('inferCategory', () => {
  it('categorises plain ingredients', () => {
    expect(inferCategory('Chicken breast')).toBe('proteins');
    expect(inferCategory('Whole milk')).toBe('dairy');
    expect(inferCategory('Basmati rice')).toBe('grains');
    expect(inferCategory('Cherry tomato')).toBe('produce');
  });

  it('matches whole words, not substrings — the pepperoni bug', () => {
    // The old .includes() matching sent "pepperoni" to produce via "pepper".
    expect(inferCategory('Pepperoni')).toBe('proteins');
    expect(inferCategory('Bell pepper')).toBe('produce');
    // "peppercorn" contains "pepper" as a substring but not as a word.
    expect(inferCategory('Black peppercorn')).toBe('other');
  });

  it('does not send coconut to the nut aisle', () => {
    // Longest keyword wins: "coconut" (pantry) beats "milk" — canned coconut
    // milk lives in the pantry aisle, not the dairy fridge.
    expect(inferCategory('Coconut milk')).toBe('grains');
    expect(inferCategory('Coconut flakes')).toBe('grains');
    expect(inferCategory('Mixed nuts')).toBe('grains');
  });

  it('tolerates simple plurals', () => {
    expect(inferCategory('Carrots')).toBe('produce');
    expect(inferCategory('Eggs')).toBe('proteins');
  });

  it('is case-insensitive and falls back to other', () => {
    expect(inferCategory('SALMON FILLET')).toBe('proteins');
    expect(inferCategory('Xanthan gum')).toBe('other');
  });
});
