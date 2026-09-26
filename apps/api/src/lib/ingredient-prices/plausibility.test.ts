import { describe, expect, it } from 'vitest';
import { kcalFromMacros, macrosAreConsistent } from './index.js';

const r = (kcal: number | null, p: number | null, c: number | null, f: number | null) => ({
  caloriesPer100g: kcal,
  proteinPer100g: p,
  carbsPer100g: c,
  fatPer100g: f,
});

describe('macro plausibility', () => {
  it('computes 4/4/9 calories', () => {
    expect(kcalFromMacros(r(null, 10, 10, 10))).toBe(170);
    expect(kcalFromMacros(r(null, 10, null, 10))).toBeNull();
  });
  it('accepts consistent rows, including near-zero foods', () => {
    expect(macrosAreConsistent(r(884, 0, 0, 100))).toBe(true); // olive oil
    expect(macrosAreConsistent(r(0, 0, 0, 0))).toBe(true); // water
    expect(macrosAreConsistent(r(165, 31, 0, 3.6))).toBe(true); // chicken breast
  });
  it('rejects the mock signature and missing macros', () => {
    expect(macrosAreConsistent(r(287, 4, 27, 3))).toBe(false); // mock "water"
    expect(macrosAreConsistent(r(200, null, 10, 5))).toBe(false);
  });
});
