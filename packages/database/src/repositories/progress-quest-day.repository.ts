import type { ProgressQuestDay } from '@prisma/client';
import { prisma } from '../client';

// ─── ProgressQuestDayRepository (tech-plan.md §2) ─────────────────────────────
// Today's three (`TodaysThreeQuest[]` in @chefer/types), fixed when first shown so the quests don't change under the user.

export interface IProgressQuestDayRepository {
  find(userId: string, localDate: string): Promise<ProgressQuestDay | null>;
  /** Stores the quests unless the day already has a set, and returns the stored set. */
  createIfAbsent(
    userId: string,
    localDate: string,
    quests: readonly object[],
  ): Promise<ProgressQuestDay>;
}

export class ProgressQuestDayRepository implements IProgressQuestDayRepository {
  async find(userId: string, localDate: string): Promise<ProgressQuestDay | null> {
    return prisma.progressQuestDay.findUnique({
      where: { userId_localDate: { userId, localDate } },
    });
  }

  async createIfAbsent(
    userId: string,
    localDate: string,
    quests: readonly object[],
  ): Promise<ProgressQuestDay> {
    return prisma.progressQuestDay.upsert({
      where: { userId_localDate: { userId, localDate } },
      create: { userId, localDate, quests: quests },
      update: {},
    });
  }
}

export const progressQuestDayRepository = new ProgressQuestDayRepository();
