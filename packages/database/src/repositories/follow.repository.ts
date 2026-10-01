import type { Follow, FollowStatus, Prisma } from '@prisma/client';
import { prisma } from '../client';
import type { SocialDbClient, SocialKeysetCursor } from './social-profile.repository';

// ─── Following: the follow graph (docs/friends/implementation-plan.md §2.4) ───
// Directed edge follower → followee. PENDING = a request, ACCEPTED = following.
// Decline / cancel / unfollow / remove / block all DELETE the row (no
// tombstones), so a pair is at most one row per direction.

export interface CreateFollowData {
  followerId: string;
  followeeId: string;
  status: FollowStatus;
}

export interface FollowPair {
  /** a → b */
  outgoing: Follow | null;
  /** b → a */
  incoming: Follow | null;
}

export interface FollowCounts {
  /** Accepted edges into the user. */
  followers: number;
  /** Accepted edges out of the user. */
  following: number;
  /** Pending requests to the user. */
  pendingRequests: number;
}

export interface MutualCandidateRow {
  userId: string;
  /** How many of the viewer's accepted followees follow this user (accepted). */
  mutualCount: number;
  /** The mutual whose accepted follow of this user is the most recent ("Followed by {name}"). */
  latestMutualId: string;
}

export interface ExpiredFollowRequest {
  followerId: string;
  followeeId: string;
}

export interface IFollowRepository {
  /** The directed edge follower → followee, if any. */
  find(followerId: string, followeeId: string, db?: SocialDbClient): Promise<Follow | null>;
  /** Both directions between `a` and `b` in one query. */
  findPair(a: string, b: string, db?: SocialDbClient): Promise<FollowPair>;
  /** Every edge from `viewerId` to any of `userIds` and back (list hydration, one query). */
  findEdgesWith(viewerId: string, userIds: string[]): Promise<Follow[]>;
  /** ACCEPTED rows get `acceptedAt` = now. Throws P2002 when the edge already exists. */
  create(data: CreateFollowData, db?: SocialDbClient): Promise<Follow>;
  /** PENDING → ACCEPTED. Returns the accepted row, or null when there was no pending request (idempotent). */
  accept(followerId: string, followeeId: string, db?: SocialDbClient): Promise<Follow | null>;
  /** Private → Public: accepts every pending request to `followeeId`. Returns the accepted follower ids. */
  acceptAllPendingTo(followeeId: string, db?: SocialDbClient): Promise<string[]>;
  /** Deletes the directed edge (any status). Returns whether a row was deleted. */
  delete(followerId: string, followeeId: string, db?: SocialDbClient): Promise<boolean>;
  /** Deletes both directions (block). Returns the number of rows deleted. */
  deleteBothWays(a: string, b: string, db?: SocialDbClient): Promise<number>;
  /** ACCEPTED edges out of `userId`, newest first. */
  listFollowing(
    userId: string,
    cursor: SocialKeysetCursor | null,
    limit: number,
  ): Promise<Follow[]>;
  /** ACCEPTED edges into `userId`, newest first. */
  listFollowers(
    userId: string,
    cursor: SocialKeysetCursor | null,
    limit: number,
  ): Promise<Follow[]>;
  /** PENDING edges into `userId` (requests to review), newest first. */
  listPendingTo(
    userId: string,
    cursor: SocialKeysetCursor | null,
    limit: number,
  ): Promise<Follow[]>;
  counts(userId: string): Promise<FollowCounts>;
  /** Accepted followee ids of `viewerId` whose profile shares recipes (Saved / heart visibility). */
  acceptedFolloweeIdsSharingRecipes(viewerId: string): Promise<string[]>;
  /**
   * Second-degree candidates (PRD §11.1): users followed (accepted) by users the
   * viewer follows (accepted). Excludes the viewer, anyone the viewer already
   * follows or has requested, forced-private profiles and `excludeIds`
   * (blocked, dismissed). Ordered by `mutualCount DESC`.
   */
  mutualCandidates(
    viewerId: string,
    limit: number,
    excludeIds?: string[],
  ): Promise<MutualCandidateRow[]>;
  /** Deletes PENDING requests created before `date` (90-day expiry). Returns the deleted pairs. */
  expirePendingOlderThan(date: Date): Promise<ExpiredFollowRequest[]>;
}

function newestFirstPage(
  where: Prisma.FollowWhereInput,
  cursor: SocialKeysetCursor | null,
  limit: number,
): Promise<Follow[]> {
  return prisma.follow.findMany({
    where: {
      ...where,
      ...(cursor && {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });
}

export class FollowRepository implements IFollowRepository {
  async find(
    followerId: string,
    followeeId: string,
    db: SocialDbClient = prisma,
  ): Promise<Follow | null> {
    return db.follow.findUnique({ where: { followerId_followeeId: { followerId, followeeId } } });
  }

  async findPair(a: string, b: string, db: SocialDbClient = prisma): Promise<FollowPair> {
    const rows = await db.follow.findMany({
      where: {
        OR: [
          { followerId: a, followeeId: b },
          { followerId: b, followeeId: a },
        ],
      },
    });
    return {
      outgoing: rows.find((r) => r.followerId === a && r.followeeId === b) ?? null,
      incoming: rows.find((r) => r.followerId === b && r.followeeId === a) ?? null,
    };
  }

  async findEdgesWith(viewerId: string, userIds: string[]): Promise<Follow[]> {
    if (userIds.length === 0) return [];
    return prisma.follow.findMany({
      where: {
        OR: [
          { followerId: viewerId, followeeId: { in: userIds } },
          { followeeId: viewerId, followerId: { in: userIds } },
        ],
      },
    });
  }

  async create(data: CreateFollowData, db: SocialDbClient = prisma): Promise<Follow> {
    return db.follow.create({
      data: { ...data, acceptedAt: data.status === 'ACCEPTED' ? new Date() : null },
    });
  }

  async accept(
    followerId: string,
    followeeId: string,
    db: SocialDbClient = prisma,
  ): Promise<Follow | null> {
    const { count } = await db.follow.updateMany({
      where: { followerId, followeeId, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    if (count === 0) return null;
    return db.follow.findUnique({ where: { followerId_followeeId: { followerId, followeeId } } });
  }

  async acceptAllPendingTo(followeeId: string, db: SocialDbClient = prisma): Promise<string[]> {
    const pending = await db.follow.findMany({
      where: { followeeId, status: 'PENDING' },
      select: { id: true, followerId: true },
    });
    if (pending.length === 0) return [];
    await db.follow.updateMany({
      where: { id: { in: pending.map((p) => p.id) }, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    return pending.map((p) => p.followerId);
  }

  async delete(
    followerId: string,
    followeeId: string,
    db: SocialDbClient = prisma,
  ): Promise<boolean> {
    const { count } = await db.follow.deleteMany({ where: { followerId, followeeId } });
    return count > 0;
  }

  async deleteBothWays(a: string, b: string, db: SocialDbClient = prisma): Promise<number> {
    const { count } = await db.follow.deleteMany({
      where: {
        OR: [
          { followerId: a, followeeId: b },
          { followerId: b, followeeId: a },
        ],
      },
    });
    return count;
  }

  async listFollowing(
    userId: string,
    cursor: SocialKeysetCursor | null,
    limit: number,
  ): Promise<Follow[]> {
    return newestFirstPage({ followerId: userId, status: 'ACCEPTED' }, cursor, limit);
  }

  async listFollowers(
    userId: string,
    cursor: SocialKeysetCursor | null,
    limit: number,
  ): Promise<Follow[]> {
    return newestFirstPage({ followeeId: userId, status: 'ACCEPTED' }, cursor, limit);
  }

  async listPendingTo(
    userId: string,
    cursor: SocialKeysetCursor | null,
    limit: number,
  ): Promise<Follow[]> {
    return newestFirstPage({ followeeId: userId, status: 'PENDING' }, cursor, limit);
  }

  async counts(userId: string): Promise<FollowCounts> {
    const [followers, following, pendingRequests] = await Promise.all([
      prisma.follow.count({ where: { followeeId: userId, status: 'ACCEPTED' } }),
      prisma.follow.count({ where: { followerId: userId, status: 'ACCEPTED' } }),
      prisma.follow.count({ where: { followeeId: userId, status: 'PENDING' } }),
    ]);
    return { followers, following, pendingRequests };
  }

  async acceptedFolloweeIdsSharingRecipes(viewerId: string): Promise<string[]> {
    const rows = await prisma.follow.findMany({
      where: {
        followerId: viewerId,
        status: 'ACCEPTED',
        followee: { socialProfile: { is: { shareRecipes: true } } },
      },
      select: { followeeId: true },
    });
    return rows.map((r) => r.followeeId);
  }

  async mutualCandidates(
    viewerId: string,
    limit: number,
    excludeIds: string[] = [],
  ): Promise<MutualCandidateRow[]> {
    if (limit <= 0) return [];
    const mine = await prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followeeId: true, status: true },
    });
    const mutualIds = mine.filter((f) => f.status === 'ACCEPTED').map((f) => f.followeeId);
    if (mutualIds.length === 0) return [];
    const exclude = [...new Set([viewerId, ...mine.map((f) => f.followeeId), ...excludeIds])];
    const where: Prisma.FollowWhereInput = {
      followerId: { in: mutualIds },
      status: 'ACCEPTED',
      followeeId: { notIn: exclude },
      followee: { socialProfile: { is: { forcedPrivateAt: null } } },
    };
    const groups = await prisma.follow.groupBy({
      by: ['followeeId'],
      where,
      _count: { followerId: true },
      orderBy: [{ _count: { followerId: 'desc' } }, { followeeId: 'asc' }],
      take: limit,
    });
    if (groups.length === 0) return [];
    const latest = await prisma.follow.findMany({
      where: { ...where, followeeId: { in: groups.map((g) => g.followeeId) } },
      select: { followerId: true, followeeId: true },
      orderBy: [{ acceptedAt: 'desc' }, { createdAt: 'desc' }],
      distinct: ['followeeId'],
    });
    const latestBy = new Map(latest.map((r) => [r.followeeId, r.followerId]));
    return groups.flatMap((g) => {
      const latestMutualId = latestBy.get(g.followeeId);
      return latestMutualId
        ? [{ userId: g.followeeId, mutualCount: g._count.followerId, latestMutualId }]
        : [];
    });
  }

  async expirePendingOlderThan(date: Date): Promise<ExpiredFollowRequest[]> {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.follow.findMany({
        where: { status: 'PENDING', createdAt: { lt: date } },
        select: { id: true, followerId: true, followeeId: true },
      });
      if (rows.length === 0) return [];
      await tx.follow.deleteMany({
        where: { id: { in: rows.map((r) => r.id) }, status: 'PENDING' },
      });
      return rows.map(({ followerId, followeeId }) => ({ followerId, followeeId }));
    });
  }
}

export const followRepository = new FollowRepository();
