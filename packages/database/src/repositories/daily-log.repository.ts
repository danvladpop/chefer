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
  /**
   * Index of the plan slot (in the day's `meals`) this entry was logged
   * from, so two slots with the same recipe tick separately. Optional in the
   * JSON column: older entries and cook-mode logs have none.
   */
  slotIndex?: number | undefined;
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
  /**
   * Read-modify-write of one day's entries in a SERIALIZABLE transaction,
   * retried on conflict. Totals are recomputed from the result.
   */
  mutateDay(
    userId: string,
    date: Date,
    mutate: (current: LoggedMealEntry[]) => LoggedMealEntry[],
  ): Promise<DailyLog>;
}

/** Day totals from its entries (kcal rounded to int, macros to 0.1 g). */
export function dayTotals(entries: LoggedMealEntry[]): {
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
} {
  const sum = (pick: (m: LoggedMealEntry) => number) => entries.reduce((s, m) => s + pick(m), 0);
  const tenth = (v: number) => Math.round(v * 10) / 10;
  return {
    totalKcal: Math.round(sum((m) => m.kcal)),
    totalProtein: tenth(sum((m) => m.protein)),
    totalCarbs: tenth(sum((m) => m.carbs)),
    totalFat: tenth(sum((m) => m.fat)),
  };
}

const MUTATE_ATTEMPTS = 5;

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

  async mutateDay(
    userId: string,
    date: Date,
    mutate: (current: LoggedMealEntry[]) => LoggedMealEntry[],
  ): Promise<DailyLog> {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    // Parallel quick-adds used to read the same array and overwrite each
    // other (6 parallel writes kept 2 — audit F-TRK-1-2). Serializable makes
    // the loser fail with P2034; it retries against the winner's result.
    for (let attempt = 1; ; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const existing = await tx.dailyLog.findUnique({
              where: { userId_date: { userId, date: d } },
            });
            const current = (existing?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [];
            const next = mutate(current);
            const totals = dayTotals(next);
            const loggedMeals = next as unknown as Prisma.JsonArray;
            return tx.dailyLog.upsert({
              where: { userId_date: { userId, date: d } },
              create: { userId, date: d, loggedMeals, ...totals },
              update: { loggedMeals, ...totals },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (err) {
        const conflict =
          typeof err === 'object' &&
          err !== null &&
          ['P2034', 'P2002'].includes((err as { code?: string }).code ?? '');
        if (!conflict || attempt >= MUTATE_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, 15 * attempt + Math.random() * 25));
      }
    }
  }
}

export const dailyLogRepository = new DailyLogRepository();
