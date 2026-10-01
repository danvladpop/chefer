import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import type { IMealPlanRepository, IPantryItemRepository } from '@chefer/database';
import { visibleToUser } from '../../lib/ingredient-prices/index.js';
import {
  fakeIngredientPriceFindMany,
  type FakeIngredientPriceRow,
} from '../../test-support/fake-ingredient-prices.js';
import { PantryService } from '../pantry/pantry.service.js';
import { estimatePlanCostEur } from '../shared/plan-cost.js';
import { loadMacroVocabulary } from './macro-vocabulary.js';

// Regression for plan-ingredient-catalog F6 / invariant I4: user A's private
// ingredient row must never be read for, or change the numbers of, user B.
// Before the fix, reconcile, the import cross-check, plan cost, the shopping
// list and pantry savings all loaded vocabulary rows by name only.
// (The shopping-list path is covered in shopping-list.service.test.ts.)

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return { ...mod, prisma: { ingredientPrice: { findMany: vi.fn() } } };
});

const ROWS: FakeIngredientPriceRow[] = [
  {
    ingredientName: 'chicken breast',
    creatorId: null,
    pricePer100gEur: 1,
    caloriesPer100g: 120,
    proteinPer100g: 22.5,
    carbsPer100g: 0,
    fatPer100g: 2.6,
    fiberPer100g: 0,
  },
  {
    ingredientName: 'tahini',
    creatorId: 'userA',
    pricePer100gEur: 2,
    caloriesPer100g: 595,
    proteinPer100g: 17,
    carbsPer100g: 21,
    fatPer100g: 54,
    fiberPer100g: 9,
  },
];

const LINES = [
  { name: 'Chicken breast', quantity: 100, unit: 'g' },
  { name: 'Tahini', quantity: 100, unit: 'g' },
];

beforeEach(() => {
  vi.mocked(prisma.ingredientPrice.findMany).mockImplementation(
    fakeIngredientPriceFindMany(ROWS) as never,
  );
});

describe('private ingredient isolation (F6)', () => {
  it('visibleToUser: global + own rows; global only without a user', () => {
    expect(visibleToUser('userB')).toEqual({ OR: [{ creatorId: null }, { creatorId: 'userB' }] });
    expect(visibleToUser(undefined)).toEqual({ creatorId: null });
    expect(visibleToUser(null)).toEqual({ creatorId: null });
  });

  it('macro vocabulary (plan reconcile, swap, import cross-check) hides other users’ rows', async () => {
    const names = LINES.map((l) => l.name);
    const forB = await loadMacroVocabulary(names, 'userB');
    const forA = await loadMacroVocabulary(names, 'userA');
    const anonymous = await loadMacroVocabulary(names, undefined);

    expect(forB.map((r) => r.ingredientName)).toEqual(['chicken breast']);
    expect(forA.map((r) => r.ingredientName).sort()).toEqual(['chicken breast', 'tahini']);
    expect(anonymous.map((r) => r.ingredientName)).toEqual(['chicken breast']);
  });

  it('plan cost never prices a line from another user’s private row', async () => {
    const days = [{ meals: [{ recipe: { ingredients: LINES } }] }];

    const forB = await estimatePlanCostEur(days, { userId: 'userB' });
    expect(forB).toMatchObject({ totalEur: 1, pricedLines: 1, totalLines: 2 });

    const forA = await estimatePlanCostEur(days, { userId: 'userA' });
    expect(forA).toMatchObject({ totalEur: 3, pricedLines: 2, totalLines: 2 });

    const anonymous = await estimatePlanCostEur(days);
    expect(anonymous).toMatchObject({ totalEur: 1, pricedLines: 1 });
  });

  it('pantry savings never price a covered line from another user’s private row', async () => {
    const pantryRepo = {
      findByUser: vi.fn().mockResolvedValue([
        { ingredientName: 'tahini', quantity: 500, unit: 'g' },
        { ingredientName: 'chicken breast', quantity: 500, unit: 'g' },
      ]),
    } as unknown as IPantryItemRepository;
    const planRepo = {
      findByWeekStart: vi.fn().mockResolvedValue({
        id: 'plan1',
        days: [{ meals: [{ type: 'dinner', recipeId: 'r1' }] }],
      }),
      findRecipesByIds: vi.fn().mockResolvedValue([{ id: 'r1', name: 'Bowl', ingredients: LINES }]),
    } as unknown as IMealPlanRepository;
    const service = new PantryService(pantryRepo, planRepo);

    expect(await service.computeWeekPantrySavings('userB', new Date())).toBe(1);
    expect(await service.computeWeekPantrySavings('userA', new Date())).toBe(3);
  });
});
