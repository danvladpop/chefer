import { describe, expect, it } from 'vitest';
import { roundNutritionFacts } from './rounding';

describe('roundNutritionFacts (§5.4)', () => {
  it('kcal to an integer, macros to one decimal, halves up', () => {
    expect(
      roundNutritionFacts({ calories: 299.5, protein: 1.05, carbs: 2.25, fat: 0.04, fiber: 3.96 }),
    ).toEqual({ calories: 300, protein: 1.1, carbs: 2.3, fat: 0, fiber: 4 });
  });

  it('never returns -0', () => {
    const r = roundNutritionFacts({ calories: -0.2, protein: -0.01, carbs: 0, fat: 0, fiber: 0 });
    expect(Object.is(r.calories, -0)).toBe(false);
    expect(Object.is(r.protein, -0)).toBe(false);
  });
});
