import type { ChefReview } from '@prisma/client';
import { prisma } from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpsertChefReviewData {
  userId: string;
  /** UTC midnight of the reviewed week's Monday. */
  weekStart: Date;
  adherencePct: number;
  avgDailyKcal: number;
  weightTrendKg: number | null;
  adjustmentKcal: number;
  /** Pantry savings surfaced in the review (F3 seam) — null until F3 lands. */
  savedEur?: number | null;
  reviewText: string;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IChefReviewRepository {
  findByUserAndWeek(userId: string, weekStart: Date): Promise<ChefReview | null>;
  /** Most recent review by weekStart, or null. */
  findLatest(userId: string): Promise<ChefReview | null>;
  /** Most recent review strictly BEFORE the given weekStart (for consecutive-trend rules). */
  findPreviousBefore(userId: string, weekStart: Date): Promise<ChefReview | null>;
  /** Idempotent on @@unique([userId, weekStart]) — a re-run updates in place. */
  upsert(data: UpsertChefReviewData): Promise<ChefReview>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class ChefReviewRepository implements IChefReviewRepository {
  async findByUserAndWeek(userId: string, weekStart: Date): Promise<ChefReview | null> {
    return prisma.chefReview.findUnique({
      where: { userId_weekStart: { userId, weekStart } },
    });
  }

  async findLatest(userId: string): Promise<ChefReview | null> {
    return prisma.chefReview.findFirst({
      where: { userId },
      orderBy: { weekStart: 'desc' },
    });
  }

  async findPreviousBefore(userId: string, weekStart: Date): Promise<ChefReview | null> {
    return prisma.chefReview.findFirst({
      where: { userId, weekStart: { lt: weekStart } },
      orderBy: { weekStart: 'desc' },
    });
  }

  async upsert(data: UpsertChefReviewData): Promise<ChefReview> {
    const { userId, weekStart, ...rest } = data;
    const payload = { ...rest, savedEur: rest.savedEur ?? null };
    return prisma.chefReview.upsert({
      where: { userId_weekStart: { userId, weekStart } },
      create: { userId, weekStart, ...payload },
      update: payload,
    });
  }
}

export const chefReviewRepository = new ChefReviewRepository();
