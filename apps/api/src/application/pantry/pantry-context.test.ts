import { describe, expect, it, vi } from 'vitest';
import type { IPantryItemRepository, PantryItem } from '@chefer/database';
import {
  computeUsedPantryItems,
  getUseFirstIngredients,
  useFirstReason,
} from './pantry-context.js';

// The provider talks only to the repository interface — a plain stub keeps
// the test DB-free (interface-driven repositories, CLAUDE.md rule 3).

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-23T12:00:00Z');

const item = (name: string, ageDays: number, quantity = 500, unit = 'g'): PantryItem => ({
  id: `p-${name}`,
  userId: 'u1',
  ingredientName: name,
  quantity,
  unit,
  source: 'PURCHASE',
  updatedAt: new Date(NOW.getTime() - ageDays * DAY),
});

/** findByUser must return oldest-first — mirror the real repository's order. */
const repoWith = (items: PantryItem[]): IPantryItemRepository =>
  ({
    findByUser: vi
      .fn()
      .mockResolvedValue([...items].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())),
  }) as unknown as IPantryItemRepository;

describe('getUseFirstIngredients (the household-loader seam, F3)', () => {
  it('returns the top-N OLDEST items in MealPlanInput.useFirstIngredients shape', async () => {
    const repo = repoWith([
      item('rice', 20),
      item('tomato', 3),
      item('chicken breast', 10),
      item('lentils', 30),
      item('feta', 1),
      item('spinach', 5),
    ]);
    const result = await getUseFirstIngredients('u1', 5, repo);

    expect(result.map((r) => r.name)).toEqual([
      'lentils',
      'rice',
      'chicken breast',
      'spinach',
      'tomato',
    ]);
    expect(result).toHaveLength(5); // feta (newest) dropped by the limit
    for (const entry of result) {
      expect(entry).toEqual({
        name: expect.any(String),
        quantity: expect.any(Number),
        unit: expect.any(String),
        reason: expect.any(String),
      });
    }
  });

  it('returns an empty array for an empty pantry (prompt stays byte-identical)', async () => {
    expect(await getUseFirstIngredients('u1', 5, repoWith([]))).toEqual([]);
  });
});

describe('useFirstReason', () => {
  it('describes age buckets and the "some" state', () => {
    expect(useFirstReason(new Date(NOW.getTime() - 2 * DAY), 500, NOW)).toBe('bought this week');
    expect(useFirstReason(new Date(NOW.getTime() - 10 * DAY), 500, NOW)).toBe('bought last week');
    expect(useFirstReason(new Date(NOW.getTime() - 22 * DAY), 500, NOW)).toBe(
      'in the kitchen for 3 weeks',
    );
    expect(useFirstReason(new Date(NOW.getTime() - 2 * DAY), 0, NOW)).toBe('some left — use it up');
  });
});

describe('computeUsedPantryItems (response personalisation, F3)', () => {
  const days = [
    {
      meals: [
        {
          recipe: {
            ingredients: [{ name: 'Cherry Tomatoes' }, { name: 'spaghetti' }],
          },
        },
        { recipe: { ingredients: [{ name: 'chicken breast' }, { name: 'rice' }] } },
      ],
    },
    { meals: [{ recipe: { ingredients: [{ name: 'chicken breast' }] } }] },
  ];

  it('returns each covered pantry item once, in pantry (use-first) order', () => {
    const used = computeUsedPantryItems(days, ['rice', 'tomato', 'chicken breast', 'lentils']);
    expect(used).toEqual(['rice', 'tomato', 'chicken breast']);
  });

  it('returns [] when the plan uses nothing from the pantry', () => {
    expect(computeUsedPantryItems(days, ['beef'])).toEqual([]);
  });
});
