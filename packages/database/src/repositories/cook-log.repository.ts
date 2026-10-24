import type { CookLog } from '@prisma/client';
import { prisma } from '../client';

// ─── CookLogRepository (tech-plan.md §2) ──────────────────────────────────────
// The server record of a finished cook-mode session. The id is the client's
// UUID, so a retry or an offline-queue replay can never create a second row.

export type NewCookLog = {
  id: string;
  userId: string;
  recipeId: string | null;
  localDate: string;
  startedAt: Date | null;
  finishedAt: Date;
};

export interface ICookLogRepository {
  /** `created: false` when the id already existed (a repeat call). */
  createIfAbsent(data: NewCookLog): Promise<{ log: CookLog; created: boolean }>;
  countForUser(userId: string): Promise<number>;
  /** True when the user finished this recipe before `before`, in another cook. */
  hasEarlierForRecipe(
    userId: string,
    recipeId: string,
    before: Date,
    excludeId: string,
  ): Promise<boolean>;
  /** Cooks dated inside [from, to] (local dates, inclusive), oldest first. */
  listInRange(userId: string, from: string, to: string): Promise<CookLog[]>;
}

export class CookLogRepository implements ICookLogRepository {
  async createIfAbsent(data: NewCookLog): Promise<{ log: CookLog; created: boolean }> {
    const existing = await prisma.cookLog.findUnique({ where: { id: data.id } });
    if (existing) return { log: existing, created: false };
    try {
      const log = await prisma.cookLog.create({ data });
      return { log, created: true };
    } catch (err) {
      // P2002: the same id raced in from a retry. It is theirs now.
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const log = await prisma.cookLog.findUnique({ where: { id: data.id } });
      if (!log) throw err;
      return { log, created: false };
    }
  }

  async countForUser(userId: string): Promise<number> {
    return prisma.cookLog.count({ where: { userId } });
  }

  async hasEarlierForRecipe(
    userId: string,
    recipeId: string,
    before: Date,
    excludeId: string,
  ): Promise<boolean> {
    const earlier = await prisma.cookLog.findFirst({
      where: { userId, recipeId, id: { not: excludeId }, finishedAt: { lt: before } },
      select: { id: true },
    });
    return earlier !== null;
  }

  async listInRange(userId: string, from: string, to: string): Promise<CookLog[]> {
    return prisma.cookLog.findMany({
      where: { userId, localDate: { gte: from, lte: to } },
      orderBy: [{ finishedAt: 'asc' }, { id: 'asc' }],
    });
  }
}

export const cookLogRepository = new CookLogRepository();
