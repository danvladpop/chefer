import type { ProgressUnlock } from '@prisma/client';
import { prisma } from '../client';

// ─── ProgressUnlockRepository (tech-plan.md §2) ───────────────────────────────
// Earned badge tiers. Unique per (user, achievement, tier): a tier is earned
// once and never taken back.

export type NewUnlock = { achievementId: string; tier: number; unlockedAt: Date };

export interface IProgressUnlockRepository {
  list(userId: string): Promise<ProgressUnlock[]>;
  /** Writes the tiers not held yet and returns only the rows it created. */
  insertMany(userId: string, unlocks: NewUnlock[], seenAt?: Date | null): Promise<ProgressUnlock[]>;
  /** Marks unseen unlocks seen: the given ids, or all of the user's when `ids` is null. */
  markSeen(userId: string, ids: string[] | null, at: Date): Promise<number>;
}

export class ProgressUnlockRepository implements IProgressUnlockRepository {
  async list(userId: string): Promise<ProgressUnlock[]> {
    return prisma.progressUnlock.findMany({
      where: { userId },
      orderBy: [{ unlockedAt: 'asc' }, { tier: 'asc' }],
    });
  }

  async insertMany(
    userId: string,
    unlocks: NewUnlock[],
    seenAt: Date | null = null,
  ): Promise<ProgressUnlock[]> {
    const created: ProgressUnlock[] = [];
    for (const unlock of unlocks) {
      try {
        created.push(
          await prisma.progressUnlock.create({
            data: {
              userId,
              achievementId: unlock.achievementId,
              tier: unlock.tier,
              unlockedAt: unlock.unlockedAt,
              seenAt,
            },
          }),
        );
      } catch (err) {
        // P2002: a concurrent writer earned the same tier first. Nothing to do.
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }
    return created;
  }

  async markSeen(userId: string, ids: string[] | null, at: Date): Promise<number> {
    const res = await prisma.progressUnlock.updateMany({
      where: { userId, seenAt: null, ...(ids && { id: { in: ids } }) },
      data: { seenAt: at },
    });
    return res.count;
  }
}

export const progressUnlockRepository = new ProgressUnlockRepository();
