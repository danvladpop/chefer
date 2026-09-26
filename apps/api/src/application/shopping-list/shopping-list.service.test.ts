import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mealPlanRepository, pantryItemRepository, prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { groceryAIService } from '../../lib/grocery-ai/index.js';
import { householdService } from '../household/household.service.js';
import { pantryService } from '../pantry/pantry.service.js';
import { estimatePlanCostEur } from '../shared/plan-cost.js';
import { carryCheckedKeys, ShoppingListService } from './shopping-list.service.js';

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
vi.mock('../../lib/grocery-ai/index.js', () => ({
  groceryAIService: { searchNearbyStores: vi.fn().mockResolvedValue({ stores: [] }) },
}));
vi.mock('../../lib/ingredient-images/index.js', () => ({
  resolveIngredientImage: vi.fn().mockResolvedValue('https://img.example/x.jpg'),
}));
vi.mock('../../workers/ingredient-price.worker.js', () => ({
  ingredientPriceWorker: { wake: vi.fn() },
}));
// Seeding delegates to PantryService (staple filtering lives there — covered
// by pantry.service.test.ts); here we assert the delegation itself.
vi.mock('../pantry/pantry.service.js', () => ({
  pantryService: {
    seedFromPurchases: vi.fn().mockResolvedValue(1),
    revertPurchases: vi.fn().mockResolvedValue(1),
  },
}));

// Household scaling is premium + members (household.service.test.ts covers
// the decision); here each test sets the portions it wants.
vi.mock('../household/household.service.js', () => ({
  householdService: { scalingPortions: vi.fn().mockResolvedValue(null) },
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
  quantity: 1000,
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

  it('a ticked line is never "have it", even though ticking seeded the pantry (F-PAN-1-1)', async () => {
    planWithRecipes();
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([pantryRow('tomato')] as never);
    vi.mocked(prisma.shoppingList.findUnique).mockResolvedValue({
      planId: 'plan1',
      items: [],
      aiGenerated: false,
      checkedKeys: ['plan1-tomato|g'],
      customItems: [],
    } as never);
    const list = await service.getForWeek(premiumUser, 0);
    const tomato = list.items.find((i) => i.ingredientName === 'Tomato')!;
    expect(tomato.pantryCovered).toBeUndefined();
    expect(list.pantry.savedEur).toBe(0);
    expect(list.estimatedTotalEur).toBe(9);
  });

  it('a pantry amount smaller than the line does not cover it (F-PAN-1-2)', async () => {
    planWithRecipes();
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([
      { ...pantryRow('tomato'), quantity: 200 },
    ] as never);
    const list = await service.getForWeek(premiumUser, 0);
    expect(list.items.find((i) => i.ingredientName === 'Tomato')!.pantryCovered).toBeUndefined();
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
    await service.toggleItems(freeUser, 'plan1', ['plan1-tomato|g'], true);

    expect(pantryService.seedFromPurchases).toHaveBeenCalledWith('u1', [
      { name: 'Tomato', quantity: 600, unit: 'g' },
    ]);
  });

  it('unchecking takes the purchase back out of the pantry (F-PAN-1-1)', async () => {
    await service.toggleItems(freeUser, 'plan1', ['plan1-tomato|g'], false);
    expect(pantryService.seedFromPurchases).not.toHaveBeenCalled();
    expect(pantryService.revertPurchases).toHaveBeenCalledWith('u1', [
      { name: 'Tomato', quantity: 600, unit: 'g' },
    ]);
  });

  it('a pantry failure never breaks the check-off itself', async () => {
    vi.mocked(pantryService.seedFromPurchases).mockRejectedValueOnce(new Error('db down'));
    const result = await service.toggleItems(freeUser, 'plan1', ['plan1-tomato|g'], true);
    expect(result.checkedKeys).toContain('plan1-tomato|g');
  });

  it('seeds the quantity the list shows — slot portion × household scale (#38/#40)', async () => {
    // A 2× slot of a 4-serving recipe for a household of 6 portions:
    // 600 g × 2 × 6/4 = 1800 g on the list, and in the pantry.
    vi.mocked(mealPlanRepository.findByIdForUser).mockResolvedValue({
      ...PLAN,
      days: [{ ...PLAN.days[0], meals: [{ type: 'dinner', recipeId: 'r1', portion: 2 }] }],
    } as never);
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([
      { ...RECIPE, servings: 4 },
    ] as never);
    vi.mocked(householdService.scalingPortions).mockResolvedValueOnce(6).mockResolvedValueOnce(6);

    await service.toggleItems(premiumUser, 'plan1', ['plan1-tomato|g'], true);

    expect(householdService.scalingPortions).toHaveBeenCalledWith(premiumUser);
    expect(pantryService.seedFromPurchases).toHaveBeenCalledWith('u1', [
      { name: 'Tomato', quantity: 1800, unit: 'g' },
    ]);

    // …and it matches the line getForWeek serves for the same plan.
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue(
      (await mealPlanRepository.findByIdForUser('u1', 'plan1')) as never,
    );
    const list = await service.getForWeek(premiumUser, 0);
    expect(list.items.find((i) => i.key === 'plan1-tomato|g')!.quantity).toBe('1800');
  });

  it('checked keys that match no list item seed nothing', async () => {
    await service.toggleItems(freeUser, 'plan1', ['plan1-nonexistent|g'], true);
    expect(pantryService.seedFromPurchases).toHaveBeenCalledWith('u1', []);
  });
});

describe('ShoppingListService — store search uses the aggregated list', () => {
  const service = new ShoppingListService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.shoppingList.findUnique).mockResolvedValue(null);
  });

  it('searches for the list lines (repeats summed, portions and household applied)', async () => {
    // The same recipe twice in the week, once at 2×, for 6 portions of a
    // 4-serving recipe: tomato 600 g × (1 + 2) × 6/4 = 2700 g — one line.
    const plan = {
      ...PLAN,
      days: [
        { ...PLAN.days[0], meals: [{ type: 'dinner', recipeId: 'r1' }] },
        {
          id: 'd1',
          mealPlanId: 'plan1',
          dayOfWeek: 1,
          meals: [{ type: 'dinner', recipeId: 'r1', portion: 2 }],
        },
      ],
    };
    vi.mocked(mealPlanRepository.findAllByUserId).mockResolvedValue([plan] as never);
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([
      { ...RECIPE, servings: 4 },
    ] as never);
    vi.mocked(householdService.scalingPortions).mockResolvedValueOnce(6);

    await service.searchStores(premiumUser, 'plan1');

    const input = vi.mocked(groceryAIService.searchNearbyStores).mock.calls[0]![0];
    expect(input.ingredients.filter((i) => i.name === 'Tomato')).toEqual([
      { name: 'Tomato', quantity: '2700', unit: 'g', category: 'produce' },
    ]);
  });
});

describe('ShoppingListService — plans made mid-week (audit F-PM-3)', () => {
  const service = new ShoppingListService();

  it('lists only the days from the plan creation day on', async () => {
    const monday = new Date('2026-09-21T00:00:00');
    const midWeekPlan = {
      ...PLAN,
      weekStartDate: monday,
      createdAt: new Date('2026-09-25T18:00:00'), // Friday
      days: [
        {
          id: 'd0',
          mealPlanId: 'plan1',
          dayOfWeek: 0,
          meals: [{ type: 'dinner', recipeId: 'r1' }],
        },
        {
          id: 'd4',
          mealPlanId: 'plan1',
          dayOfWeek: 4,
          meals: [{ type: 'dinner', recipeId: 'r1' }],
        },
      ],
    };
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue(midWeekPlan as never);
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([RECIPE] as never);
    vi.mocked(prisma.ingredientPrice.findMany).mockResolvedValue(PRICES as never);
    vi.mocked(prisma.shoppingList.findUnique).mockResolvedValue(null);
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([]);

    const list = await service.getForWeek(freeUser, 0);

    expect(list.fromDayOfWeek).toBe(4);
    // Only Friday's stew: 600 g tomato, not Monday's + Friday's 1,200 g.
    expect(list.items.find((i) => i.ingredientName === 'Tomato')?.quantity).toBe('600');
  });
});

describe('ShoppingListService — portioned plan slots (audit P1-1)', () => {
  const service = new ShoppingListService();

  it("scales a slot's ingredients by its portion and sums across slots", async () => {
    const portioned = {
      ...PLAN,
      days: [
        {
          id: 'd0',
          mealPlanId: 'plan1',
          dayOfWeek: 0,
          meals: [{ type: 'dinner', recipeId: 'r1', portion: 1.5 }],
        },
        {
          id: 'd1',
          mealPlanId: 'plan1',
          dayOfWeek: 1,
          meals: [{ type: 'dinner', recipeId: 'r1' }],
        },
      ],
    };
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue(portioned as never);
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([RECIPE] as never);
    vi.mocked(prisma.ingredientPrice.findMany).mockResolvedValue(PRICES as never);
    vi.mocked(prisma.shoppingList.findUnique).mockResolvedValue(null);
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([]);

    const list = await service.getForWeek(freeUser, 0);

    // 600 g × 1.5 + 600 g × 1 = 1,500 g tomato; 300 × 2.5 = 750 g beef.
    expect(list.items.find((i) => i.ingredientName === 'Tomato')?.quantity).toBe('1500');
    expect(list.items.find((i) => i.ingredientName === 'Beef')?.quantity).toBe('750');
  });
});

describe('carryCheckedKeys — regenerate keeps ticks (audit F-SHOP-1-5)', () => {
  it('maps ticks onto the new rows by canonical name and keeps ticked custom items', () => {
    const previous = [
      { key: 'p-eggs|large', ingredientName: 'Eggs' },
      { key: 'p-olive oil|tbsp', ingredientName: 'Olive oil' },
      { key: 'p-rice|g', ingredientName: 'Rice' },
      { key: 'p-custom-soap-pcs', ingredientName: 'Soap', isCustom: true },
    ];
    const next = [
      { key: 'p-ai-egg-large', ingredientName: 'Egg' },
      { key: 'p-ai-olive-oil-ml', ingredientName: 'Olive oil' },
      { key: 'p-ai-rice-g', ingredientName: 'Rice' },
    ];
    expect(
      carryCheckedKeys(['p-eggs|large', 'p-olive oil|tbsp', 'p-custom-soap-pcs'], previous, next),
    ).toEqual(['p-ai-egg-large', 'p-ai-olive-oil-ml', 'p-custom-soap-pcs']);
  });
});

describe('ShoppingListService — household scaling (P2-3, audit F-PM-5)', () => {
  const service = new ShoppingListService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.shoppingList.findUnique).mockResolvedValue(null);
    vi.mocked(pantryItemRepository.findByUser).mockResolvedValue([]);
    vi.mocked(householdService.scalingPortions).mockResolvedValue(null);
  });

  it('a premium household gets a curated (1-serving) recipe scaled to the table, and the portions', async () => {
    planWithRecipes();
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([
      { ...RECIPE, servings: 1 },
    ] as never);
    vi.mocked(householdService.scalingPortions).mockResolvedValue(3);

    const list = await service.getForWeek(premiumUser, 0);

    const tomato = list.items.find((i) => i.ingredientName === 'Tomato')!;
    expect(tomato.quantity).toBe('1800');
    // (1800 g × €0.5 + 900 g × €2) / 100 = €27 — for 3 portions, so €9 each.
    expect(list.estimatedTotalEur).toBe(27);
    expect(list.portions).toBe(3);
  });

  it('a recipe already generated for the table is not scaled twice', async () => {
    planWithRecipes();
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([
      { ...RECIPE, servings: 3 },
    ] as never);
    vi.mocked(householdService.scalingPortions).mockResolvedValue(3);

    const list = await service.getForWeek(premiumUser, 0);

    expect(list.items.find((i) => i.ingredientName === 'Tomato')!.quantity).toBe('600');
    expect(list.estimatedTotalEur).toBe(9);
  });

  it('composes with the P1-1 slot portion: 1.5× slot × 2-portion table = 3× for premium, 1.5× for free', async () => {
    const portioned = {
      ...PLAN,
      days: [
        {
          id: 'd0',
          mealPlanId: 'plan1',
          dayOfWeek: 0,
          meals: [{ type: 'dinner', recipeId: 'r1', portion: 1.5 }],
        },
      ],
    };
    const recipe = { ...RECIPE, servings: 1 };
    planWithRecipes();
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue(portioned as never);
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([recipe] as never);
    // The plan chip prices the same slots through estimatePlanCostEur.
    const planDays = [{ meals: [{ recipe, portion: 1.5 }] }];

    vi.mocked(householdService.scalingPortions).mockResolvedValue(2);
    const premium = await service.getForWeek(premiumUser, 0);
    expect(premium.items.find((i) => i.ingredientName === 'Tomato')!.quantity).toBe('1800');
    expect(premium.items.find((i) => i.ingredientName === 'Beef')!.quantity).toBe('900');
    // (1800 × €0.5 + 900 × €2) / 100 = €27, and the plan chip agrees.
    expect(premium.estimatedTotalEur).toBe(27);
    const premiumChip = await estimatePlanCostEur(planDays, { portions: 2 });
    expect(premiumChip.totalEur).toBe(premium.estimatedTotalEur);

    vi.mocked(householdService.scalingPortions).mockResolvedValue(null);
    const free = await service.getForWeek(freeUser, 0);
    expect(free.items.find((i) => i.ingredientName === 'Tomato')!.quantity).toBe('900');
    expect(free.estimatedTotalEur).toBe(13.5);
    const freeChip = await estimatePlanCostEur(planDays);
    expect(freeChip.totalEur).toBe(free.estimatedTotalEur);
  });

  it('free households (and solo users) keep recipes as written, with no portions field', async () => {
    planWithRecipes();
    vi.mocked(mealPlanRepository.findRecipesByIds).mockResolvedValue([
      { ...RECIPE, servings: 1 },
    ] as never);

    const list = await service.getForWeek(freeUser, 0);

    expect(householdService.scalingPortions).toHaveBeenCalledWith(freeUser);
    expect(list.items.find((i) => i.ingredientName === 'Tomato')!.quantity).toBe('600');
    expect(list).not.toHaveProperty('portions');
  });
});
