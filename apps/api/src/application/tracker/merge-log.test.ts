import { describe, expect, it } from 'vitest';
import type { LoggedMealEntry } from '@chefer/database';
import { mergeLoggedMeals } from './merge-log.js';

const recipe = (recipeId: string, mealType = 'dinner', kcal = 500): LoggedMealEntry => ({
  recipeId,
  mealType,
  portionMultiplier: 1,
  kcal,
  protein: 20,
  carbs: 50,
  fat: 15,
});
const custom = (name: string): LoggedMealEntry => ({
  custom: { name, estimatedBy: 'manual' },
  mealType: 'snack',
  portionMultiplier: 1,
  kcal: 200,
  protein: 5,
  carbs: 20,
  fat: 8,
});

describe('mergeLoggedMeals', () => {
  it('keeps a cooked meal whose recipe left the plan (F-PM-1)', () => {
    const stored = [recipe('curry')]; // cooked, then the plan was regenerated
    const merged = mergeLoggedMeals(stored, [recipe('oats', 'breakfast')], new Set(['oats']));
    expect(merged.map((m) => m.recipeId)).toEqual(['oats', 'curry']);
  });

  it("keeps custom entries the client didn't send, ignoring echoed ones (F-TRK-1-2)", () => {
    const stored = [custom('Tab-B snack'), custom('pizza scan')];
    const stale = [custom('pizza scan')]; // a stale tab only knew one of them
    const merged = mergeLoggedMeals(stored, [recipe('oats'), ...stale], new Set(['oats']));
    expect(merged.filter((m) => m.custom).map((m) => m.custom?.name)).toEqual([
      'Tab-B snack',
      'pizza scan',
    ]);
  });

  it('lets the client untick a planned meal, including sending an empty list (F-TRK-1-3)', () => {
    const stored = [recipe('oats', 'breakfast'), recipe('salad', 'lunch'), custom('apple')];
    const merged = mergeLoggedMeals(stored, [], new Set(['oats', 'salad']));
    expect(merged).toEqual([custom('apple')]);
  });

  it('replaces a planned entry with the client version (portion change)', () => {
    const stored = [recipe('oats', 'breakfast', 300)];
    const incoming = [{ ...recipe('oats', 'breakfast', 450), portionMultiplier: 1.5 }];
    const merged = mergeLoggedMeals(stored, incoming, new Set(['oats']));
    expect(merged).toEqual(incoming);
  });
});
