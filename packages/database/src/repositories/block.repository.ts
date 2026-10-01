import type { Block } from '@prisma/client';
import { prisma } from '../client';
import type { SocialDbClient, SocialKeysetCursor } from './social-profile.repository';

// ─── Following: blocks (docs/friends/implementation-plan.md §2.4) ─────────────
// Directed row blocker → blocked, but every read treats a block as mutual
// ("either"). The side effects (follows, notifications, dismissals) are
// BlockService's job, in the same transaction — pass `db`.

export interface IBlockRepository {
  /** A block in either direction between `a` and `b`. */
  existsEither(a: string, b: string, db?: SocialDbClient): Promise<boolean>;
  /** Everyone `userId` blocked or was blocked by (search / suggestion exclusions). */
  blockedIdsEither(userId: string): Promise<string[]>;
  /** Idempotent: re-blocking keeps the original row. */
  create(blockerId: string, blockedId: string, db?: SocialDbClient): Promise<Block>;
  /** Returns whether a row was deleted. */
  delete(blockerId: string, blockedId: string, db?: SocialDbClient): Promise<boolean>;
  /**
   * Blocks `userId` made, newest first. Keyset cursor `{ createdAt, id }` where
   * `id` is the blocked user's id.
   */
  listMade(userId: string, cursor: SocialKeysetCursor | null, limit: number): Promise<Block[]>;
  /** Number of blocks `userId` made (`friends.me` counts). */
  countMade(userId: string): Promise<number>;
}

export class BlockRepository implements IBlockRepository {
  async existsEither(a: string, b: string, db: SocialDbClient = prisma): Promise<boolean> {
    const count = await db.block.count({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return count > 0;
  }

  async blockedIdsEither(userId: string): Promise<string[]> {
    const rows = await prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
    return [...ids];
  }

  async create(blockerId: string, blockedId: string, db: SocialDbClient = prisma): Promise<Block> {
    return db.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
  }

  async delete(
    blockerId: string,
    blockedId: string,
    db: SocialDbClient = prisma,
  ): Promise<boolean> {
    const { count } = await db.block.deleteMany({ where: { blockerId, blockedId } });
    return count > 0;
  }

  async listMade(
    userId: string,
    cursor: SocialKeysetCursor | null,
    limit: number,
  ): Promise<Block[]> {
    return prisma.block.findMany({
      where: {
        blockerId: userId,
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, blockedId: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { blockedId: 'desc' }],
      take: limit,
    });
  }

  async countMade(userId: string): Promise<number> {
    return prisma.block.count({ where: { blockerId: userId } });
  }
}

export const blockRepository = new BlockRepository();
