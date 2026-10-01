import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogListWhere, IngredientRepository } from './ingredient.repository';

// The Ingredients page listing (plan-ingredient-catalog §10): owner-scoped
// (I4), ACTIVE only, private rows first, one extra row to detect hasMore.

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../client', () => ({ prisma: { ingredient: { findMany } } }));

beforeEach(() => findMany.mockReset());

describe('catalogListWhere', () => {
  it('scopes to globals + the owner’s rows, ACTIVE only', () => {
    expect(catalogListWhere('u1', {})).toEqual({
      status: 'ACTIVE',
      OR: [{ ownerId: null }, { ownerId: 'u1' }],
    });
  });

  it('mineOnly keeps only the owner’s private rows', () => {
    expect(catalogListWhere('u1', { mineOnly: true })).toEqual({
      status: 'ACTIVE',
      ownerId: 'u1',
    });
  });

  it('searches visible aliases by key or the display name, inside the scope', () => {
    expect(
      catalogListWhere('u1', { key: 'usturoi', text: 'Usturoi', category: 'VEGETABLE' }),
    ).toEqual({
      status: 'ACTIVE',
      OR: [{ ownerId: null }, { ownerId: 'u1' }],
      category: 'VEGETABLE',
      AND: [
        {
          OR: [
            {
              aliases: {
                some: {
                  alias: { contains: 'usturoi' },
                  OR: [{ ownerId: null }, { ownerId: 'u1' }],
                },
              },
            },
            { name: { contains: 'Usturoi', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });
});

describe('IngredientRepository.listVisible', () => {
  it('fetches limit + 1 rows, private first, and reports hasMore', async () => {
    findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const page = await new IngredientRepository().listVisible('u1', { limit: 2, offset: 4 });
    expect(page).toEqual({ rows: [{ id: 'a' }, { id: 'b' }], hasMore: true });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 4,
        take: 3,
        orderBy: [{ ownerId: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('no extra row → no more pages', async () => {
    findMany.mockResolvedValue([{ id: 'a' }]);
    const page = await new IngredientRepository().listVisible('u1', { limit: 2, offset: 0 });
    expect(page.hasMore).toBe(false);
  });
});
