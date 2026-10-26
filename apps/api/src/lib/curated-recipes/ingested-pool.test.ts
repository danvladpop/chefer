import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApprovedCuratedDraft, CuratedRecipeDraft } from '@chefer/database';

// Market review F1: approved ingested recipes join the free pool; nothing
// else does. The pool reads the repository's APPROVED drafts only
// (curated-recipe-draft.repository.test.ts pins that query), and refreshes
// after a review invalidates it.

const db = vi.hoisted(() => ({
  findApproved: vi.fn<[], Promise<ApprovedCuratedDraft[]>>(),
  upsertRecipes: vi.fn(),
  findGlobalIdsBySlugs: vi.fn(async () => new Map<string, string>()),
}));
vi.mock('@chefer/database', () => ({
  curatedRecipeDraftRepository: { findApproved: db.findApproved },
  mealPlanRepository: { upsertRecipes: db.upsertRecipes },
  ingredientRepository: { findGlobalIdsBySlugs: db.findGlobalIdsBySlugs },
  recipeLineRepository: { findNutritionStates: vi.fn(async () => []), writeLines: vi.fn() },
  readCatalogFile: () => [],
}));

const {
  CURATED_POOL_BY_TYPE,
  curatedMealTypeOf,
  curatedPoolByType,
  ensureCuratedRecipes,
  invalidateIngestedCuratedRecipes,
  safeCuratedPools,
  setIngestedCuratedRecipes,
} = await import('./index.js');

function approved(
  id: string,
  mealTypes: string[],
  ingredients = [{ name: 'chickpeas', quantity: 200, unit: 'g' }],
): ApprovedCuratedDraft {
  return {
    draft: {
      id: `draft-${id}`,
      status: 'APPROVED',
      mealTypes,
      draft: {
        name: `Ingested ${id}`,
        description: 'A test dish.',
        ingredients,
        instructions: ['Cook it.'],
        cuisineType: 'Romanian',
        dietaryTags: ['vegan', 'vegetarian', 'dairy-free'],
        prepTimeMins: 10,
        cookTimeMins: 20,
        servings: 2,
      },
    } as unknown as CuratedRecipeDraft,
    recipe: {
      id,
      nutritionInfo: { calories: 400, protein: 20, carbs: 50, fat: 10, fiber: 8 },
      imageUrl: null,
      nutritionStatus: 'COMPUTED',
    },
  };
}

const ids = (pool: { id: string }[]) => pool.map((r) => r.id);

describe('ingested curated slice', () => {
  beforeEach(() => {
    setIngestedCuratedRecipes([]);
    db.findApproved.mockReset();
  });

  it('adds an approved recipe to the meal types it was approved for, and nowhere else', () => {
    setIngestedCuratedRecipes([approved('r-dinner', ['dinner', 'lunch'])]);
    const pools = curatedPoolByType();
    expect(ids(pools.dinner)).toContain('r-dinner');
    expect(ids(pools.lunch)).toContain('r-dinner');
    expect(ids(pools.breakfast)).not.toContain('r-dinner');
    expect(pools.dinner).toHaveLength(CURATED_POOL_BY_TYPE.dinner.length + 1);
    expect(curatedMealTypeOf('r-dinner')).toBe('lunch');
  });

  it('runs ingested recipes through the same safety filter as the fixtures', () => {
    setIngestedCuratedRecipes([
      approved('r-nuts', ['dinner'], [{ name: 'walnuts', quantity: 50, unit: 'g' }]),
    ]);
    const prefs = { allergies: ['Tree nuts'], dietaryRestrictions: [], dislikedIngredients: [] };
    expect(ids(safeCuratedPools(null).dinner)).toContain('r-nuts');
    expect(ids(safeCuratedPools(prefs).dinner)).not.toContain('r-nuts');
  });

  it('skips a stored draft that no longer parses instead of serving garbage', () => {
    const broken = approved('r-broken', ['dinner']);
    broken.draft.draft = { name: 42 };
    setIngestedCuratedRecipes([broken]);
    expect(ids(curatedPoolByType().dinner)).not.toContain('r-broken');
  });

  it('loads from the APPROVED query on ensure, and reloads after a review invalidates it', async () => {
    db.findApproved.mockResolvedValueOnce([approved('r-1', ['dinner'])]);
    invalidateIngestedCuratedRecipes();
    await ensureCuratedRecipes();
    expect(ids(curatedPoolByType().dinner)).toContain('r-1');

    // Unpublished: the APPROVED query no longer returns it.
    db.findApproved.mockResolvedValueOnce([]);
    await ensureCuratedRecipes();
    expect(ids(curatedPoolByType().dinner)).toContain('r-1'); // still fresh (TTL)
    invalidateIngestedCuratedRecipes();
    await ensureCuratedRecipes();
    expect(ids(curatedPoolByType().dinner)).not.toContain('r-1');
  });

  it('keeps serving the fixtures when the drafts table cannot be read', async () => {
    db.findApproved.mockRejectedValueOnce(new Error('db down'));
    invalidateIngestedCuratedRecipes();
    await expect(ensureCuratedRecipes()).resolves.toBeUndefined();
    expect(curatedPoolByType().dinner).toHaveLength(CURATED_POOL_BY_TYPE.dinner.length);
  });
});
