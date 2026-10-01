import type { Prisma, ProfileVisibility, SocialProfile } from '@prisma/client';
import { prisma } from '../client';

// ─── Following: social profiles (docs/friends/implementation-plan.md §2.4) ────
// One row = the user turned Following on. This file also holds the small
// shared vocabulary of the Following repositories (the transaction client
// type, the keyset cursor and the public user fields), so the other six
// repositories import it from here.

/**
 * A Prisma client usable both outside and inside `prisma.$transaction(async (tx) => …)`.
 * Write methods that a service may need to run inside its own transaction
 * (block inside report, notification upsert inside follow, …) take an optional
 * trailing `db` argument that defaults to the global client.
 */
export type SocialDbClient = Prisma.TransactionClient;

/**
 * Keyset cursor for newest-first lists (plan §4.5): the `(createdAt, id)` of the
 * last row of the previous page. Services encode it opaquely for the client.
 * For tables without an `id` column (blocks) `id` is the other user's id.
 */
export interface SocialKeysetCursor {
  createdAt: Date;
  id: string;
}

/**
 * The only user columns the Following repositories ever read about another
 * user. Never `email` (INV-6).
 */
export const socialUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  name: true,
  image: true,
} satisfies Prisma.UserSelect;

export type SocialUserRow = Prisma.UserGetPayload<{ select: typeof socialUserSelect }>;

export type SocialProfileWithUser = SocialProfile & { user: SocialUserRow };

/** Name-search keyset cursor: results are ordered `searchName ASC, userId ASC`. */
export interface SocialSearchCursor {
  searchName: string;
  userId: string;
}

export interface PopularProfileRow {
  profile: SocialProfileWithUser;
  /** Accepted followers. */
  followerCount: number;
}

export interface CreateSocialProfileData {
  userId: string;
  /** `normalizeSearchName(first, last)` from `@chefer/utils`. */
  searchName: string;
  visibility?: ProfileVisibility;
  sharePlan?: boolean;
  shareRecipes?: boolean;
  shareWorkouts?: boolean;
  shareTargets?: boolean;
  /** Chefer Kitchen only (scripts/create-chefer-kitchen.ts). */
  featured?: boolean;
}

export type UpdateSocialProfileData = Partial<Omit<CreateSocialProfileData, 'userId'>>;

export interface DeleteCascadeSocialResult {
  follows: number;
  blocks: number;
  dismissals: number;
  notifications: number;
  profile: boolean;
}

export interface ISocialProfileRepository {
  find(userId: string, db?: SocialDbClient): Promise<SocialProfile | null>;
  /** Profiles (with public user fields) for the given ids; ids without a profile are simply absent. */
  findMany(userIds: string[]): Promise<SocialProfileWithUser[]>;
  create(data: CreateSocialProfileData, db?: SocialDbClient): Promise<SocialProfile>;
  update(
    userId: string,
    data: UpdateSocialProfileData,
    db?: SocialDbClient,
  ): Promise<SocialProfile>;
  /**
   * Moderation (plan §4.6): visibility → PRIVATE and `forcedPrivateAt` = now.
   * Returns false (no write) when the profile is missing or already forced private.
   */
  forcePrivate(userId: string, db?: SocialDbClient): Promise<boolean>;
  /** Ops undo: clears `forcedPrivateAt`; visibility stays PRIVATE. Returns false when nothing changed. */
  clearForcedPrivate(userId: string, db?: SocialDbClient): Promise<boolean>;
  /**
   * Turn off Following (PRD FD-14), in ONE transaction: follows both ways, blocks
   * the user made, suggestion dismissals the user made, notifications both ways
   * and the profile. Reports and the moderation log are kept on purpose.
   * Pass `db` to run inside a caller's transaction instead of opening one.
   */
  deleteCascadeSocial(userId: string, db?: SocialDbClient): Promise<DeleteCascadeSocialResult>;
  /**
   * Name-only search (PRD §10). `tokens` are already normalised (`queryTokens`
   * from `@chefer/utils`); a profile matches when every token is a prefix of
   * some token of its `searchName`. Excludes `excludeIds` and forced-private
   * profiles. Ordered `searchName ASC, userId ASC` (keyset `cursor`); the
   * service applies the PRD ranking. Never reads `User.email`.
   */
  searchByName(
    tokens: string[],
    excludeIds: string[],
    cursor: SocialSearchCursor | null,
    limit: number,
  ): Promise<SocialProfileWithUser[]>;
  /**
   * "Popular" suggestions (PRD §11.3): PUBLIC, not forced private, owner active
   * since `activeSince`, at least `minFollowers` accepted followers — `featured`
   * profiles bypass the follower minimum. Ordered by follower count DESC.
   * Owner: L-GRAPH (W1).
   */
  popular(
    minFollowers: number,
    activeSince: Date,
    excludeIds: string[],
    limit: number,
  ): Promise<PopularProfileRow[]>;
}

/** Escapes LIKE wildcards (`%`, `_`) and the default escape character (`\\`). */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export class SocialProfileRepository implements ISocialProfileRepository {
  async find(userId: string, db: SocialDbClient = prisma): Promise<SocialProfile | null> {
    return db.socialProfile.findUnique({ where: { userId } });
  }

  async findMany(userIds: string[]): Promise<SocialProfileWithUser[]> {
    if (userIds.length === 0) return [];
    return prisma.socialProfile.findMany({
      where: { userId: { in: userIds } },
      include: { user: { select: socialUserSelect } },
    });
  }

  async create(data: CreateSocialProfileData, db: SocialDbClient = prisma): Promise<SocialProfile> {
    return db.socialProfile.create({ data });
  }

  async update(
    userId: string,
    data: UpdateSocialProfileData,
    db: SocialDbClient = prisma,
  ): Promise<SocialProfile> {
    return db.socialProfile.update({ where: { userId }, data });
  }

  async forcePrivate(userId: string, db: SocialDbClient = prisma): Promise<boolean> {
    const { count } = await db.socialProfile.updateMany({
      where: { userId, forcedPrivateAt: null },
      data: { visibility: 'PRIVATE', forcedPrivateAt: new Date() },
    });
    return count > 0;
  }

  async clearForcedPrivate(userId: string, db: SocialDbClient = prisma): Promise<boolean> {
    const { count } = await db.socialProfile.updateMany({
      where: { userId, forcedPrivateAt: { not: null } },
      data: { forcedPrivateAt: null },
    });
    return count > 0;
  }

  async deleteCascadeSocial(
    userId: string,
    db?: SocialDbClient,
  ): Promise<DeleteCascadeSocialResult> {
    const run = async (tx: SocialDbClient): Promise<DeleteCascadeSocialResult> => {
      const follows = await tx.follow.deleteMany({
        where: { OR: [{ followerId: userId }, { followeeId: userId }] },
      });
      const blocks = await tx.block.deleteMany({ where: { blockerId: userId } });
      const dismissals = await tx.suggestionDismissal.deleteMany({ where: { userId } });
      const notifications = await tx.notification.deleteMany({
        where: { OR: [{ userId }, { actorId: userId }] },
      });
      const profile = await tx.socialProfile.deleteMany({ where: { userId } });
      // UserReport and ModerationLog are deliberately untouched (PRD FD-14).
      return {
        follows: follows.count,
        blocks: blocks.count,
        dismissals: dismissals.count,
        notifications: notifications.count,
        profile: profile.count > 0,
      };
    };
    return db ? run(db) : prisma.$transaction(run);
  }

  async searchByName(
    tokens: string[],
    excludeIds: string[],
    cursor: SocialSearchCursor | null,
    limit: number,
  ): Promise<SocialProfileWithUser[]> {
    const terms = tokens.map((t) => t.trim()).filter((t) => t.length > 0);
    if (terms.length === 0 || limit <= 0) return [];
    // searchName is normalised and single-space separated, so "t is a prefix
    // of some name token" ⇔ it starts the string or follows a space.
    // Prisma passes startsWith/contains to LIKE unescaped: escape the wildcards.
    const tokenFilters: Prisma.SocialProfileWhereInput[] = terms.map((t) => {
      const lit = escapeLike(t);
      return { OR: [{ searchName: { startsWith: lit } }, { searchName: { contains: ` ${lit}` } }] };
    });
    return prisma.socialProfile.findMany({
      where: {
        AND: [
          ...tokenFilters,
          { forcedPrivateAt: null },
          ...(excludeIds.length > 0 ? [{ userId: { notIn: excludeIds } }] : []),
          ...(cursor
            ? [
                {
                  OR: [
                    { searchName: { gt: cursor.searchName } },
                    { searchName: cursor.searchName, userId: { gt: cursor.userId } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: { user: { select: socialUserSelect } },
      orderBy: [{ searchName: 'asc' }, { userId: 'asc' }],
      take: limit,
    });
  }

  popular(
    _minFollowers: number,
    _activeSince: Date,
    _excludeIds: string[],
    _limit: number,
  ): Promise<PopularProfileRow[]> {
    // W1 (L-GRAPH) implements it: the "active" signal and the ranking are theirs.
    return Promise.reject(new Error('not implemented'));
  }
}

export const socialProfileRepository = new SocialProfileRepository();
