import { describe, expect, it } from 'vitest';
import {
  formatMacroLine,
  mealGroupTotalLine,
  planMealMacroLine,
  planMealMacros,
  planMealMetaLine,
} from './plan-meal-macros';

const nutrition = { calories: 458, protein: 21.4, carbs: 40, fat: 12 };

describe('planMealMacros', () => {
  it('scales one serving by the slot portion and rounds', () => {
    expect(planMealMacros(nutrition)).toEqual({ kcal: 458, protein: 21, carbs: 40, fat: 12 });
    expect(planMealMacros(nutrition, 1.5)).toEqual({ kcal: 687, protein: 32, carbs: 60, fat: 18 });
  });

  it('missing macros count as 0 and a nonsense portion means 1×', () => {
    expect(planMealMacros({ calories: 100 }, 0)).toEqual({
      kcal: 100,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});

describe('plan card lines (FB7-11)', () => {
  it('the macro line reads "P 32 g · C 60 g · F 18 g" at the slot portion', () => {
    expect(planMealMacroLine(nutrition, 1.5, false)).toBe('P 32 g · C 60 g · F 18 g');
    expect(formatMacroLine({ protein: 1, carbs: 2, fat: 3 })).toBe('P 1 g · C 2 g · F 3 g');
  });

  it('protein-only mode has no macro line (the meta line carries the protein)', () => {
    expect(planMealMacroLine(nutrition, 1, true)).toBeNull();
  });

  it('the meta line is "10 min · 687 kcal", or protein in protein-only mode', () => {
    expect(planMealMetaLine(10, nutrition, 1.5, false)).toBe('10 min · 687 kcal');
    expect(planMealMetaLine(10, nutrition, 1.5, true)).toBe('10 min · 32 g protein');
  });
});

describe('mealGroupTotalLine (FB7-04)', () => {
  const slots = [
    { recipe: { nutritionInfo: { calories: 400, protein: 30, carbs: 20, fat: 10 } } },
    { portion: 2, recipe: { nutritionInfo: { calories: 150, protein: 3, carbs: 30, fat: 1 } } },
  ];
  it('sums main and side at their portions', () => {
    expect(mealGroupTotalLine(slots, false)).toBe('700 kcal · P 36 g · C 80 g · F 12 g');
  });
  it('protein-only mode shows protein only', () => {
    expect(mealGroupTotalLine(slots, true)).toBe('36 g protein');
  });
});
