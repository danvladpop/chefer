import type { DailyLog, Prisma } from '@prisma/client';
import { prisma } from '../client';

// A logged meal is EITHER a planned recipe (recipeId set) OR a custom entry
// (custom set — Snap-to-Log photo scans and manual quick-adds, F4). Readers
// must treat entries without recipeId as valid (premium_plan.md wave 0).
export interface LoggedMealEntry {
  // `| undefined` keeps zod-parsed inputs assignable under
  // exactOptionalPropertyTypes.
  recipeId?: string | undefined;
  custom?:
    | {
        name: string;
        estimatedBy: 'vision' | 'manual';
      }
    | undefined;
  mealType: string;
  portionMultiplier: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface UpsertDailyLogData {
  userId: string;
  date: Date;
  loggedMeals: LoggedMealEntry[];
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

export interface IDailyLogRepository {
  findByDate(userId: string, date: Date): Promise<DailyLog | null>;
  findLastN(userId: string, days: number): Promise<DailyLog[]>;
  upsert(data: UpsertDailyLogData): Promise<DailyLog>;
}

export class DailyLogRepository implements IDailyLogRepository {
  async findByDate(userId: string, date: Date): Promise<DailyLog | null> {
    // Normalise date to midnight UTC
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date: d } },
    });
  }

  async findLastN(userId: string, days: number): Promise<DailyLog[]> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days + 1);
    since.setUTCHours(0, 0, 0, 0);
    return prisma.dailyLog.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
  }

  async upsert(data: UpsertDailyLogData): Promise<DailyLog> {
    const d = new Date(data.date);
    d.setUTCHours(0, 0, 0, 0);
    return prisma.dailyLog.upsert({
      where: { userId_date: { userId: data.userId, date: d } },
      create: {
        userId: data.userId,
        date: d,
        loggedMeals: data.loggedMeals as unknown as Prisma.JsonArray,
        totalKcal: data.totalKcal,
        totalProtein: data.totalProtein,
        totalCarbs: data.totalCarbs,
        totalFat: data.totalFat,
      },
      update: {
        loggedMeals: data.loggedMeals as unknown as Prisma.JsonArray,
        totalKcal: data.totalKcal,
        totalProtein: data.totalProtein,
        totalCarbs: data.totalCarbs,
        totalFat: data.totalFat,
      },
    });
  }
}

export const dailyLogRepository = new DailyLogRepository();
