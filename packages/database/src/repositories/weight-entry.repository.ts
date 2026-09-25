import type { WeightEntry } from '@prisma/client';
import { prisma } from '../client';

export interface CreateWeightEntryData {
  userId: string;
  weightKg: number;
  recordedAt?: Date;
}

export interface IWeightEntryRepository {
  create(data: CreateWeightEntryData): Promise<WeightEntry>;
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

  async findLastN(userId: string, days: number): Promise<WeightEntry[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return prisma.weightEntry.findMany({
      where: { userId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async findLatest(userId: string): Promise<WeightEntry | null> {
    return prisma.weightEntry.findFirst({
      where: { userId },
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
