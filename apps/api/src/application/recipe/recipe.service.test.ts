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
  findFavourite,
  findManualRecipeById,
} = vi.hoisted(() => ({
  findFavourite: vi.fn(),
  findManualRecipeById: vi.fn(),
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
      findFavourite,
      findManualRecipeById,
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
  findFavourite.mockReset().mockResolvedValue(null);
  findManualRecipeById.mockReset().mockResolvedValue(null);
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

  it('attaches safetyChecks to a visible row instead of throwing (bug fix, T-02.1)', async () => {
    findAllRecipesForUser.mockResolvedValue([
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
    expect(rows).toHaveLength(1);
    expect(rows[0]?.safetyChecks?.checked).toEqual([{ label: 'Eggs', who: 'you' }]);
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

describe('RecipeService.discover (T-01.2/T-02.1) — bug fix: summary rows must never crash safetyChecks', () => {
  it('returns 200-worthy rows with safetyChecks when the table has an allergy, instead of throwing', async () => {
    // `discover` maps the curated pool through `selectDiscoverRecipes`,
    // whose `DiscoverRecipeDto` is a SUMMARY shape (no `ingredients`/
    // `instructions`) — the real regression: `safetyChecks` used to be
    // computed by casting that summary row straight into
    // `SafetyService.check`, whose `ingredients.map` then threw
    // (INTERNAL_SERVER_ERROR) for any signed-in user with a rule. This test
    // exercises the REAL curated pool end to end, so it produces the exact
    // summary-row shape that used to crash.
    findByUserId.mockResolvedValueOnce({
      allergies: ['Tree nuts'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    const service = new RecipeService();
    const rows = await service.discover('u1', {});
    expect(rows.length).toBeGreaterThan(0);
    const withChecks = rows.filter((r) => r.safetyChecks !== undefined);
    expect(withChecks.length).toBeGreaterThan(0);
    expect(withChecks[0]?.safetyChecks?.checked.map((c) => c.label)).toContain('Tree nuts');
    // None of Discover's own results conflict — it already excludes them.
    expect(rows.every((r) => (r.safetyChecks?.conflicts ?? []).length === 0)).toBe(true);
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

describe('RecipeService.getFavouriteState — canEdit (owner dogfood 2026-09-30)', () => {
  it("is true only for the user's own manual recipe", async () => {
    findManualRecipeById.mockResolvedValueOnce(
      recipe({ id: 'r1', name: 'Mine', source: 'MANUAL' }),
    );
    await expect(new RecipeService().getFavouriteState('u1', 'r1')).resolves.toEqual({
      isSaved: false,
      useInNextPlan: false,
      canEdit: true,
    });
    expect(findManualRecipeById).toHaveBeenCalledWith('u1', 'r1');
  });

  it("is false for anyone else's recipe, saved or not", async () => {
    findFavourite.mockResolvedValueOnce({ useInNextPlan: true });
    await expect(new RecipeService().getFavouriteState('u1', 'r2')).resolves.toEqual({
      isSaved: true,
      useInNextPlan: true,
      canEdit: false,
    });
  });
});
