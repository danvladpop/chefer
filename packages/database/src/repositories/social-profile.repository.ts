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

/**
 * "Active in the last N days" for Popular (PRD §11.3), decided by
 * `popular()`. A profile owner is active since `activeSince` when ANY of:
 *   - they changed their Following settings or turned it on (`SocialProfile.updatedAt`);
 *   - they created a (non-template) meal plan (`MealPlan.createdAt`);
 *   - they completed a workout that started in the window (`WorkoutSession`
 *     COMPLETED, `startedAt`);
 *   - they created a recipe (`Recipe.createdAt`, any source).
 * Each is an indexed `EXISTS` on the owner's own rows; nothing reads email.
 */
function activeSinceFilter(since: Date): Prisma.SocialProfileWhereInput[] {
  return [
    { updatedAt: { gte: since } },
    { user: { mealPlans: { some: { isTemplate: false, createdAt: { gte: since } } } } },
    { user: { workoutSessions: { some: { status: 'COMPLETED', startedAt: { gte: since } } } } },
    { user: { createdRecipes: { some: { createdAt: { gte: since } } } } },
  ];
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
  /**
   * The public user fields (`socialUserSelect`: id, names, image — never
   * email, INV-6) for the given ids, whether or not they turned Following on.
   * List hydration (one query per page). Missing ids are simply absent.
   */
  findUsers(userIds: string[]): Promise<SocialUserRow[]>;
  /**
   * The display name the user chose for Following (PRD FR-02.6): writes
   * `User.firstName`, `User.lastName` and `User.name` = "{first} {last}" (the
   * `AuthService.register` rule: empty parts dropped, nothing → null). The
   * caller keeps `searchName` in step.
   */
  updateUserNames(
    userId: string,
    firstName: string,
    lastName: string,
    db?: SocialDbClient,
  ): Promise<SocialUserRow>;
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
   * since `activeSince` (see `activeSinceFilter` for what counts), at least
   * `minFollowers` (≥ 1) accepted followers. `featured` profiles (Chefer
   * Kitchen, Q-F-8) bypass BOTH the follower minimum and the activity window
   * ("always eligible", so the cold start is never empty). Excludes
   * `excludeIds`. Ordered by follower count DESC, then userId.
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

  async findUsers(userIds: string[]): Promise<SocialUserRow[]> {
    if (userIds.length === 0) return [];
    return prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: socialUserSelect,
    });
  }

  async updateUserNames(
    userId: string,
    firstName: string,
    lastName: string,
    db: SocialDbClient = prisma,
  ): Promise<SocialUserRow> {
    return db.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        name: [firstName, lastName].filter((part) => part !== '').join(' ') || null,
      },
      select: socialUserSelect,
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

  async popular(
    minFollowers: number,
    activeSince: Date,
    excludeIds: string[],
    limit: number,
  ): Promise<PopularProfileRow[]> {
    if (limit <= 0) return [];
    const eligible: Prisma.SocialProfileWhereInput = {
      visibility: 'PUBLIC',
      forcedPrivateAt: null,
      ...(excludeIds.length > 0 && { userId: { notIn: excludeIds } }),
    };

    // 1. Followees by accepted follower count (≥ min) among eligible profiles,
    //    then keep the active ones. Oversampled in batches so a few inactive
    //    top accounts can't starve the list; bounded so it stays one-shot cheap.
    const batch = Math.max(limit * 4, 50);
    const counted: PopularProfileRow[] = [];
    for (let page = 0; page < 5 && counted.length < limit; page++) {
      const groups = await prisma.follow.groupBy({
        by: ['followeeId'],
        where: { status: 'ACCEPTED', followee: { socialProfile: { is: eligible } } },
        _count: { followerId: true },
        having: { followerId: { _count: { gte: Math.max(1, minFollowers) } } },
        orderBy: [{ _count: { followerId: 'desc' } }, { followeeId: 'asc' }],
        skip: page * batch,
        take: batch,
      });
      if (groups.length === 0) break;
      const active = await prisma.socialProfile.findMany({
        where: {
          userId: { in: groups.map((g) => g.followeeId) },
          OR: activeSinceFilter(activeSince),
        },
        include: { user: { select: socialUserSelect } },
      });
      const byId = new Map(active.map((p) => [p.userId, p]));
      for (const g of groups) {
        const profile = byId.get(g.followeeId);
        if (profile) counted.push({ profile, followerCount: g._count.followerId });
      }
      if (groups.length < batch) break;
    }

    // 2. Featured profiles: always eligible (no follower minimum, no activity window).
    const featured = await prisma.socialProfile.findMany({
      where: { ...eligible, featured: true },
      include: { user: { select: socialUserSelect } },
    });
    const seen = new Set(counted.map((r) => r.profile.userId));
    const extra = featured.filter((p) => !seen.has(p.userId));
    if (extra.length > 0) {
      const groups = await prisma.follow.groupBy({
        by: ['followeeId'],
        where: { status: 'ACCEPTED', followeeId: { in: extra.map((p) => p.userId) } },
        _count: { followerId: true },
      });
      const counts = new Map(groups.map((g) => [g.followeeId, g._count.followerId]));
      for (const profile of extra) {
        counted.push({ profile, followerCount: counts.get(profile.userId) ?? 0 });
      }
    }

    return counted
      .sort(
        (a, b) =>
          b.followerCount - a.followerCount || a.profile.userId.localeCompare(b.profile.userId),
      )
      .slice(0, limit);
  }
}

export const socialProfileRepository = new SocialProfileRepository();
