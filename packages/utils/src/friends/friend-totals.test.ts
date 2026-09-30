import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sumPlanDay } from '../meal-portion';
import { dayTotals, slotTotals, weekAverageKcal } from './friend-totals';

const n = (calories: number, protein = 0, carbs = 0, fat = 0) => ({
  calories,
  protein,
  carbs,
  fat,
});

describe('slotTotals', () => {
  it('scales by the portion and rounds kcal and grams whole', () => {
    expect(slotTotals(n(420, 28.4, 45.5, 12.2), 1)).toEqual({
      kcal: 420,
      protein: 28,
      carbs: 46,
      fat: 12,
    });
    expect(slotTotals(n(333, 10, 10, 10), 1.5)).toEqual({
      kcal: 500,
      protein: 15,
      carbs: 15,
      fat: 15,
    });
  });

  it('treats missing macros as 0 and a missing portion as 1', () => {
    expect(slotTotals({ calories: 100 }, null)).toEqual({
      kcal: 100,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(slotTotals({}, undefined)).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe('dayTotals', () => {
  it('rounds once at the end, like sumPlanDay (not a sum of rounded slots)', () => {
    const slots = [1, 2, 3].map(() => ({ nutrition: n(1), portion: 0.5 }));
    expect(dayTotals(slots).kcal).toBe(2); // 1.5 → 2, where three rounded slots would give 3
  });

  it('equals sumPlanDay for any day', () => {
    const slot = fc.record({
      calories: fc.integer({ min: 0, max: 1500 }),
      protein: fc.double({ min: 0, max: 120, noNaN: true }),
      carbs: fc.double({ min: 0, max: 200, noNaN: true }),
      fat: fc.double({ min: 0, max: 100, noNaN: true }),
      portion: fc.constantFrom(0.5, 0.75, 1, 1.25, 1.5, 2, null, undefined),
    });
    fc.assert(
      fc.property(fc.array(slot, { maxLength: 6 }), (rows) => {
        const mine = dayTotals(
          rows.map((r) => ({
            nutrition: { calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat },
            portion: r.portion,
          })),
        );
        const theirs = sumPlanDay(
          rows.map((r) => ({
            portion: r.portion,
            recipe: {
              nutritionInfo: {
                calories: r.calories,
                protein: r.protein,
                carbs: r.carbs,
                fat: r.fat,
              },
            },
          })),
        );
        expect(mine).toEqual(theirs);
      }),
    );
  });

  it('is zero for an empty day', () => {
    expect(dayTotals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe('weekAverageKcal', () => {
  const day = (meals: number, kcal: number) => ({
    meals: Array.from({ length: meals }, () => ({})),
    totals: { kcal },
  });

  it('averages only the days that have meals', () => {
    expect(weekAverageKcal([day(3, 2000), day(0, 0), day(2, 2301), day(0, 0)])).toBe(2151);
  });

  it('is null when no day has a meal', () => {
    expect(weekAverageKcal([])).toBeNull();
    expect(weekAverageKcal([day(0, 0), day(0, 0)])).toBeNull();
  });
});
