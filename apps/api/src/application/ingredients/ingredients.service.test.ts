import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ingredientPriceRepository } from '@chefer/database';
import { IngredientsService } from './ingredients.service.js';

// T-BUG-X7: search() must go through ingredientPriceRepository, not `prisma`
// directly (CLAUDE.md rule 2). T-19.1: search rows carry per100g macros for
// the Log sheet's grams row (50/100/150/200 g + live kcal).

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  ingredientPriceRepository: { searchCatalog: vi.fn() },
  prisma: { ingredientPrice: { upsert: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() } },
}));

vi.mock('../../lib/ingredient-images/index.js', () => ({
  resolveIngredientImage: vi.fn().mockResolvedValue('https://cdn/fallback.png'),
}));

// ingredients.service.ts imports aiService (env-dependent) for
// estimateNutrition — irrelevant to these search() tests, but importing it
// unmocked pulls in real env validation.
vi.mock('../../lib/ai/index.js', () => ({
  aiService: { estimateIngredientPrices: vi.fn() },
}));

function catalogRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ingredientName: 'chicken breast',
    imageUrl: 'https://cdn/chicken.png',
    caloriesPer100g: 165,
    proteinPer100g: 31,
    carbsPer100g: 0,
    fatPer100g: 3.6,
    creatorId: null,
    ...overrides,
  };
}

describe('IngredientsService.search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to ingredientPriceRepository.searchCatalog (T-BUG-X7)', async () => {
    vi.mocked(ingredientPriceRepository.searchCatalog).mockResolvedValue([catalogRow()] as never);
    const service = new IngredientsService();

    await service.search('u1', 'chicken', 10);

    expect(ingredientPriceRepository.searchCatalog).toHaveBeenCalledWith('chicken', 'u1', 20);
  });

  it('returns per100g macros for a row that has them', async () => {
    vi.mocked(ingredientPriceRepository.searchCatalog).mockResolvedValue([catalogRow()] as never);
    const service = new IngredientsService();

    const [result] = await service.search('u1', 'chicken');

    expect(result?.hasMacros).toBe(true);
    expect(result?.per100g).toEqual({ calories: 165, protein: 31, carbs: 0, fat: 3.6 });
  });

  it('per100g is null for a row with no macro data yet', async () => {
    vi.mocked(ingredientPriceRepository.searchCatalog).mockResolvedValue([
      catalogRow({
        caloriesPer100g: null,
        proteinPer100g: null,
        carbsPer100g: null,
        fatPer100g: null,
      }),
    ] as never);
    const service = new IngredientsService();

    const [result] = await service.search('u1', 'chicken');

    expect(result?.hasMacros).toBe(false);
    expect(result?.per100g).toBeNull();
  });

  it('returns nothing for a query under 2 characters (never queries the repository)', async () => {
    const service = new IngredientsService();
    expect(await service.search('u1', 'c')).toEqual([]);
    expect(ingredientPriceRepository.searchCatalog).not.toHaveBeenCalled();
  });

  it('ranks custom rows and prefix matches first', async () => {
    vi.mocked(ingredientPriceRepository.searchCatalog).mockResolvedValue([
      catalogRow({ ingredientName: 'grilled chicken', creatorId: null }),
      catalogRow({ ingredientName: 'chicken breast', creatorId: 'u1' }), // custom, prefix
      catalogRow({ ingredientName: 'chicken thigh', creatorId: null }), // global, prefix
    ] as never);
    const service = new IngredientsService();

    const results = await service.search('u1', 'chicken');

    expect(results[0]?.name).toBe('chicken breast'); // custom + prefix wins
    expect(results[0]?.isCustom).toBe(true);
  });
});
