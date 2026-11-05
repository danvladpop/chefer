import { describe, expect, it } from 'vitest';
import type { LoggedMealEntry } from '@chefer/database';
import {
  copiedMealEntries,
  entriesFromSavedMeal,
  entriesOfMeal,
  parseSavedMealItems,
  toSavedMealItems,
} from './saved-meals.js';

// Lane A2: a saved meal is a snapshot of one meal's entries; re-logging and
// copying give fresh ids and never carry a plan slot to another day.

const recipeEntry: LoggedMealEntry = {
  entryId: 'e1',
  recipeId: 'r1',
  mealType: 'breakfast',
  slotIndex: 0,
  portionMultiplier: 1.5,
  kcal: 450,
  protein: 30,
  carbs: 40,
  fat: 15,
};
const productEntry: LoggedMealEntry = {
  entryId: 'e2',
  custom: { name: 'Oatly Oat Drink, 250 g', estimatedBy: 'manual' },
  mealType: 'breakfast',
  portionMultiplier: 1,
  kcal: 115,
  protein: 2.5,
  carbs: 16.8,
  fat: 3.8,
  product: { id: 'p1', grams: 250 },
};
const lunchEntry: LoggedMealEntry = {
  entryId: 'e3',
  custom: { name: 'Sandwich', estimatedBy: 'vision' },
  mealType: 'lunch',
  portionMultiplier: 1,
  kcal: 500,
  protein: 0,
  carbs: 60,
  fat: 20,
  unknownMacros: ['protein'],
  replacesSlot: { mealType: 'lunch', slotIndex: 1 },
};

describe('saved meals: entries ↔ items', () => {
  it('picks one meal, names recipe items after the recipe, keeps the product ref', () => {
    const meal = entriesOfMeal([recipeEntry, productEntry, lunchEntry], 'breakfast');
    expect(meal).toHaveLength(2);
    expect(toSavedMealItems(meal, new Map([['r1', 'Overnight oats']]))).toEqual([
      {
        recipeId: 'r1',
        name: 'Overnight oats',
        portionMultiplier: 1.5,
        kcal: 450,
        protein: 30,
        carbs: 40,
        fat: 15,
      },
      {
        name: 'Oatly Oat Drink, 250 g',
        estimatedBy: 'manual',
        portionMultiplier: 1,
        kcal: 115,
        protein: 2.5,
        carbs: 16.8,
        fat: 3.8,
        product: { id: 'p1', grams: 250 },
      },
    ]);
  });

  it('re-logs items as fresh entries for the chosen meal, with no plan slot', () => {
    const items = toSavedMealItems([recipeEntry, lunchEntry], new Map([['r1', 'Oats']]));
    const entries = entriesFromSavedMeal(items, 'dinner');
    expect(entries.map((e) => e.mealType)).toEqual(['dinner', 'dinner']);
    expect(entries[0]).toMatchObject({ recipeId: 'r1', portionMultiplier: 1.5 });
    expect(entries[0]!.slotIndex).toBeUndefined();
    expect(entries[1]).toMatchObject({
      custom: { name: 'Sandwich', estimatedBy: 'vision' },
      unknownMacros: ['protein'],
    });
    expect(entries[1]!.replacesSlot).toBeUndefined();
    expect(new Set(entries.map((e) => e.entryId)).size).toBe(2);
    expect(entries.map((e) => e.entryId)).not.toContain('e1');
  });

  it('copies a meal with fresh ids, the new meal type and no slot or replacement', () => {
    const [copy] = copiedMealEntries([lunchEntry], 'dinner');
    expect(copy).toMatchObject({ mealType: 'dinner', kcal: 500 });
    expect(copy!.entryId).not.toBe('e3');
    expect(copy!.replacesSlot).toBeUndefined();
  });

  it('drops malformed stored items instead of failing', () => {
    expect(
      parseSavedMealItems([
        { name: 'ok', portionMultiplier: 1, kcal: 1, protein: 0, carbs: 0, fat: 0 },
        { name: '' },
        'x',
      ]),
    ).toHaveLength(1);
    expect(parseSavedMealItems(null)).toEqual([]);
  });
});
