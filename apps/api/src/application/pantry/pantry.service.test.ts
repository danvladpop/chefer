import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import type { IMealPlanRepository, IPantryItemRepository, PantryItem } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { PantryService } from './pantry.service.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      ingredientPrice: { findMany: vi.fn().mockResolvedValue([]) },
    },
  };
});

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

const DAY = 24 * 60 * 60 * 1000;

const pantryRow = (name: string, over: Partial<PantryItem> = {}): PantryItem => ({
  id: `p-${name}`,
  userId: 'u1',
  ingredientName: name,
  quantity: 500,
  unit: 'g',
  source: 'PURCHASE',
  updatedAt: new Date(Date.now() - 2 * DAY),
  ...over,
});

function makeRepo(items: PantryItem[] = []): IPantryItemRepository {
  return {
    findByUser: vi.fn().mockResolvedValue(items),
    findByIds: vi.fn().mockResolvedValue([]),
    countByUser: vi.fn().mockResolvedValue(items.length),
    upsert: vi.fn().mockImplementation((data) => Promise.resolve(pantryRow(data.ingredientName))),
    upsertMany: vi.fn().mockResolvedValue(undefined),
    deleteById: vi.fn().mockResolvedValue(undefined),
    deleteByIds: vi.fn().mockResolvedValue(undefined),
    deleteByIngredientName: vi.fn().mockResolvedValue(1),
    decayToSome: vi.fn().mockResolvedValue(undefined),
  };
}

function makePlanRepo(over: Partial<IMealPlanRepository> = {}): IMealPlanRepository {
  return {
    findActiveWithDays: vi.fn().mockResolvedValue(null),
    findByWeekStart: vi.fn().mockResolvedValue(null),
    findRecipesByIds: vi.fn().mockResolvedValue([]),
    ...over,
  } as unknown as IMealPlanRepository;
}

describe('PantryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Seeding from check-offs ────────────────────────────────────────────────

  it('seedFromPurchases upserts checked items as PURCHASE with normalized names', async () => {
    const repo = makeRepo();
    const service = new PantryService(repo, makePlanRepo());
    const written = await service.seedFromPurchases('u1', [
      { name: '  Chicken  Breast ', quantity: 500, unit: ' G ' },
      { name: 'Tomato', quantity: 6, unit: 'pcs' },
    ]);
    expect(written).toBe(2);
    expect(repo.upsertMany).toHaveBeenCalledWith([
      {
        userId: 'u1',
        ingredientName: 'chicken breast',
        quantity: 500,
        unit: 'g',
        source: 'PURCHASE',
      },
      { userId: 'u1', ingredientName: 'tomato', quantity: 6, unit: 'pcs', source: 'PURCHASE' },
    ]);
  });

  it('seedFromPurchases never tracks staples (salt, pepper, oil, water…)', async () => {
    const repo = makeRepo();
    const service = new PantryService(repo, makePlanRepo());
    const written = await service.seedFromPurchases('u1', [
      { name: 'Salt', quantity: 1, unit: 'pinch' },
      { name: 'Olive oil', quantity: 3, unit: 'tbsp' },
      { name: 'black pepper', quantity: 1, unit: 'tsp' },
      { name: 'Water', quantity: 500, unit: 'ml' },
      { name: 'Basil', quantity: 20, unit: 'g' },
    ]);
    expect(written).toBe(1);
    const rows = vi.mocked(repo.upsertMany).mock.calls[0]![0];
    expect(rows.map((r) => r.ingredientName)).toEqual(['basil']);
  });

  it('seedFromPurchases stores unparseable quantities as the "some" state (0)', async () => {
    const repo = makeRepo();
    const service = new PantryService(repo, makePlanRepo());
    await service.seedFromPurchases('u1', [{ name: 'rice', quantity: NaN, unit: 'g' }]);
    expect(vi.mocked(repo.upsertMany).mock.calls[0]![0][0]).toMatchObject({ quantity: 0 });
  });

  // ── Manual management ──────────────────────────────────────────────────────

  it('addManual rejects staples with a friendly message', async () => {
    const service = new PantryService(makeRepo(), makePlanRepo());
    await expect(service.addManual('u1', { name: 'Olive Oil', unit: 'ml' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('addManual writes a MANUAL row (missing quantity → "some")', async () => {
    const repo = makeRepo();
    const service = new PantryService(repo, makePlanRepo());
    await service.addManual('u1', { name: ' Arborio Rice ', unit: 'G' });
    expect(repo.upsert).toHaveBeenCalledWith({
      userId: 'u1',
      ingredientName: 'arborio rice',
      quantity: 0,
      unit: 'g',
      source: 'MANUAL',
    });
  });

  // ── Weekly confirm (honest v1 depletion) ───────────────────────────────────

  it('confirmWeekly clears tapped ids and decays only week-old real quantities', async () => {
    const fresh = pantryRow('feta'); // 2 days old, qty 500
    const stale = pantryRow('rice', { updatedAt: new Date(Date.now() - 12 * DAY) });
    const alreadySome = pantryRow('lentils', {
      quantity: 0,
      updatedAt: new Date(Date.now() - 30 * DAY),
    });
    const repo = makeRepo([fresh, stale, alreadySome]);
    const service = new PantryService(repo, makePlanRepo());

    const result = await service.confirmWeekly('u1', ['p-gone']);

    expect(repo.deleteByIds).toHaveBeenCalledWith('u1', ['p-gone']);
    // Only the stale row with a real quantity decays; fresh keeps its grams
    // and the already-"some" row is left alone.
    expect(repo.decayToSome).toHaveBeenCalledWith('u1', [stale.id]);
    expect(result.remaining).toBe(3);
  });

  // ── whatCanIMake (chat tool) ───────────────────────────────────────────────

  it('whatCanIMake tells the truth about an empty pantry', async () => {
    const service = new PantryService(makeRepo([]), makePlanRepo());
    const answer = await service.whatCanIMake(premiumUser);
    expect(answer).toContain('pantry is empty');
  });

  it('whatCanIMake gives free users an honest teaser, not the ranking', async () => {
    const service = new PantryService(makeRepo([pantryRow('tomato')]), makePlanRepo());
    const answer = await service.whatCanIMake(freeUser);
    expect(answer).toContain('premium');
    expect(answer).toContain('1 item');
  });

  it('whatCanIMake ranks the active plan recipes by pantry coverage (premium)', async () => {
    const repo = makeRepo([pantryRow('halloumi'), pantryRow('couscous')]);
    const planRepo = makePlanRepo({
      findActiveWithDays: vi.fn().mockResolvedValue({
        id: 'plan1',
        days: [{ meals: [{ type: 'dinner', recipeId: 'r1' }] }],
      }),
      findRecipesByIds: vi.fn().mockResolvedValue([
        {
          id: 'r1',
          name: 'Halloumi Couscous Bowl',
          ingredients: [
            { name: 'halloumi', quantity: 200, unit: 'g' },
            { name: 'couscous', quantity: 150, unit: 'g' },
            { name: 'salt', quantity: 1, unit: 'pinch' },
          ],
        },
      ]),
    });
    const service = new PantryService(repo, planRepo);
    const answer = await service.whatCanIMake(premiumUser);
    // Fully covered (staples assumed on hand) → it must top the answer.
    expect(answer.split('\n')[1]).toContain('Halloumi Couscous Bowl');
    expect(answer).toContain('everything on hand');
  });

  // ── Week savings (list header + ChefReview.savedEur seam) ─────────────────

  it('computeWeekPantrySavings sums the estimated prices of covered plan lines', async () => {
    const repo = makeRepo([pantryRow('tomato')]);
    const planRepo = makePlanRepo({
      findByWeekStart: vi.fn().mockResolvedValue({
        id: 'plan1',
        days: [
          { meals: [{ type: 'dinner', recipeId: 'r1' }] },
          { meals: [{ type: 'lunch', recipeId: 'r1' }] },
        ],
      }),
      findRecipesByIds: vi.fn().mockResolvedValue([
        {
          id: 'r1',
          name: 'Tomato Stew',
          ingredients: [
            { name: 'Tomato', quantity: 300, unit: 'g' },
            { name: 'beef', quantity: 400, unit: 'g' },
          ],
        },
      ]),
    });
    vi.mocked(prisma.ingredientPrice.findMany).mockResolvedValue([
      { ingredientName: 'tomato', pricePer100gEur: 0.5 } as never,
    ]);
    const service = new PantryService(repo, planRepo);

    // Two slots × 300 g tomato = 600 g at €0.5/100g → €3; beef not covered.
    expect(await service.computeWeekPantrySavings('u1', new Date())).toBe(3);
  });

  it('computeWeekPantrySavings: null without a plan, 0 with an empty pantry', async () => {
    const service = new PantryService(makeRepo([]), makePlanRepo());
    expect(await service.computeWeekPantrySavings('u1', new Date())).toBeNull();

    const planRepo = makePlanRepo({
      findByWeekStart: vi.fn().mockResolvedValue({ id: 'plan1', days: [] }),
    });
    const service2 = new PantryService(makeRepo([]), planRepo);
    expect(await service2.computeWeekPantrySavings('u1', new Date())).toBe(0);
  });
});
