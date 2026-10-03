import type { Prisma, Recipe } from '@prisma/client';
import { RecipeSource } from '@prisma/client';
import { prisma } from '../client';
import type { SocialKeysetCursor } from './social-profile.repository';

// ─── Following: another user's shared recipes (docs/friends/implementation-plan.md §5) ─
// Read-only. "Shared" = the owner's own recipes as Following shows them
// (PRD FR-16): `source: MANUAL`, written OR imported (`sourceUrl` set, Q-F-7),
// never a copy of someone else's recipe (`originRecipeId: null`) and never an
// auto-hidden one (`hiddenAt: null`, PRD §9). Newest first, keyset on
// `(createdAt, id)` (plan §4.5), served by `@@index([creatorId, source, createdAt])`.

export interface ListSharedRecipesOptions {
  /** Case-insensitive name substring. Blank = no filter. */
  search?: string | undefined;
  /** The `(createdAt, id)` of the previous page's last row. */
  cursor?: SocialKeysetCursor | null | undefined;
  limit: number;
}

export interface IFriendRecipeRepository {
  /** The owner's shared recipes, newest first (`createdAt desc, id desc`), at most `limit`. */
  listShared(ownerId: string, opts: ListSharedRecipesOptions): Promise<Recipe[]>;
  /** How many shared recipes the owner has (the profile's `recipeCount`). */
  countShared(ownerId: string): Promise<number>;
}

function sharedWhere(ownerId: string): Prisma.RecipeWhereInput {
  return {
    creatorId: ownerId,
    source: RecipeSource.MANUAL,
    originRecipeId: null,
    hiddenAt: null,
    deletedAt: null,
  };
}

export class FriendRecipeRepository implements IFriendRecipeRepository {
  async listShared(ownerId: string, opts: ListSharedRecipesOptions): Promise<Recipe[]> {
    const search = opts.search?.trim();
    const { cursor } = opts;
    return prisma.recipe.findMany({
      where: {
        AND: [
          sharedWhere(ownerId),
          ...(search ? [{ name: { contains: search, mode: 'insensitive' as const } }] : []),
          ...(cursor
            ? [
                {
                  OR: [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.max(0, opts.limit),
    });
  }

  async countShared(ownerId: string): Promise<number> {
    return prisma.recipe.count({ where: sharedWhere(ownerId) });
  }
}

export const friendRecipeRepository = new FriendRecipeRepository();
