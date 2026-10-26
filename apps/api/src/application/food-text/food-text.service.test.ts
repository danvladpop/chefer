import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackagedProduct } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import type { FoodTextParseItem } from '../../lib/ai/types.js';
import { FoodTextService, normaliseFoodName } from './food-text.service.js';

// Lane A4: the AI only splits the sentence; the numbers come from the most
// trusted match — a recent log, a product, the catalog — and only then the
// model's estimate.

const quota = vi.hoisted(() => ({ release: vi.fn() }));
vi.mock('../../lib/quotas.js', () => ({ reserveFoodText: vi.fn().mockResolvedValue(quota) }));
vi.mock('../../lib/ai/index.js', () => ({ aiService: {} }));
vi.mock('../ingredients/ingredients.service.js', () => ({ ingredientsService: {} }));
vi.mock('../tracker/tracker.service.js', () => ({ trackerService: {} }));

const USER = { id: 'u1', planTier: 'FREE', role: 'USER' } as UserProfile;

function item(food: string, overrides: Partial<FoodTextParseItem> = {}): FoodTextParseItem {
  return {
    text: food,
    food,
    grams: 100,
    count: null,
    kcalPer100g: 150,
    proteinPer100g: 5,
    carbsPer100g: 20,
    fatPer100g: 5,
    ...overrides,
  };
}

function setup(parsed: FoodTextParseItem[]) {
  const deps = {
    ai: { parseFoodText: vi.fn().mockResolvedValue(parsed) },
    products: { search: vi.fn().mockResolvedValue([]) },
    searchIngredients: vi.fn().mockResolvedValue([]),
    recents: vi.fn().mockResolvedValue([]),
  };
  return { deps, service: new FoodTextService(deps) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FoodTextService.parse', () => {
  it("a recent log with the same name wins, counted in servings, with the user's own numbers", async () => {
    const { deps, service } = setup([
      item('protein shake', { text: '2 protein shakes', count: 2 }),
    ]);
    deps.recents.mockResolvedValue([
      {
        key: 'custom:protein shake',
        name: 'Protein shake',
        kcal: 220,
        protein: 30,
        carbs: 10,
        fat: 4,
      },
    ]);
    const { items } = await service.parse(USER, '2 protein shakes');
    expect(items[0]).toMatchObject({
      name: 'Protein shake',
      source: 'recent',
      unit: 'serving',
      servings: 2,
      perServing: { kcal: 220, protein: 30 },
    });
    expect(deps.products.search).not.toHaveBeenCalled();
  });

  it("the user's own packaged product comes next, keeping its id", async () => {
    const { deps, service } = setup([item('granola', { grams: 45 })]);
    deps.products.search.mockResolvedValue([
      {
        id: 'p1',
        name: 'Crunchy granola',
        brand: 'Mills',
        ownerId: 'u1',
        kcalPer100g: 450,
        proteinPer100g: 10,
        carbsPer100g: null,
        fatPer100g: 18,
      } as PackagedProduct,
    ]);
    const { items } = await service.parse(USER, 'granola');
    expect(items[0]).toMatchObject({
      source: 'product',
      productId: 'p1',
      name: 'Mills Crunchy granola',
      unit: 'g',
      grams: 45,
      per100g: { kcal: 450, carbs: null },
    });
  });

  it('then the catalog — but only a real name match ("egg" is not "Eggplant")', async () => {
    const { deps, service } = setup([item('egg', { grams: 100 })]);
    deps.searchIngredients.mockResolvedValue([
      { displayName: 'Eggplant', per100g: { calories: 25, protein: 1, carbs: 6, fat: 0.2 } },
      { displayName: 'Egg', per100g: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5 } },
    ]);
    const { items } = await service.parse(USER, '2 eggs');
    expect(items[0]).toMatchObject({ name: 'Egg', source: 'ingredient', per100g: { kcal: 143 } });
  });

  it("falls back to the model's estimate, marked as one", async () => {
    const { service } = setup([item('mystery stew', { grams: 300, kcalPer100g: 120 })]);
    const { items } = await service.parse(USER, 'mystery stew');
    expect(items[0]).toMatchObject({
      name: 'Mystery stew',
      source: 'estimate',
      grams: 300,
      per100g: { kcal: 120 },
    });
  });

  it('nothing found → an empty list, no lookups', async () => {
    const { deps, service } = setup([]);
    expect(await service.parse(USER, 'hello there')).toEqual({ items: [] });
    expect(deps.recents).not.toHaveBeenCalled();
  });

  it('refunds the quota when every provider is over capacity', async () => {
    const { deps, service } = setup([]);
    deps.ai.parseFoodText.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));
    await expect(service.parse(USER, '2 eggs')).rejects.toBeDefined();
    expect(quota.release).toHaveBeenCalledTimes(1);
  });
});

it('normaliseFoodName drops amounts, punctuation and a plural s', () => {
  expect(normaliseFoodName('2 Eggs!')).toBe('egg');
  expect(normaliseFoodName('Protein shake')).toBe('protein shake');
  // Both sides go through the same rule, so a word ending in s still matches itself.
  expect(normaliseFoodName('Hummus')).toBe(normaliseFoodName('hummus'));
});
