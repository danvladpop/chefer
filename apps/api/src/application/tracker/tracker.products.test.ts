import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository, packagedProductRepository } from '@chefer/database';
import type { DailyLog, LoggedMealEntry, PackagedProduct } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { trackerService } from './tracker.service.js';

// ADR 0002: logging a packaged product appends an ordinary custom entry (what
// every shipped client already totals and edits) plus `product: { id, grams }`.

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  chefProfileRepository: { findByUserId: vi.fn().mockResolvedValue(null) },
  mealPlanRepository: {
    findForWeek: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
  },
  dailyLogRepository: { findLastN: vi.fn(), mutateDayState: vi.fn() },
  packagedProductRepository: { findVisibleById: vi.fn() },
}));
const products = {
  getVisible: {
    mockResolvedValue: (row: PackagedProduct | null) =>
      vi.mocked(packagedProductRepository.findVisibleById).mockResolvedValue(row),
  },
};

const USER: UserProfile = {
  id: 'u1',
  email: 'products-test@chefer.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};

function product(overrides: Partial<PackagedProduct> = {}): PackagedProduct {
  return {
    id: 'p1',
    barcode: '7394376616037',
    name: 'Oat Drink',
    brand: 'Oatly',
    kcalPer100g: 46,
    proteinPer100g: 1,
    carbsPer100g: 6.7,
    fatPer100g: 1.5,
    fiberPer100g: null,
    sugarPer100g: 4,
    saturatedFatPer100g: 0.2,
    saltPer100g: 0.1,
    servingSizeG: 250,
    allergenTags: ['gluten'],
    traceTags: [],
    allergensKnown: true,
    imageUrl: null,
    source: 'OFF',
    fetchedAt: new Date(),
    ownerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

let stored: LoggedMealEntry[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  stored = [];
  vi.mocked(dailyLogRepository.mutateDayState).mockImplementation(async (_u, _d, mutate) => {
    const next = mutate({ entries: stored, skippedSlots: [] });
    stored = next.entries;
    return { loggedMeals: stored } as unknown as DailyLog;
  });
});

describe('trackerService.logProduct', () => {
  it('logs servings as a custom entry with server-scaled numbers and a product ref', async () => {
    products.getVisible.mockResolvedValue(product());
    const result = await trackerService.logProduct(USER, '2026-10-22', {
      productId: 'p1',
      amount: { unit: 'serving', servings: 2 },
      mealType: 'breakfast',
    });
    expect(result.entryId).toBeTruthy();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      custom: { name: 'Oatly Oat Drink, 2 servings (500 g)', estimatedBy: 'manual' },
      mealType: 'breakfast',
      kcal: 230,
      protein: 5,
      carbs: 33.5,
      fat: 7.5,
      product: { id: 'p1', grams: 500 },
    });
    expect(stored[0]!.unknownMacros).toBeUndefined();
  });

  it('flags macros the product does not state as unknown, not zero-by-accident', async () => {
    products.getVisible.mockResolvedValue(
      product({ proteinPer100g: null, fatPer100g: null }),
    );
    await trackerService.logProduct(USER, '2026-10-22', {
      productId: 'p1',
      amount: { unit: 'g', grams: 150 },
      mealType: 'snack',
    });
    expect(stored[0]).toMatchObject({ protein: 0, fat: 0, unknownMacros: ['protein', 'fat'] });
  });

  it('refuses servings without a serving size, a product without calories, and > 5000 kcal', async () => {
    products.getVisible.mockResolvedValue(product({ servingSizeG: null }));
    await expect(
      trackerService.logProduct(USER, '2026-10-22', {
        productId: 'p1',
        amount: { unit: 'serving', servings: 1 },
        mealType: 'lunch',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    products.getVisible.mockResolvedValue(product({ kcalPer100g: null }));
    await expect(
      trackerService.logProduct(USER, '2026-10-22', {
        productId: 'p1',
        amount: { unit: 'g', grams: 100 },
        mealType: 'lunch',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    products.getVisible.mockResolvedValue(product({ kcalPer100g: 900 }));
    await expect(
      trackerService.logProduct(USER, '2026-10-22', {
        productId: 'p1',
        amount: { unit: 'g', grams: 1000 },
        mealType: 'lunch',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(stored).toHaveLength(0);
  });

  it('replaces a plan slot when asked (WP-06)', async () => {
    products.getVisible.mockResolvedValue(product());
    await trackerService.logProduct(USER, '2026-10-22', {
      productId: 'p1',
      amount: { unit: 'g', grams: 100 },
      mealType: 'snack',
      replacesSlot: { mealType: 'lunch', slotIndex: 1 },
    });
    expect(stored[0]).toMatchObject({ mealType: 'lunch', replacesSlot: { mealType: 'lunch', slotIndex: 1 } });
  });
});

it("someone else's private product answers NOT_FOUND", async () => {
  products.getVisible.mockResolvedValue(null);
  await expect(
    trackerService.logProduct(USER, '2026-10-22', {
      productId: 'theirs',
      amount: { unit: 'g', grams: 100 },
      mealType: 'snack',
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

describe('trackerService.recents with products', () => {
  it('carries the productId of an entry logged from a product', async () => {
    vi.mocked(dailyLogRepository.findLastN).mockResolvedValue([
      {
        date: new Date('2026-10-21T00:00:00Z'),
        loggedMeals: [
          {
            entryId: 'e1',
            custom: { name: 'Oatly Oat Drink, 250 g', estimatedBy: 'manual' },
            mealType: 'breakfast',
            portionMultiplier: 1,
            kcal: 115,
            protein: 2.5,
            carbs: 16.8,
            fat: 3.8,
            product: { id: 'p1', grams: 250 },
          },
        ],
      } as unknown as DailyLog,
    ]);
    const [recent] = await trackerService.recents('u1');
    expect(recent).toMatchObject({ name: 'Oatly Oat Drink, 250 g', productId: 'p1' });
  });
});
