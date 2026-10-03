import { describe, expect, it } from 'vitest';
import {
  checkMacroSanity,
  clampIngredientGrams,
  formatQuickAddGrams,
  maxIngredientGrams,
  parseQuickAdd,
} from './quick-add';

describe('parseQuickAdd', () => {
  it('accepts name + kcal, defaulting macros to 0', () => {
    expect(parseQuickAdd({ name: '  Birthday cake ', mealType: 'snack', kcal: '350' })).toEqual({
      ok: true,
      entry: { name: 'Birthday cake', mealType: 'snack', kcal: 350, protein: 0, carbs: 0, fat: 0 },
    });
  });

  it('rounds kcal to a whole number and macros to 0.1 g, accepting a comma decimal', () => {
    const parsed = parseQuickAdd({
      name: 'Wrap',
      mealType: 'lunch',
      kcal: '412.6',
      protein: '22,34',
      carbs: '40',
      fat: '9.96',
    });
    expect(parsed).toEqual({
      ok: true,
      entry: { name: 'Wrap', mealType: 'lunch', kcal: 413, protein: 22.3, carbs: 40, fat: 10 },
    });
  });

  it('requires a name and positive calories', () => {
    expect(parseQuickAdd({ name: ' ', mealType: 'snack', kcal: '' })).toEqual({
      ok: false,
      errors: { name: 'Name what you ate.', kcal: 'Enter the calories.' },
    });
    expect(parseQuickAdd({ name: 'Tea', mealType: 'snack', kcal: '0' })).toEqual({
      ok: false,
      errors: { kcal: 'Calories must be above 0.' },
    });
  });

  it('mirrors the API bounds', () => {
    const parsed = parseQuickAdd({
      name: 'x'.repeat(201),
      mealType: 'dinner',
      kcal: '5001',
      protein: '501',
      carbs: '1001',
      fat: '501',
    });
    expect(parsed).toEqual({
      ok: false,
      errors: {
        name: 'Keep it under 200 characters.',
        kcal: 'Max 5000 kcal.',
        protein: 'Max 500 g.',
        carbs: 'Max 1000 g.',
        fat: 'Max 500 g.',
      },
    });
  });

  it('rejects negatives and exponent notation', () => {
    expect(parseQuickAdd({ name: 'A', mealType: 'snack', kcal: '-5', fat: '1e3' })).toEqual({
      ok: false,
      errors: { kcal: 'Use a plain number.', fat: 'Use a plain number.' },
    });
  });
});

// Bug B-39 (T-19.5): the 4/4/9 macro sanity check.
describe('checkMacroSanity', () => {
  it('passes a real meal whose macros roughly match its calories', () => {
    // 30p + 40c + 15f -> 30*4 + 40*4 + 15*9 = 415, within 25% of 400
    const result = checkMacroSanity({ kcal: 400, protein: 30, carbs: 40, fat: 15 });
    expect(result.ok).toBe(true);
    expect(result.message).toBeNull();
  });

  it('flags a meal where 100 kcal is claimed but the macros add up to much more', () => {
    // 50p + 50c + 50f -> 50*4 + 50*4 + 50*9 = 850 kcal implied, vs 100 stated
    const result = checkMacroSanity({ kcal: 100, protein: 50, carbs: 50, fat: 50 });
    expect(result.ok).toBe(false);
    expect(result.impliedKcal).toBe(850);
    expect(result.message).toContain("These don't add up");
    expect(result.message).toContain('100 kcal logged');
    expect(result.message).toContain('850 kcal');
  });

  it('never flags a calories-only entry (no macros to disagree)', () => {
    expect(checkMacroSanity({ kcal: 350, protein: 0, carbs: 0, fat: 0 }).ok).toBe(true);
  });

  it('skips tiny stated calories to avoid false positives', () => {
    expect(checkMacroSanity({ kcal: 10, protein: 0, carbs: 0, fat: 5 }).ok).toBe(true);
  });

  it('tolerates a modest mismatch within 25%', () => {
    // implied = 400*4? no: 60p+... let's pick numbers that land just inside 25%
    // stated 500, implied via 50p(200) + 30c(120) + 20f(180) = 500 exactly
    expect(checkMacroSanity({ kcal: 500, protein: 50, carbs: 30, fat: 20 }).ok).toBe(true);
    // stated 400, implied 500 -> diff 25% exactly, still ok (<=)
    expect(checkMacroSanity({ kcal: 400, protein: 50, carbs: 30, fat: 20 }).ok).toBe(true);
  });
});

describe('formatQuickAddGrams', () => {
  it('shows one decimal below 10 g', () => {
    expect(formatQuickAddGrams(7.5)).toBe('7.5');
    expect(formatQuickAddGrams(0.4)).toBe('0.4');
  });

  it('rounds to whole grams at or above 10 g', () => {
    expect(formatQuickAddGrams(10)).toBe('10');
    expect(formatQuickAddGrams(23.6)).toBe('24');
  });
});

describe('ingredient grams (UX-FOOD-09)', () => {
  const banana = { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 };

  it('keeps a log entry within the server limits', () => {
    // kcal alone would allow 5,617 g, but carbs (1000 g max / 23 per 100 g) stop at 4,347 g.
    expect(maxIngredientGrams(banana)).toBe(4347);
    expect(maxIngredientGrams({ calories: 10, protein: 0, carbs: 0, fat: 0 })).toBe(5000);
    // Olive oil: 884 kcal / 100 g -> 565 g is the most one entry can hold.
    expect(maxIngredientGrams({ calories: 884, protein: 0, carbs: 0, fat: 100 })).toBe(500);
  });

  it('clamps 99,999 g of banana instead of previewing 88,999 kcal', () => {
    expect(clampIngredientGrams('99999', banana)).toEqual({
      grams: 4347,
      clamped: true,
      max: 4347,
    });
  });

  it('parses commas and junk, and never goes negative', () => {
    expect(clampIngredientGrams('7,5', banana)).toMatchObject({ grams: 8, clamped: false });
    expect(clampIngredientGrams('abc', banana).grams).toBe(0);
    expect(clampIngredientGrams('-20', banana).grams).toBe(0);
  });
});
