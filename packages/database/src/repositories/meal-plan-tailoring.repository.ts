import type { MealPlanTailoring, Prisma } from '@prisma/client';
import { MealPlanStatus, MealPlanTailoringStatus } from '@prisma/client';
import { prisma } from '../client';
import type { PlanMealSlotJson } from './meal-plan.repository';

// ─── Plan tailoring jobs ("instant week, then the chef tailors it live") ─────
// Premium generation returns a curated week at once and queues one of these;
// PlanTailoringWorker claims due jobs with a lease and swaps one AI day in at
// a time. Everything the worker needs to decide "may I still write this day?"
// is read here too: the day as generated (snapshot), shopping ticks, logged
// meals — so the service stays free of Prisma.

export type TailoringSnapshots = Record<string, PlanMealSlotJson[]>;

export interface CreateTailoringData {
  planId: string;
  userId: string;
  queuedDays: number[];
  snapshots: TailoringSnapshots;
  baselineCheckedKeys: string[];
  slotTypes: string[];
  leftovers: boolean;
}

/** Fields the worker writes back after each step (the lease is always released). */
export interface TailoringProgressPatch {
  status?: MealPlanTailoringStatus;
  queuedDays?: number[];
  tailoredDays?: number[];
  keptDays?: number[];
  failedDays?: number[];
  currentDay?: number | null;
  snapshots?: TailoringSnapshots;
  baselineCheckedKeys?: string[];
  strikes?: number;
  resumes?: number;
  totalDays?: number;
  nextRunAt?: Date;
  lastError?: string | null;
  finishedAt?: Date | null;
}

/** Who the job is for — the worker re-checks tier and AI consent every day. */
export interface TailoringUserGate {
  planTier: string;
  role: string;
  aiDataConsentAt: Date | null;
}

export interface IMealPlanTailoringRepository {
  /** Creates (or, for the same plan, replaces) the job in RUNNING state. */
  create(data: CreateTailoringData): Promise<MealPlanTailoring>;
  findByPlanId(planId: string): Promise<MealPlanTailoring | null>;
  /**
   * Cancels the RUNNING jobs of the user's plans for the week starting on
   * `weekStart` (same calendar day) — a newer generation supersedes them.
   */
  cancelRunningForWeek(userId: string, weekStart: Date): Promise<number>;
  /**
   * Atomically claims the next due RUNNING job (nextRunAt ≤ now, no live
   * lease) by stamping `leaseUntil`. A job claimed by another instance is
   * skipped. Null when nothing is due.
   */
  claimNextDue(now: Date, leaseMs: number): Promise<MealPlanTailoring | null>;
  /**
   * Writes progress and releases the lease — unless `keepLease` (an interim
   * write mid-step, e.g. "now tailoring day 3", while the worker still holds it).
   */
  saveProgress(
    id: string,
    patch: TailoringProgressPatch,
    options?: { keepLease?: boolean },
  ): Promise<MealPlanTailoring>;
  /** Earliest nextRunAt among RUNNING jobs (the worker's next wake-up), or null. */
  nextDueAt(): Promise<Date | null>;
  /**
   * Compare-and-set of one day's meals: writes `meals` only when the plan is
   * still ACTIVE and the day still holds exactly `expected` (nobody changed
   * it since it was read). Returns whether it wrote.
   */
  replaceDayIfUnchanged(
    planId: string,
    dayOfWeek: number,
    expected: PlanMealSlotJson[],
    meals: PlanMealSlotJson[],
  ): Promise<boolean>;
  /** The plan's shopping-list ticks (empty when it has no list yet). */
  findCheckedKeys(planId: string): Promise<string[]>;
  /** Recipe ids the user logged on `date` (planned entries only). */
  findLoggedRecipeIds(userId: string, date: Date): Promise<string[]>;
  findUserGate(userId: string): Promise<TailoringUserGate | null>;
}

/** Order-insensitive to key order: JSON with sorted keys, so snapshots compare by value. */
export function stableSlotsJson(meals: PlanMealSlotJson[]): string {
  return JSON.stringify(
    meals.map((m) =>
      Object.fromEntries(
        Object.entries(m)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    ),
  );
}

export class MealPlanTailoringRepository implements IMealPlanTailoringRepository {
  async create(data: CreateTailoringData): Promise<MealPlanTailoring> {
    const fields = {
      userId: data.userId,
      status: MealPlanTailoringStatus.RUNNING,
      totalDays: data.queuedDays.length,
      queuedDays: data.queuedDays,
      tailoredDays: [],
      keptDays: [],
      failedDays: [],
      currentDay: data.queuedDays[0] ?? null,
      snapshots: data.snapshots as Prisma.InputJsonValue,
      baselineCheckedKeys: data.baselineCheckedKeys,
      slotTypes: data.slotTypes,
      leftovers: data.leftovers,
      strikes: 0,
      resumes: 0,
      nextRunAt: new Date(),
      leaseUntil: null,
      lastError: null,
      finishedAt: null,
    };
    return prisma.mealPlanTailoring.upsert({
      where: { planId: data.planId },
      create: { planId: data.planId, ...fields },
      update: fields,
    });
  }

  async findByPlanId(planId: string): Promise<MealPlanTailoring | null> {
    return prisma.mealPlanTailoring.findUnique({ where: { planId } });
  }

  async cancelRunningForWeek(userId: string, weekStart: Date): Promise<number> {
    const dayStart = new Date(weekStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const res = await prisma.mealPlanTailoring.updateMany({
      where: {
        userId,
        status: MealPlanTailoringStatus.RUNNING,
        plan: { weekStartDate: { gte: dayStart, lt: dayEnd } },
      },
      data: {
        status: MealPlanTailoringStatus.CANCELLED,
        currentDay: null,
        leaseUntil: null,
        finishedAt: new Date(),
      },
    });
    return res.count;
  }

  async claimNextDue(now: Date, leaseMs: number): Promise<MealPlanTailoring | null> {
    const due = {
      status: MealPlanTailoringStatus.RUNNING,
      nextRunAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    } satisfies Prisma.MealPlanTailoringWhereInput;
    const candidates = await prisma.mealPlanTailoring.findMany({
      where: due,
      orderBy: { nextRunAt: 'asc' },
      select: { id: true },
      take: 5,
    });
    for (const { id } of candidates) {
      const res = await prisma.mealPlanTailoring.updateMany({
        where: { id, ...due },
        data: { leaseUntil: new Date(now.getTime() + leaseMs) },
      });
      if (res.count > 0) return prisma.mealPlanTailoring.findUnique({ where: { id } });
    }
    return null;
  }

  async saveProgress(
    id: string,
    patch: TailoringProgressPatch,
    options: { keepLease?: boolean } = {},
  ): Promise<MealPlanTailoring> {
    const { snapshots, ...rest } = patch;
    return prisma.mealPlanTailoring.update({
      where: { id },
      data: {
        ...rest,
        ...(snapshots !== undefined && { snapshots: snapshots as Prisma.InputJsonValue }),
        ...(!options.keepLease && { leaseUntil: null }),
      },
    });
  }

  async nextDueAt(): Promise<Date | null> {
    const row = await prisma.mealPlanTailoring.findFirst({
      where: { status: MealPlanTailoringStatus.RUNNING },
      orderBy: { nextRunAt: 'asc' },
      select: { nextRunAt: true },
    });
    return row?.nextRunAt ?? null;
  }

  async replaceDayIfUnchanged(
    planId: string,
    dayOfWeek: number,
    expected: PlanMealSlotJson[],
    meals: PlanMealSlotJson[],
  ): Promise<boolean> {
    return prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const plan = await tx.mealPlan.findUnique({
          where: { id: planId },
          select: { status: true },
        });
        if (plan?.status !== MealPlanStatus.ACTIVE) return false;
        const day = await tx.mealPlanDay.findFirst({ where: { mealPlanId: planId, dayOfWeek } });
        if (!day) return false;
        const current = day.meals as unknown as PlanMealSlotJson[];
        if (stableSlotsJson(current) !== stableSlotsJson(expected)) return false;
        await tx.mealPlanDay.update({
          where: { id: day.id },
          data: { meals: meals as unknown as Prisma.InputJsonValue },
        });
        return true;
      },
      // A user edit racing this write must make one of the two fail, not
      // interleave (read-then-write on the same row).
      { isolationLevel: 'Serializable' },
    );
  }

  async findCheckedKeys(planId: string): Promise<string[]> {
    const list = await prisma.shoppingList.findUnique({
      where: { planId },
      select: { checkedKeys: true },
    });
    return list?.checkedKeys ?? [];
  }

  async findLoggedRecipeIds(userId: string, date: Date): Promise<string[]> {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const log = await prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date: d } },
      select: { loggedMeals: true },
    });
    const entries = (log?.loggedMeals ?? []) as { recipeId?: string }[];
    return entries.flatMap((e) => (e.recipeId ? [e.recipeId] : []));
  }

  async findUserGate(userId: string): Promise<TailoringUserGate | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { planTier: true, role: true, aiDataConsentAt: true },
    });
  }
}

export const mealPlanTailoringRepository = new MealPlanTailoringRepository();
