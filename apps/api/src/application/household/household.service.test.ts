import { describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import type { RecipeData } from '../../lib/ai/types.js';
import { filterSafeRecipes } from '../../lib/curated-recipes/safety.js';
import {
  computeHouseholdContext,
  derivedServingSize,
  HouseholdService,
  legacyServingSizePlaceholders,
  mergeHouseholdSafety,
  type HouseholdMemberSafety,
} from './household.service.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const freeUser: UserProfile = {
  id: 'user-free',
  email: 'free@test.dev',
  name: 'Free',
  firstName: 'Free',
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const premiumUser: UserProfile = { ...freeUser, id: 'user-prem', planTier: 'PREMIUM' };

const member = (over: Partial<HouseholdMemberSafety> = {}): HouseholdMemberSafety => ({
  name: 'Maria',
  portionFactor: 1,
  allergies: [],
  dietaryRestrictions: [],
  dislikedIngredients: [],
  ...over,
});

const ownerSafety = { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] };

const recipe = (name: string, ingredients: string[], tags: string[] = []): RecipeData => ({
  id: `r-${name.toLowerCase().replace(/\s+/g, '-')}`,
  name,
  description: 'd',
  ingredients: ingredients.map((n) => ({ name: n, quantity: 100, unit: 'g' })),
  instructions: ['cook'],
  nutritionInfo: { calories: 500, protein: 30, carbs: 40, fat: 20, fiber: 5 },
  cuisineType: 'generic',
  dietaryTags: tags,
  prepTimeMins: 10,
  cookTimeMins: 10,
  servings: 1,
  imageUrl: null,
});

function makeRepo(count = 0, members: unknown[] = []) {
  return {
    findByUserId: vi.fn().mockResolvedValue(members),
    countByUserId: vi.fn().mockResolvedValue(count),
    create: vi
      .fn()
      .mockImplementation((userId: string, data: Record<string, unknown>) =>
        Promise.resolve({ id: 'member-1', userId, ...data }),
      ),
    // Mirrors the repository contract: null when at the cap.
    createWithinCap: vi
      .fn()
      .mockImplementation((userId: string, data: Record<string, unknown>, cap: number | null) =>
        Promise.resolve(cap !== null && count >= cap ? null : { id: 'member-1', userId, ...data }),
      ),
    update: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(false),
    migrateLegacyServingSize: vi.fn().mockResolvedValue(0),
    findUserIdsWithLegacyServingSize: vi.fn().mockResolvedValue([]),
  };
}

// ─── Portion math ─────────────────────────────────────────────────────────────

describe('computeHouseholdContext — portion math', () => {
  it('returns undefined with no members (the seam stays absent)', () => {
    expect(computeHouseholdContext([], ownerSafety)).toBeUndefined();
  });

  it('portionSum is ceil of the factor sum INCLUDING the owner as 1', () => {
    // 1 (owner) + 1 + 0.5 = 2.5 → 3
    const ctx = computeHouseholdContext(
      [member({ portionFactor: 1 }), member({ name: 'Timmy', portionFactor: 0.5 })],
      ownerSafety,
    );
    expect(ctx?.portionSum).toBe(3);
    expect(ctx?.memberCount).toBe(2);
  });

  it('an exact integer sum does not round up an extra portion', () => {
    // 1 + 1 + 1 = 3 → 3, not 4
    const ctx = computeHouseholdContext([member(), member({ name: 'Alex' })], ownerSafety);
    expect(ctx?.portionSum).toBe(3);
  });

  it('big eaters round the table up', () => {
    // 1 + 1.5 + 1.5 = 4 → 4; 1 + 1.25 = 2.25 → 3
    expect(
      computeHouseholdContext(
        [member({ portionFactor: 1.5 }), member({ name: 'Bo', portionFactor: 1.5 })],
        ownerSafety,
      )?.portionSum,
    ).toBe(4);
    expect(
      computeHouseholdContext([member({ portionFactor: 1.25 })], ownerSafety)?.portionSum,
    ).toBe(3);
  });
});

// ─── Merged safety ────────────────────────────────────────────────────────────

describe('mergeHouseholdSafety — the hard union', () => {
  it('unions allergies and restrictions across owner + every member, deduped case-insensitively', () => {
    const merged = mergeHouseholdSafety(
      {
        allergies: ['Shellfish'],
        dietaryRestrictions: ['Vegetarian'],
        dislikedIngredients: ['okra'],
      },
      [
        member({ allergies: ['peanuts', 'shellfish'], dietaryRestrictions: ['Vegan'] }),
        member({ name: 'Timmy', allergies: ['Peanuts'] }),
      ],
    );
    expect(merged.allergies).toEqual(['Shellfish', 'peanuts']);
    expect(merged.dietaryRestrictions).toEqual(['Vegetarian', 'Vegan']);
  });

  it("member dislikes stay soft — only the owner's dislikes survive into SafetyPrefs", () => {
    const merged = mergeHouseholdSafety(
      { allergies: [], dietaryRestrictions: [], dislikedIngredients: ['okra'] },
      [member({ dislikedIngredients: ['mushrooms'] })],
    );
    expect(merged.dislikedIngredients).toEqual(['okra']);
  });

  it("a member's allergen excludes a recipe through filterSafeRecipes (unchanged)", () => {
    const pool = [
      recipe('Peanut Chicken Satay', ['chicken breast', 'peanut butter']),
      // Vegan-compliant but allergen-bearing — only the ALLERGY excludes it.
      recipe('Almond Oat Granola', ['almonds', 'oats', 'maple syrup'], ['vegan']),
      recipe('Vegan Tofu Bowl', ['tofu', 'rice', 'broccoli'], ['vegan']),
    ];
    // Owner eats everything; the member is vegan with a nut allergy (the §5
    // acceptance household).
    const merged = mergeHouseholdSafety(ownerSafety, [
      member({ allergies: ['peanuts', 'nuts'], dietaryRestrictions: ['Vegan'] }),
    ]);
    const safe = filterSafeRecipes(pool, merged);
    expect(safe.map((r) => r.name)).toEqual(['Vegan Tofu Bowl']);
    // Owner alone would have kept everything — the exclusion is the member's.
    expect(filterSafeRecipes(pool, ownerSafety)).toHaveLength(3);
  });

  it('dislikeNotes carry who each soft dislike belongs to', () => {
    const ctx = computeHouseholdContext(
      [
        member({ name: 'Maria', dislikedIngredients: ['mushrooms', 'olives'] }),
        member({ name: 'Timmy', dislikedIngredients: [] }),
      ],
      ownerSafety,
    );
    expect(ctx?.dislikeNotes).toEqual(['avoid mushrooms, olives for Maria']);
  });
});

// ─── CRUD + limit enforcement ─────────────────────────────────────────────────

describe('HouseholdService — member limit (matrix householdMembers)', () => {
  it('free tier CAN add members — their safety is never premium (P2-3)', async () => {
    const repo = makeRepo();
    const service = new HouseholdService(repo);

    const created = await service.add(freeUser, {
      name: 'Sam',
      portionFactor: 0.5,
      isKid: true,
      allergies: ['peanuts'],
    });

    expect(repo.createWithinCap).toHaveBeenCalledWith(
      'user-free',
      { name: 'Sam', portionFactor: 0.5, isKid: true, allergies: ['peanuts'] },
      5,
    );
    expect(created).toMatchObject({ name: 'Sam', allergies: ['peanuts'] });
  });

  it('under the cap creates the member through the race-free insert', async () => {
    const repo = makeRepo(4); // 4 existing < 5 cap
    const service = new HouseholdService(repo);

    const created = await service.add(premiumUser, { name: 'Maria', portionFactor: 0.5 });

    expect(repo.createWithinCap).toHaveBeenCalledWith(
      'user-prem',
      { name: 'Maria', portionFactor: 0.5 },
      5,
    );
    expect(repo.create).not.toHaveBeenCalled();
    expect(created).toMatchObject({ id: 'member-1', name: 'Maria' });
  });

  it('AT the cap (5) is rejected with the cap in the message', async () => {
    const repo = makeRepo(5);
    const service = new HouseholdService(repo);

    await expect(service.add(premiumUser, { name: 'One More' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('5'),
    });
    await expect(service.add(freeUser, { name: 'One More' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it("update/remove of another user's member surface NOT_FOUND (ownership-scoped repo)", async () => {
    const repo = makeRepo();
    const service = new HouseholdService(repo);

    await expect(service.update('user-prem', 'not-mine', { name: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.remove('user-prem', 'not-mine')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─── Scaling is premium ───────────────────────────────────────────────────────

describe('HouseholdService.scalingPortions', () => {
  const table = [
    { name: 'Maria', portionFactor: 1 },
    { name: 'Sam', portionFactor: 0.5 },
  ];

  it('premium with members scales to the table portion sum', async () => {
    const service = new HouseholdService(makeRepo(2, table));
    expect(await service.scalingPortions(premiumUser)).toBe(3);
  });

  it('free households are never scaled (their safety still applies)', async () => {
    const repo = makeRepo(2, table);
    const service = new HouseholdService(repo);
    expect(await service.scalingPortions(freeUser)).toBeNull();
    expect(repo.findByUserId).not.toHaveBeenCalled();
  });

  it('premium without members has nothing to scale', async () => {
    const service = new HouseholdService(makeRepo(0, []));
    expect(await service.scalingPortions(premiumUser)).toBeNull();
  });
});

// ─── One people model: legacy servingSize (F-PM-8) ────────────────────────────

describe('legacy servingSize → placeholder members', () => {
  it('servingSize N becomes N − 1 standard-portion placeholders (owner is person 1)', () => {
    expect(legacyServingSizePlaceholders(3)).toEqual([
      { name: 'Person 2', portionFactor: 1, isKid: false },
      { name: 'Person 3', portionFactor: 1, isKid: false },
    ]);
  });

  it('is deterministic, empty for 1 and capped at the member limit', () => {
    expect(legacyServingSizePlaceholders(1)).toEqual([]);
    expect(legacyServingSizePlaceholders(0)).toEqual([]);
    expect(legacyServingSizePlaceholders(6)).toHaveLength(5);
    expect(legacyServingSizePlaceholders(6, 2)).toHaveLength(2);
    expect(legacyServingSizePlaceholders(4)).toEqual(legacyServingSizePlaceholders(4));
  });

  it('the derived servingSize old app builds read is the table, capped at 6', () => {
    expect(derivedServingSize([])).toBe(1);
    expect(derivedServingSize([{ portionFactor: 1 }, { portionFactor: 0.5 }])).toBe(3);
    expect(derivedServingSize(Array.from({ length: 5 }, () => ({ portionFactor: 1.5 })))).toBe(6);
  });

  it('list() converts a legacy servingSize before reading members', async () => {
    const repo = makeRepo();
    const order: string[] = [];
    repo.migrateLegacyServingSize.mockImplementation(async () => {
      order.push('migrate');
      return 2;
    });
    repo.findByUserId.mockImplementation(async () => {
      order.push('find');
      return [];
    });
    await new HouseholdService(repo).list('user-free');
    expect(order).toEqual(['migrate', 'find']);
    // The placeholder factory handed to the repository is the pure helper.
    const factory = repo.migrateLegacyServingSize.mock.calls[0]?.[1] as (n: number) => unknown;
    expect(factory(3)).toEqual(legacyServingSizePlaceholders(3));
  });

  it('a failed migration never breaks the read', async () => {
    const repo = makeRepo();
    repo.migrateLegacyServingSize.mockRejectedValue(new Error('db down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(new HouseholdService(repo).list('user-free')).resolves.toEqual([]);
    errorSpy.mockRestore();
  });

  it('the startup backfill converts every legacy user once and terminates', async () => {
    const repo = makeRepo();
    repo.findUserIdsWithLegacyServingSize
      .mockResolvedValueOnce(['u1', 'u2'])
      .mockResolvedValueOnce(['u2']) // a failed conversion comes back — not retried forever
      .mockResolvedValue([]);
    repo.migrateLegacyServingSize.mockImplementation(async (id: string) => (id === 'u1' ? 2 : 0));
    const result = await new HouseholdService(repo).backfillLegacyServingSizes(2);
    expect(result).toEqual({ users: 2, members: 2 });
    expect(repo.migrateLegacyServingSize).toHaveBeenCalledTimes(2);
  });
});
