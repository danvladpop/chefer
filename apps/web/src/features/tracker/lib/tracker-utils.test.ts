import { describe, expect, it } from 'vitest';
import {
  customEntryChipLabel,
  customEntryRows,
  customEntryTotals,
  type LoggedMealEntryLike,
} from './tracker-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const planned = (recipeId: string, kcal: number): LoggedMealEntryLike => ({
  recipeId,
  mealType: 'lunch',
  portionMultiplier: 1,
  kcal,
  protein: 20,
  carbs: 30,
  fat: 10,
});

const custom = (
  name: string,
  estimatedBy: 'vision' | 'manual',
  kcal: number,
): LoggedMealEntryLike => ({
  custom: { name, estimatedBy },
  mealType: 'snack',
  portionMultiplier: 1,
  kcal,
  protein: 5,
  carbs: 10,
  fat: 3,
});

describe('customEntryRows (F4 custom-entry rendering)', () => {
  it('returns only custom entries, skipping planned recipes', () => {
    const rows = customEntryRows([
      planned('r1', 600),
      custom('Street tacos', 'vision', 450),
      planned('r2', 500),
      custom('Espresso + croissant', 'manual', 280),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Street tacos', 'Espresso + croissant']);
  });

  it('preserves the entry index into the FULL array — deletion depends on it', () => {
    const rows = customEntryRows([
      planned('r1', 600),
      custom('Street tacos', 'vision', 450),
      planned('r2', 500),
      custom('Espresso + croissant', 'manual', 280),
    ]);
    expect(rows[0]!.entryIndex).toBe(1);
    expect(rows[1]!.entryIndex).toBe(3);
  });

  it('carries the estimate provenance and macros through', () => {
    const [row] = customEntryRows([custom('Poke bowl', 'vision', 520)]);
    expect(row).toMatchObject({
      estimatedBy: 'vision',
      mealType: 'snack',
      kcal: 520,
      protein: 5,
      carbs: 10,
      fat: 3,
    });
  });

  it('returns an empty list for a day with only planned meals', () => {
    expect(customEntryRows([planned('r1', 600)])).toEqual([]);
  });
});

describe('customEntryChipLabel', () => {
  it('labels vision entries "estimated" and manual ones "quick add"', () => {
    expect(customEntryChipLabel('vision')).toBe('estimated');
    expect(customEntryChipLabel('manual')).toBe('quick add');
  });
});

describe('customEntryTotals', () => {
  it('sums only the custom entries (planned meals are counted by the page)', () => {
    const totals = customEntryTotals([
      planned('r1', 600),
      custom('Street tacos', 'vision', 450),
      custom('Espresso + croissant', 'manual', 280),
    ]);
    expect(totals).toEqual({ kcal: 730, protein: 10, carbs: 20, fat: 6 });
  });

  it('is zero for an empty day', () => {
    expect(customEntryTotals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});
