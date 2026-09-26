import { describe, expect, it } from 'vitest';
import {
  choosePortions,
  formatPortion,
  isDayOnTarget,
  proteinGapG,
  scaleNutrition,
  slotPortion,
  type PortionMeal,
} from './meal-portion';

// A typical curated day: breakfast, lunch, dinner (1,600 kcal / 95 g at 1×).
const DAY: PortionMeal[] = [
  { kcal: 400, protein: 20 },
  { kcal: 550, protein: 35 },
  { kcal: 650, protein: 40 },
];

const within = (kcal: number, target: number) => Math.abs(kcal - target) / target <= 0.1;

describe('choosePortions (audit P1-1)', () => {
  describe.each([1600, 2000, 2800, 3200])('%i kcal', (calories) => {
    it.each([90, 140, 175])('lands kcal within ±10%% at %i g protein', (proteinG) => {
      const plan = choosePortions(DAY, { calories, proteinG });
      expect(plan.portions).toHaveLength(3);
      expect(within(plan.kcal, calories)).toBe(true);
      expect(plan.kcalOnTarget).toBe(true);
      for (const p of plan.portions) {
        expect(p).toBeGreaterThanOrEqual(0.75);
        expect(p).toBeLessThanOrEqual(2);
        expect((p * 4) % 1).toBe(0); // quarter steps
      }
    });
  });

  it('meets a modest protein target with room to spare', () => {
    const plan = choosePortions(DAY, { calories: 2000, proteinG: 90 });
    expect(plan.protein).toBeGreaterThanOrEqual(90);
    expect(plan.proteinGapG).toBeNull();
  });

  it('pushes protein as high as the calorie band allows', () => {
    const plan = choosePortions(DAY, { calories: 2000, proteinG: 140 });
    // 1× is 95 g; the best in-band mix upsizes the protein-dense lunch and
    // dinner and trims breakfast.
    expect(plan.protein).toBeGreaterThan(120);
    expect(plan.portions[0]).toBeLessThanOrEqual(plan.portions[2] ?? 0);
  });

  it('reports an honest gap when the target is out of reach', () => {
    const plan = choosePortions(DAY, { calories: 2000, proteinG: 175 });
    expect(plan.kcalOnTarget).toBe(true); // never breaks calories for protein
    expect(plan.proteinGapG).not.toBeNull();
    expect(plan.proteinGapG).toBe(Math.round(175 - plan.protein));
  });

  it('closes a high-calorie, high-protein gain day', () => {
    const plan = choosePortions(DAY, { calories: 3200, proteinG: 175 });
    expect(within(plan.kcal, 3200)).toBe(true);
    expect(plan.protein).toBeGreaterThanOrEqual(175 * 0.9);
    expect(plan.proteinGapG).toBeNull();
  });

  it('upsizes the most protein-dense meal first when protein is short', () => {
    const meals: PortionMeal[] = [
      { kcal: 500, protein: 10 }, // pastry-ish
      { kcal: 500, protein: 60 }, // chicken — 12 g / 100 kcal
      { kcal: 500, protein: 20 },
    ];
    const plan = choosePortions(meals, { calories: 1800, proteinG: 150 });
    expect(plan.portions[1]).toBe(Math.max(...plan.portions));
    expect(plan.portions[1]).toBeGreaterThan(1);
    expect(plan.portions[0]).toBe(Math.min(...plan.portions));
  });

  it('leaves a day alone when it is already on target', () => {
    const plan = choosePortions(DAY, { calories: 1600, proteinG: 90 });
    expect(plan.portions).toEqual([1, 1, 1]);
  });

  it('trims portions for a small target', () => {
    const plan = choosePortions(DAY, { calories: 1300, proteinG: 80 });
    expect(within(plan.kcal, 1300)).toBe(true);
    expect(plan.portions.some((p) => p < 1)).toBe(true);
  });

  it('gets as close as it can when even 2× cannot reach the target', () => {
    const plan = choosePortions(DAY, { calories: 4500, proteinG: 200 });
    expect(plan.portions).toEqual([2, 2, 2]);
    expect(plan.kcalOnTarget).toBe(false);
  });

  it('handles snacks (four and five slots)', () => {
    const plan = choosePortions([...DAY, { kcal: 200, protein: 15 }, { kcal: 250, protein: 20 }], {
      calories: 2800,
      proteinG: 175,
    });
    expect(plan.portions).toHaveLength(5);
    expect(within(plan.kcal, 2800)).toBe(true);
  });

  it('is deterministic', () => {
    const a = choosePortions(DAY, { calories: 2724, proteinG: 136 });
    const b = choosePortions(DAY, { calories: 2724, proteinG: 136 });
    expect(a).toEqual(b);
  });

  it('degrades safely for empty and very long days', () => {
    expect(choosePortions([], { calories: 2000, proteinG: 100 }).portions).toEqual([]);
    const many = Array.from({ length: 7 }, () => ({ kcal: 300, protein: 15 }));
    expect(choosePortions(many, { calories: 2000, proteinG: 100 }).portions).toEqual(
      many.map(() => 1),
    );
  });
});

describe('portion helpers', () => {
  it('formats multipliers', () => {
    expect(formatPortion(0.75)).toBe('¾×');
    expect(formatPortion(1)).toBe('1×');
    expect(formatPortion(1.25)).toBe('1¼×');
    expect(formatPortion(1.5)).toBe('1½×');
    expect(formatPortion(1.75)).toBe('1¾×');
    expect(formatPortion(2)).toBe('2×');
    expect(formatPortion(1.3)).toBe('1.3×');
  });

  it('treats missing or invalid portions as 1×', () => {
    expect(slotPortion(undefined)).toBe(1);
    expect(slotPortion(null)).toBe(1);
    expect(slotPortion(0)).toBe(1);
    expect(slotPortion(-2)).toBe(1);
    expect(slotPortion(Number.NaN)).toBe(1);
    expect(slotPortion(50)).toBe(1);
    expect(slotPortion(1.5)).toBe(1.5);
  });

  it('scales nutrition', () => {
    const n = { calories: 401, protein: 21.3, carbs: 40, fat: 10, fiber: 5 };
    expect(scaleNutrition(n, 1)).toBe(n);
    expect(scaleNutrition(n, 1.5)).toEqual({
      calories: 602,
      protein: 32,
      carbs: 60,
      fat: 15,
      fiber: 7.5,
    });
  });

  it('only flags a meaningful protein gap', () => {
    expect(proteinGapG(100, 175)).toBe(75);
    expect(proteinGapG(160, 175)).toBeNull(); // within 10%
    expect(proteinGapG(52, 60)).toBeNull(); // 8 g < 10 g floor
    expect(proteinGapG(100, 0)).toBeNull();
    expect(proteinGapG(100, null)).toBeNull();
  });

  it('judges a day on target only when both kcal and protein hold', () => {
    expect(isDayOnTarget({ kcal: 1950, protein: 130 }, { calories: 2000, proteinG: 140 })).toBe(
      true,
    );
    expect(isDayOnTarget({ kcal: 1950, protein: 90 }, { calories: 2000, proteinG: 175 })).toBe(
      false,
    );
    expect(isDayOnTarget({ kcal: 1500, protein: 140 }, { calories: 2000, proteinG: 140 })).toBe(
      false,
    );
    expect(isDayOnTarget({ kcal: 2000, protein: 50 }, { calories: 2000 })).toBe(true);
  });
});
