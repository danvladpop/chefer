import type { DailyLog, MealPlan, MealPlanDay, Prisma } from '@prisma/client';
import { prisma } from '../client';

// ─── ProgressSourceRepository (tech-plan.md §7) ───────────────────────────────
// Read-only: the history rows that back-dating turns into ledger events. The
// workout sessions themselves come from `workoutSessionRepository`; this adds
// the filter for which of them may score, and the food and shopping history.

export type PlanWithDays = MealPlan & { days: MealPlanDay[] };

export type ShoppingListHistory = {
  planId: string;
  checkedKeys: string[];
  /** The plan's `weekStartDate` (UTC midnight of its Monday). */
  weekStartDate: Date;
};

export interface IProgressSourceRepository {
  /** Ids of the user's sessions matching `where` (back-dating's scorable filter). */
  sessionIds(where: Prisma.WorkoutSessionWhereInput): Promise<string[]>;
  dailyLogs(userId: string): Promise<DailyLog[]>;
  /** The user's real plans (no templates), oldest first, with their days. */
  plans(userId: string): Promise<PlanWithDays[]>;
  shoppingLists(userId: string): Promise<ShoppingListHistory[]>;
  /** Every account, for the back-date script. */
  userIds(): Promise<string[]>;
}

export class ProgressSourceRepository implements IProgressSourceRepository {
  async sessionIds(where: Prisma.WorkoutSessionWhereInput): Promise<string[]> {
    const rows = await prisma.workoutSession.findMany({ where, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async dailyLogs(userId: string): Promise<DailyLog[]> {
    return prisma.dailyLog.findMany({ where: { userId }, orderBy: { date: 'asc' } });
  }

  async plans(userId: string): Promise<PlanWithDays[]> {
    return prisma.mealPlan.findMany({
      where: { userId, isTemplate: false },
      orderBy: { createdAt: 'asc' },
      include: { days: { orderBy: { dayOfWeek: 'asc' } } },
    });
  }

  async shoppingLists(userId: string): Promise<ShoppingListHistory[]> {
    const plans = await prisma.mealPlan.findMany({
      where: { userId, isTemplate: false },
      select: { id: true, weekStartDate: true },
    });
    if (plans.length === 0) return [];
    const weekOf = new Map(plans.map((p) => [p.id, p.weekStartDate]));
    const lists = await prisma.shoppingList.findMany({
      where: { planId: { in: plans.map((p) => p.id) }, NOT: { checkedKeys: { isEmpty: true } } },
      select: { planId: true, checkedKeys: true },
    });
    return lists.flatMap((l) => {
      const weekStartDate = weekOf.get(l.planId);
      return weekStartDate ? [{ planId: l.planId, checkedKeys: l.checkedKeys, weekStartDate }] : [];
    });
  }

  async userIds(): Promise<string[]> {
    const rows = await prisma.user.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => r.id);
  }
}

export const progressSourceRepository = new ProgressSourceRepository();
