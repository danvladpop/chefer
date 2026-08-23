import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mealPlanRepository, pantryItemRepository, prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { pantryService } from '../pantry/pantry.service.js';
import { ShoppingListService } from './shopping-list.service.js';

// ─── Module mocks (style: recipe-import.service.test.ts) ─────────────────────

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
      findByWeekStart: vi.fn().mockResolvedValue(null),
      findActiveWithDays: vi.fn().mockResolvedValue(null),
      findByIdForUser: vi.fn().mockResolvedValue(null),
      findRecipesByIds: vi.fn().mockResolvedValue([]),
      findAllByUserId: vi.fn().mockResolvedValue([]),
    },
    pantryItemRepository: {
      findByUser: vi.fn().mockResolvedValue([]),
    },
    chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  };
});

// The AI module validates env at import time — mock it (never called here).
vi.mock('../../lib/ai/index.js', () => ({ aiService: {} }));
vi.mock('../../lib/grocery-ai/index.js', () => ({ groceryAIService: {} }));
vi.mock('../../lib/ingredient-images/index.js', () => ({
  resolveIngredientImage: vi.fn().mockResolvedValue('https://img.example/x.jpg'),
}));
vi.mock('../../workers/ingredient-price.worker.js', () => ({
  ingredientPriceWorker: { wake: vi.fn() },
}));
// Seeding delegates to PantryService (staple filtering lives there — covered
// by pantry.service.test.ts); here we assert the delegation itself.
vi.mock('../pantry/pantry.service.js', () => ({
  pantryService: { seedFromPurchases: vi.fn().mockResolvedValue(1) },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const freeUser: UserProfile = {
  id: 'u1',
  email: 'free@test.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const premiumUser: UserProfile = { ...freeUser, planTier: 'PREMIUM' };

const PLAN = {
  id: 'plan1',
  userId: 'u1',
  weekStartDate: new Date(),
  status: 'ACTIVE',
  days: [
    { id: 'd0', mealPlanId: 'plan1', dayOfWeek: 0, meals: [{ type: 'dinner', recipeId: 'r1' }] },
  ],
};

const RECIPE = {
  id: 'r1',
  name: 'Tomato Beef Stew',
  ingredients: [
    { name: 'Tomato', quantity: 600, unit: 'g' },
    { name: 'beef', quantity: 300, unit: 'g' },
  ],
};

const PRICES = [
  {
    ingredientName: 'tomato',
    pricePer100gEur: 0.5,
    pricePer100mlEur: null,
    pricePerPieceEur: null,
  },
  { ingredientName: 'beef', pricePer100gEur: 2, pricePer100mlEur: null, pricePerPieceEur: null },
];

const pantryRow = (name: string) => ({
  id: `p-${name}`,
  userId: 'u1',
  ingredientName: name,
  quantity: 500,
  unit: 'g',
  source: 'PURCHASE',
  updatedAt: new Date(),
});

function planWithRecipes() {
  vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue(PLAN as never);
  vi.mocked(mealPlanRepository.findByIdForUser).mockResolvedValue(PLAN as never);
  vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([RECIPE] as never);
  vi.mocked(prisma.ingredientPrice.findMany).mockResolvedValue(PRICES as never);
}

describe('ShoppingListService — F3 pantry subtraction', () => {
  const service = new ShoppingListService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.shoppingList.findUnique).mockResolvedValue(null);
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([]);
  });

  it('premium: covered items get the "have it" flag, leave the total, and feed the savings counter', async () => {
    planWithRecipes();
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([pantryRow('tomato')] as never);

    const list = await service.getForWeek(premiumUser, 0);

    const tomato = list.items.find((i) => i.ingredientName === 'Tomato')!;
    const beef = list.items.find((i) => i.ingredientName === 'Beef')!;
    expect(tomato.pantryCovered).toBe(true);
    expect(beef.pantryCovered).toBeUndefined();
    // 600 g tomato @ €0.5/100g = €3 covered; 300 g beef @ €2/100g = €6 stays.
    expect(list.estimatedTotalEur).toBe(6);
    expect(list.pantry).toEqual({ entitled: true, itemCount: 1, savedEur: 3 });
  });

  it('free: numbers untouched, ghost figures only (§6.4)', async () => {
    planWithRecipes();
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([pantryRow('tomato')] as never);

    const list = await service.getForWeek(freeUser, 0);

    expect(list.items.every((i) => i.pantryCovered === undefined)).toBe(true);
    expect(list.estimatedTotalEur).toBe(9); // full total — nothing subtracted
    expect(list.pantry).toEqual({ entitled: false, itemCount: 1, savedEur: 3 });
  });

  it('empty pantry: zeros, and the list is exactly the pre-F3 shape', async () => {
    planWithRecipes();
    const list = await service.getForWeek(premiumUser, 0);
    expect(list.estimatedTotalEur).toBe(9);
    expect(list.pantry).toEqual({ entitled: true, itemCount: 0, savedEur: 0 });
  });

  it('custom (user-added) items are never subtracted', async () => {
    planWithRecipes();
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([pantryRow('tomato')] as never);
    // A bare stored row with a custom "tomato" the user added on purpose.
    vi.mocked(prisma.shoppingList.findUnique).mockResolvedValue({
      planId: 'plan1',
      items: [],
      aiGenerated: false,
      checkedKeys: [],
      customItems: [
        {
          key: 'plan1-custom-tomato-pcs',
          ingredientName: 'Tomato',
          quantity: '4',
          unit: 'pcs',
          category: 'produce',
          recipeNames: [],
        },
      ],
    } as never);

    const list = await service.getForWeek(premiumUser, 0);
    const custom = list.items.find((i) => i.isCustom)!;
    expect(custom.pantryCovered).toBeUndefined();
    // The derived tomato line is still covered.
    expect(list.items.find((i) => i.key === 'plan1-tomato|g')!.pantryCovered).toBe(true);
  });
});

describe('ShoppingListService — F3 pantry seeding from check-offs', () => {
  const service = new ShoppingListService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.shoppingList.findUnique).mockResolvedValue(null);
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([]);
    vi.mocked(mealPlanRepository.findByIdForUser).mockResolvedValue(PLAN as never);
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([RECIPE] as never);
    // toggleItems' Serializable read-modify-write — run the callback with a
    // minimal tx facade.
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        shoppingList: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({}),
        },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });
  });

  it('checking off derived items seeds the pantry with their name/qty/unit', async () => {
    await service.toggleItems('u1', 'plan1', ['plan1-tomato|g'], true);

    expect(pantryService.seedFromPurchases).toHaveBeenCalledWith('u1', [
      { name: 'Tomato', quantity: 600, unit: 'g' },
    ]);
  });

  it('unchecking never touches the pantry (you still have it)', async () => {
    await service.toggleItems('u1', 'plan1', ['plan1-tomato|g'], false);
    expect(pantryService.seedFromPurchases).not.toHaveBeenCalled();
  });

  it('a pantry failure never breaks the check-off itself', async () => {
    vi.mocked(pantryService.seedFromPurchases).mockRejectedValueOnce(new Error('db down'));
    const result = await service.toggleItems('u1', 'plan1', ['plan1-tomato|g'], true);
    expect(result.checkedKeys).toContain('plan1-tomato|g');
  });

  it('checked keys that match no list item seed nothing', async () => {
    await service.toggleItems('u1', 'plan1', ['plan1-nonexistent|g'], true);
    expect(pantryService.seedFromPurchases).toHaveBeenCalledWith('u1', []);
  });
});
