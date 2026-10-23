import { describe, expect, it } from 'vitest';
import type { ParsedFoodItem } from '@chefer/types';
import { foodTextTotal, parsedItemAmount, parsedItemToLogItem } from './food-text';

const egg: ParsedFoodItem = {
  key: '0',
  text: '2 eggs',
  name: 'Egg',
  source: 'ingredient',
  unit: 'g',
  grams: 100,
  per100g: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 },
};
const shake: ParsedFoodItem = {
  key: '1',
  text: 'protein shake',
  name: 'Protein shake',
  source: 'recent',
  unit: 'serving',
  servings: 1,
  perServing: { kcal: 220, protein: 30, carbs: 10, fat: 4 },
};
const stew: ParsedFoodItem = {
  key: '2',
  text: 'stew',
  name: 'Stew',
  source: 'estimate',
  productId: undefined,
  unit: 'g',
  grams: 300,
  per100g: { kcal: 120, protein: null, carbs: 10, fat: 5 },
};

describe('typed food logging (lane A4)', () => {
  it('scales a gram item and names it with the amount', () => {
    expect(parsedItemAmount(egg)).toBe(100);
    expect(parsedItemToLogItem(egg, 150)).toEqual({
      name: 'Egg, 150 g',
      estimatedBy: 'manual',
      kcal: 215,
      protein: 18.9,
      carbs: 1,
      fat: 14.3,
    });
  });

  it('multiplies a recent by servings', () => {
    expect(parsedItemToLogItem(shake, 2)).toMatchObject({
      name: 'Protein shake ×2',
      kcal: 440,
      protein: 60,
    });
    expect(parsedItemToLogItem(shake, 1)?.name).toBe('Protein shake');
  });

  it('marks AI estimates and unknown macros honestly', () => {
    expect(parsedItemToLogItem(stew, 300)).toMatchObject({
      estimatedBy: 'vision',
      kcal: 360,
      protein: 0,
      unknownMacros: ['protein'],
    });
  });

  it('keeps a product ref with the grams logged', () => {
    expect(
      parsedItemToLogItem({ ...egg, source: 'product', productId: 'p1' }, 50)?.product,
    ).toEqual({
      id: 'p1',
      grams: 50,
    });
  });

  it('refuses a zero amount and totals what is left', () => {
    expect(parsedItemToLogItem(egg, 0)).toBeNull();
    expect(
      foodTextTotal([parsedItemToLogItem(egg, 100), null, parsedItemToLogItem(shake, 1)]),
    ).toBe(363);
  });
});
