import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@chefer/database';
import { RecipeService } from './recipe.service.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const {
  findAllRecipesForUser,
  findSavedRecipeIds,
  findByUserId,
  findHouseholdByUserId,
  findRecipeIdsByUser,
  findRecipeById,
  isRecipeInUserPlans,
  upsertRecipes,
} = vi.hoisted(() => ({
  findAllRecipesForUser: vi.fn(),
  findSavedRecipeIds: vi.fn().mockResolvedValue([]),
  findByUserId: vi.fn().mockResolvedValue(null),
  findHouseholdByUserId: vi.fn().mockResolvedValue([]),
  // T-01.2: SafetyService.loadContext also reads reported-recipe ids.
  findRecipeIdsByUser: vi.fn().mockResolvedValue([]),
  // T-02.3: getSafetyChecks resolves the recipe via recipe-access's
  // findRecipeVisibleTo, which reads mealPlanRepository. T-02.5's
  // discoverHiddenCount calls ensureCuratedRecipes(), which upserts the
  // curated pool the first time it runs in this process.
  findRecipeById: vi.fn(),
  isRecipeInUserPlans: vi.fn().mockResolvedValue(false),
  upsertRecipes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    favouriteRecipeRepository: {
      findAllRecipesForUser,
      findSavedRecipeIds,
    },
    dietaryPreferencesRepository: { findByUserId },
    householdMemberRepository: { findByUserId: findHouseholdByUserId },
    safetyReportRepository: { findRecipeIdsByUser, create: vi.fn(), findAllByUser: vi.fn() },
    mealPlanRepository: { findRecipeById, isRecipeInUserPlans, upsertRecipes },
  };
});

// `mockResolvedValueOnce` queues are per-mock, not per-test — a value pushed
// but never consumed (e.g. `list()` without `forTable` never calls
// `loadContext`) would otherwise leak into a LATER test and shift every
// queued value after it by one. Reset before each test so every
// `mockResolvedValueOnce` call is consumed by its own test only.
beforeEach(() => {
  findAllRecipesForUser.mockReset();
  findSavedRecipeIds.mockReset().mockResolvedValue([]);
  findByUserId.mockReset().mockResolvedValue(null);
  findHouseholdByUserId.mockReset().mockResolvedValue([]);
  findRecipeIdsByUser.mockReset().mockResolvedValue([]);
  findRecipeById.mockReset();
  isRecipeInUserPlans.mockReset().mockResolvedValue(false);
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const recipe = (over: Partial<Recipe> & { id: string; name: string }): Recipe =>
  ({
    description: `${over.name} description`,
    ingredients: [{ name: 'egg', quantity: 2, unit: 'pcs' }],
    instructions: ['Cook it'],
    nutritionInfo: { calories: 300, protein: 10, carbs: 20, fat: 10, fiber: 2 },
    cuisineType: 'international',
    dietaryTags: [],
    prepTimeMins: 10,
    cookTimeMins: 10,
    servings: 1,
    imageUrl: null,
    imageStatus: 'DONE',
    imageRetries: 0,
    imagePriority: 100,
    source: 'AI',
    sourceUrl: null,
    creatorId: null,
    createdAt: new Date('2026-09-01'),
    ...over,
  }) as unknown as Recipe;

describe('RecipeService.list({ forTable }) — B-34/B-46, T-00.11', () => {
  it('keeps the unfiltered list when forTable is omitted (old clients)', async () => {
    findAllRecipesForUser.mockResolvedValue([recipe({ id: 'r-egg', name: 'Egg Fried Rice' })]);
    findByUserId.mockResolvedValueOnce({
      allergies: ['egg'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const rows = await service.list('u1', {});
    expect(rows).toHaveLength(1);
  });

  it('drops recipes unsafe for the user/household allergies when forTable is true', async () => {
    findAllRecipesForUser.mockResolvedValue([
      recipe({
        id: 'r-egg',
        name: 'Egg Fried Rice',
        ingredients: [{ name: 'egg', quantity: 2, unit: 'pcs' }],
      }),
      recipe({
        id: 'r-safe',
        name: 'Veggie Fried Rice',
        ingredients: [{ name: 'rice', quantity: 200, unit: 'g' }],
      }),
    ]);
    findByUserId.mockResolvedValueOnce({
      allergies: ['egg'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const rows = await service.list('u1', { forTable: true });
    expect(rows.map((r) => r.id)).toEqual(['r-safe']);
  });

  it('unions a household member allergy into the forTable filter', async () => {
    findAllRecipesForUser.mockResolvedValue([
      recipe({
        id: 'r-nut',
        name: 'Peanut Noodles',
        ingredients: [{ name: 'peanut', quantity: 1, unit: 'tbsp' }],
      }),
    ]);
    findByUserId.mockResolvedValueOnce({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    findHouseholdByUserId.mockResolvedValueOnce([
      { name: 'Kid', portionFactor: 0.5, allergies: ['peanut'], dietaryRestrictions: [] },
    ]);
    const service = new RecipeService();
    const rows = await service.list('u1', { forTable: true });
    expect(rows).toHaveLength(0);
  });
});

describe('RecipeService.getSafetyChecks (T-02.3)', () => {
  it('returns null when the table has no rules at all', async () => {
    findRecipeById.mockResolvedValue(recipe({ id: 'r1', name: 'Egg Fried Rice' }));
    findByUserId.mockResolvedValueOnce({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    expect(await service.getSafetyChecks('u1', 'r1')).toEqual({ safetyChecks: null });
  });

  it('names the checked rule the recipe passes', async () => {
    findRecipeById.mockResolvedValue(
      recipe({
        id: 'r1',
        name: 'Veggie Fried Rice',
        ingredients: [{ name: 'rice', quantity: 200, unit: 'g' }],
        dietaryTags: ['vegetarian'],
      }),
    );
    findByUserId.mockResolvedValueOnce({
      allergies: [],
      dietaryRestrictions: ['Vegetarian'],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const result = await service.getSafetyChecks('u1', 'r1');
    expect(result.safetyChecks?.checked).toEqual([{ label: 'Vegetarian', who: 'you' }]);
    expect(result.safetyChecks?.conflicts).toEqual([]);
  });

  it('lists a conflict for a recipe that fails an allergy rule', async () => {
    findRecipeById.mockResolvedValue(
      recipe({
        id: 'r-egg',
        name: 'Egg Fried Rice',
        ingredients: [{ name: 'egg', quantity: 2, unit: 'pcs' }],
      }),
    );
    findByUserId.mockResolvedValueOnce({
      allergies: ['egg'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const result = await service.getSafetyChecks('u1', 'r-egg');
    expect(result.safetyChecks?.conflicts).toContain('Eggs');
  });

  it('throws NOT_FOUND for a recipe the user cannot see', async () => {
    findRecipeById.mockResolvedValue(null);
    const service = new RecipeService();
    await expect(service.getSafetyChecks('u1', 'missing')).rejects.toThrow('Recipe not found.');
  });
});

describe('RecipeService.discoverHiddenCount (T-02.5/T-01.4)', () => {
  it('reports no hidden recipes and no active filters when the table has no rules', async () => {
    findByUserId.mockResolvedValueOnce({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const result = await service.discoverHiddenCount('u1', {});
    expect(result).toEqual({ hiddenCount: 0, filteredFor: [] });
  });

  it('counts the curated recipes a tree-nut allergy hides and names the active filter (AC3)', async () => {
    findByUserId.mockResolvedValueOnce({
      allergies: ['Tree nuts'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const result = await service.discoverHiddenCount('u1', {});
    expect(result.filteredFor).toEqual(['Tree nuts']);
    expect(result.hiddenCount).toBeGreaterThan(0);
  });
});
