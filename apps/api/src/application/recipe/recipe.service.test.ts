import { describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@chefer/database';
import { RecipeService } from './recipe.service.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const {
  findAllRecipesForUser,
  findSavedRecipeIds,
  findByUserId,
  findHouseholdByUserId,
  findRecipeIdsByUser,
} = vi.hoisted(() => ({
  findAllRecipesForUser: vi.fn(),
  findSavedRecipeIds: vi.fn().mockResolvedValue([]),
  findByUserId: vi.fn().mockResolvedValue(null),
  findHouseholdByUserId: vi.fn().mockResolvedValue([]),
  // T-01.2: SafetyService.loadContext also reads reported-recipe ids.
  findRecipeIdsByUser: vi.fn().mockResolvedValue([]),
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
  };
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
