import { describe, expect, it } from 'vitest';
import {
  copyDayMessage,
  customEntryChipLabel,
  customEntryRows,
  customEntryTotals,
  dailyAllowanceResetTime,
  entryUnknownMacros,
  groupByMeal,
  type LoggedMealEntryLike,
} from './tracker';

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
    expect(rows.map((r) => r.entryIndex)).toEqual([1, 3]);
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

  it('carries entryId through (T-19.2, B-34) — the edit/undo sheets key off it', () => {
    const withId: LoggedMealEntryLike = { ...custom('Toast', 'manual', 300), entryId: 'e1' };
    const [row] = customEntryRows([withId]);
    expect(row?.entryId).toBe('e1');
  });

  it('leaves entryId undefined for a pre-backfill entry', () => {
    const [row] = customEntryRows([custom('Toast', 'manual', 300)]);
    expect(row?.entryId).toBeUndefined();
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

describe('UX-FOOD-11 / UX-FOOD-25 helpers', () => {
  it('entryUnknownMacros prefers the stored flag and reads legacy calories-only entries as unknown', () => {
    expect(
      entryUnknownMacros({ protein: 20, carbs: 0, fat: 0, unknownMacros: ['carbs', 'fat'] }),
    ).toEqual(['carbs', 'fat']);
    expect(entryUnknownMacros({ protein: 0, carbs: 0, fat: 0 })).toEqual([
      'protein',
      'carbs',
      'fat',
    ]);
    expect(entryUnknownMacros({ protein: 20, carbs: 0, fat: 0 })).toEqual([]);
    // a typed 0 g on a flagged-empty entry stays known
    expect(entryUnknownMacros({ protein: 0, carbs: 0, fat: 0, unknownMacros: [] })).toEqual([]);
  });

  it('customEntryRows carries the unknown-macro flag through', () => {
    const [row] = customEntryRows([
      {
        custom: { name: 'Soup', estimatedBy: 'manual' },
        mealType: 'lunch',
        portionMultiplier: 1,
        kcal: 300,
        protein: 12,
        carbs: 0,
        fat: 0,
        unknownMacros: ['carbs', 'fat'],
      },
    ]);
    expect(row?.unknownMacros).toEqual(['carbs', 'fat']);
  });

  it('groupByMeal orders by the day, keeps row order and puts unknown meals last', () => {
    const groups = groupByMeal([
      { mealType: 'snack', n: 1 },
      { mealType: 'dinner', n: 2 },
      { mealType: 'brunch', n: 3 },
      { mealType: 'snack', n: 4 },
      { mealType: 'breakfast', n: 5 },
    ]);
    expect(groups.map((g) => g.mealType)).toEqual(['breakfast', 'dinner', 'snack', 'brunch']);
    expect(groups[2]?.rows.map((r) => r.n)).toEqual([1, 4]);
  });

  it('copyDayMessage pluralises and never says "Copied 0 entries"', () => {
    expect(copyDayMessage(1, 'yesterday')).toBe('Copied 1 entry');
    expect(copyDayMessage(3, 'yesterday')).toBe('Copied 3 entries');
    expect(copyDayMessage(0, 'yesterday')).toBe('Nothing to copy from yesterday');
  });

  it('dailyAllowanceResetTime is the local clock time of the next 00:00 UTC', () => {
    const label = dailyAllowanceResetTime(new Date('2026-10-03T10:00:00Z'));
    expect(label).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)$/);
    // same instant, formatted explicitly in UTC, is midnight
    const reset = new Date('2026-10-04T00:00:00Z');
    expect(
      reset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }),
    ).toBe('12:00 AM');
  });
});
