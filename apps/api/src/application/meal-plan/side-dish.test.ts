import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mealPlanRepository, pantryItemRepository, prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { fakeIngredientPriceFindMany } from '../../test-support/fake-ingredient-prices.js';
import { ShoppingListService } from '../shopping-list/shopping-list.service.js';

// FB7-04: a side dish is just another slot of the same meal type, so the
// shopping list (which iterates every slot) must include its ingredients.
// Day totals (`sumPlanDay`) and the Today tracker (`getDay` gives every slot
// its own index) are covered by meal-portion.test.ts / tracker.slots.test.ts.

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      shoppingList: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
      ingredientPrice: { findMany: vi.fn().mockResolvedValue([]) },
      aiCallLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(),
    },
    mealPlanRepository: {
      findForWeek: vi.fn(),
      findActiveWithDays: vi.fn().mockResolvedValue(null),
      findByIdForUser: vi.fn().mockResolvedValue(null),
      findRecipesByIds: vi.fn(),
      findAllByUserId: vi.fn().mockResolvedValue([]),
    },
    pantryItemRepository: { findByUser: vi.fn().mockResolvedValue([]) },
    chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  };
});
vi.mock('../../lib/ai/index.js', () => ({ aiService: {} }));
vi.mock('../../lib/grocery-ai/index.js', () => ({
  groceryAIService: { searchNearbyStores: vi.fn().mockResolvedValue({ stores: [] }) },
}));
vi.mock('../../lib/ingredient-images/index.js', () => ({
  resolveIngredientImage: vi.fn().mockResolvedValue('https://img.example/x.jpg'),
}));
vi.mock('../../workers/ingredient-price.worker.js', () => ({
  ingredientPriceWorker: { wake: vi.fn() },
}));
vi.mock('../pantry/pantry.service.js', () => ({
  pantryService: { seedFromPurchases: vi.fn(), revertPurchases: vi.fn() },
}));
vi.mock('../household/household.service.js', () => ({
  householdService: {
    scalingPortions: vi.fn().mockResolvedValue(null),
    scalingTable: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../safety/safety.service.js', () => ({
  safetyService: {
    loadContext: vi.fn().mockResolvedValue({
      prefs: {
        allergies: [],
        dietaryRestrictions: [],
        dislikedIngredients: [],
        excludeLabelDependent: false,
      },
      hiddenRecipeIds: [],
      table: { people: [], hasRules: false, needsReview: false },
    }),
  },
}));

const user: UserProfile = {
  id: 'u1',
  email: 'free@test.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};

describe('shopping list — a side dish of the same meal type', () => {
  beforeEach(() => {
    vi.mocked(prisma.shoppingList.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.ingredientPrice.findMany).mockImplementation(
      fakeIngredientPriceFindMany([]) as never,
    );
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([]);
  });

  it('lists the main’s AND the side’s ingredients', async () => {
    vi.mocked(mealPlanRepository.findForWeek).mockResolvedValue({
      id: 'plan1',
      userId: 'u1',
      weekStartDate: new Date(),
      createdAt: new Date(0),
      status: 'ACTIVE',
      days: [
        {
          id: 'd0',
          mealPlanId: 'plan1',
          dayOfWeek: 0,
          meals: [
            { type: 'lunch', recipeId: 'main' },
            { type: 'lunch', recipeId: 'side', pinned: true },
          ],
        },
      ],
    } as never);
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([
      {
        id: 'main',
        name: 'Chicken',
        servings: 1,
        ingredients: [{ name: 'chicken', quantity: 300, unit: 'g' }],
      },
      {
        id: 'side',
        name: 'Rice',
        servings: 1,
        ingredients: [{ name: 'rice', quantity: 150, unit: 'g' }],
      },
    ] as never);

    const list = await new ShoppingListService().getForWeek(user, 0);

    const names = list.items.map((i) => i.ingredientName.toLowerCase());
    expect(names).toContain('chicken');
    expect(names).toContain('rice');
  });
});
