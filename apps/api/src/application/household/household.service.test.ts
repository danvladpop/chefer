import { describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import type { RecipeData } from '../../lib/ai/types.js';
import { filterSafeRecipes } from '../../lib/curated-recipes/safety.js';
import {
  computeHouseholdContext,
  HouseholdService,
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

function makeRepo(count = 0) {
  return {
    findByUserId: vi.fn().mockResolvedValue([]),
    countByUserId: vi.fn().mockResolvedValue(count),
    create: vi
      .fn()
      .mockImplementation((userId: string, data: Record<string, unknown>) =>
        Promise.resolve({ id: 'member-1', userId, ...data }),
      ),
    update: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(false),
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
  it('free tier cannot add members (limit 0 → FORBIDDEN)', async () => {
    const repo = makeRepo();
    const service = new HouseholdService(repo as never);

    await expect(service.add(freeUser, { name: 'Maria' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('premium under the cap creates the member', async () => {
    const repo = makeRepo(4); // 4 existing < 5 cap
    const service = new HouseholdService(repo as never);

    const created = await service.add(premiumUser, { name: 'Maria', portionFactor: 0.5 });

    expect(repo.create).toHaveBeenCalledWith('user-prem', { name: 'Maria', portionFactor: 0.5 });
    expect(created).toMatchObject({ id: 'member-1', name: 'Maria' });
  });

  it('premium AT the cap (5) is rejected and nothing is created', async () => {
    const repo = makeRepo(5);
    const service = new HouseholdService(repo as never);

    await expect(service.add(premiumUser, { name: 'One More' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('5'),
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("update/remove of another user's member surface NOT_FOUND (ownership-scoped repo)", async () => {
    const repo = makeRepo();
    const service = new HouseholdService(repo as never);

    await expect(service.update('user-prem', 'not-mine', { name: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.remove('user-prem', 'not-mine')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
