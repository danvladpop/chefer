import type { WeightEntry } from '@prisma/client';
import { prisma } from '../client';

export interface CreateWeightEntryData {
  userId: string;
  weightKg: number;
  recordedAt?: Date;
}

/**
 * Upper bound for "recorded up to now" reads. Clients send their LOCAL date as
 * UTC midnight, so a user east of UTC can legitimately be up to 14h "ahead";
 * anything later is a future-dated typo and must not become "Current" weight
 * or stretch the coach's trend window (audit F-DASH-3-1).
 */
function readCeiling(): Date {
  return new Date(Date.now() + 14 * 60 * 60 * 1000);
}

export interface IWeightEntryRepository {
  create(data: CreateWeightEntryData): Promise<WeightEntry>;
  /** Owner-scoped update; null when the entry doesn't exist or isn't theirs. */
  updateForUser(
    userId: string,
    id: string,
    data: { weightKg?: number; recordedAt?: Date },
  ): Promise<WeightEntry | null>;
  /** Owner-scoped delete; false when the entry doesn't exist or isn't theirs. */
  deleteForUser(userId: string, id: string): Promise<boolean>;
  findLastN(userId: string, days: number): Promise<WeightEntry[]>;
  findLatest(userId: string): Promise<WeightEntry | null>;
  /** Entries with from ≤ recordedAt < to, oldest first (gym bodyweight stats). */
  findInRange(userId: string, from: Date | null, to: Date): Promise<WeightEntry[]>;
}

export class WeightEntryRepository implements IWeightEntryRepository {
  async create(data: CreateWeightEntryData): Promise<WeightEntry> {
    return prisma.weightEntry.create({
      data: {
        userId: data.userId,
        weightKg: data.weightKg,
        recordedAt: data.recordedAt ?? new Date(),
      },
    });
  }

  async updateForUser(
    userId: string,
    id: string,
    data: { weightKg?: number; recordedAt?: Date },
  ): Promise<WeightEntry | null> {
    const { count } = await prisma.weightEntry.updateMany({ where: { id, userId }, data });
    if (count === 0) return null;
    return prisma.weightEntry.findUnique({ where: { id } });
  }

  async deleteForUser(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.weightEntry.deleteMany({ where: { id, userId } });
    return count > 0;
  }

  async findLastN(userId: string, days: number): Promise<WeightEntry[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return prisma.weightEntry.findMany({
      where: { userId, recordedAt: { gte: since, lte: readCeiling() } },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async findLatest(userId: string): Promise<WeightEntry | null> {
    return prisma.weightEntry.findFirst({
      where: { userId, recordedAt: { lte: readCeiling() } },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async findInRange(userId: string, from: Date | null, to: Date): Promise<WeightEntry[]> {
    return prisma.weightEntry.findMany({
      where: { userId, recordedAt: { ...(from && { gte: from }), lt: to } },
      orderBy: { recordedAt: 'asc' },
    });
  }
}

export const weightEntryRepository = new WeightEntryRepository();
