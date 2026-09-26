import { Prisma, type PlanTier, type UserRole } from '@prisma/client';
import { prisma } from '../client';

// ─── Weekly emails (audit P2-5, F-PM-14) ──────────────────────────────────────
// Recipient selection, the per-week send log and the opt-out flags. The send
// log is claimed BEFORE an email goes out (@@unique(userId, kind, weekStart)),
// so a restart or an overlapping tick can never email anyone twice.

export type WeeklyEmailKind = 'WEEK_READY' | 'WEEKLY_RECAP';

export interface WeeklyEmailRecipient {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  role: UserRole;
  planTier: PlanTier;
  image: string | null;
}

export interface WeeklyEmailPreferences {
  weeklyEmailReady: boolean;
  weeklyEmailRecap: boolean;
  emailVerified: Date | null;
  email: string;
}

export interface WeekLogRow {
  date: Date;
  totalKcal: number;
  /** Number of logged entries that day (planned or custom). */
  mealCount: number;
}

export interface IWeeklyEmailRepository {
  /**
   * Opted-in users with a CONFIRMED address who have not been sent `kind` for
   * the week starting `weekStart` yet. Deleted accounts are gone (hard delete
   * + cascade), so they can never match. `userId` narrows the sweep to one
   * account (the manual trigger script).
   */
  findRecipients(
    kind: WeeklyEmailKind,
    weekStart: Date,
    userId?: string,
  ): Promise<WeeklyEmailRecipient[]>;
  /** True when this call claimed the send; false when it was already claimed. */
  claimSend(userId: string, kind: WeeklyEmailKind, weekStart: Date): Promise<boolean>;
  /** Releases a claim whose email failed, so a later tick retries it. */
  releaseSend(userId: string, kind: WeeklyEmailKind, weekStart: Date): Promise<void>;
  getPreferences(userId: string): Promise<WeeklyEmailPreferences | null>;
  setPreferences(
    userId: string,
    data: { weeklyEmailReady?: boolean; weeklyEmailRecap?: boolean },
  ): Promise<WeeklyEmailPreferences | null>;
  /** Marks the address confirmed (keeps the first confirmation date). */
  markEmailVerified(userId: string, email: string): Promise<boolean>;
  /** Daily logs with from ≤ date < to (the Sunday recap). */
  findWeekLogs(userId: string, from: Date, to: Date): Promise<WeekLogRow[]>;
  /**
   * Completed workouts with fromLocal ≤ localDate ≤ toLocal ("YYYY-MM-DD"),
   * or null for users who never set up Gym (the recap leaves the line out).
   */
  countCompletedWorkouts(
    userId: string,
    fromLocal: string,
    toLocal: string,
  ): Promise<number | null>;
}

const PREFERENCE_SELECT = {
  weeklyEmailReady: true,
  weeklyEmailRecap: true,
  emailVerified: true,
  email: true,
} as const;

export class WeeklyEmailRepository implements IWeeklyEmailRepository {
  async findRecipients(
    kind: WeeklyEmailKind,
    weekStart: Date,
    userId?: string,
  ): Promise<WeeklyEmailRecipient[]> {
    return prisma.user.findMany({
      where: {
        ...(userId && { id: userId }),
        emailVerified: { not: null },
        ...(kind === 'WEEK_READY' ? { weeklyEmailReady: true } : { weeklyEmailRecap: true }),
        emailSends: { none: { kind, weekStart } },
      },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        role: true,
        planTier: true,
        image: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async claimSend(userId: string, kind: WeeklyEmailKind, weekStart: Date): Promise<boolean> {
    try {
      await prisma.emailSend.create({ data: { userId, kind, weekStart } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async releaseSend(userId: string, kind: WeeklyEmailKind, weekStart: Date): Promise<void> {
    await prisma.emailSend.deleteMany({ where: { userId, kind, weekStart } });
  }

  async getPreferences(userId: string): Promise<WeeklyEmailPreferences | null> {
    return prisma.user.findUnique({ where: { id: userId }, select: PREFERENCE_SELECT });
  }

  async setPreferences(
    userId: string,
    data: { weeklyEmailReady?: boolean; weeklyEmailRecap?: boolean },
  ): Promise<WeeklyEmailPreferences | null> {
    const { count } = await prisma.user.updateMany({ where: { id: userId }, data });
    if (count === 0) return null;
    return this.getPreferences(userId);
  }

  async markEmailVerified(userId: string, email: string): Promise<boolean> {
    // Bound to the address the link was sent to: a changed email needs a new link.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    });
    if (user?.email !== email) return false;
    if (!user.emailVerified) {
      await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
    }
    return true;
  }

  async findWeekLogs(userId: string, from: Date, to: Date): Promise<WeekLogRow[]> {
    const rows = await prisma.dailyLog.findMany({
      where: { userId, date: { gte: from, lt: to } },
      select: { date: true, totalKcal: true, loggedMeals: true },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      date: r.date,
      totalKcal: r.totalKcal,
      mealCount: Array.isArray(r.loggedMeals) ? r.loggedMeals.length : 0,
    }));
  }

  async countCompletedWorkouts(
    userId: string,
    fromLocal: string,
    toLocal: string,
  ): Promise<number | null> {
    const profile = await prisma.gymProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });
    if (!profile) return null;
    return prisma.workoutSession.count({
      where: { userId, status: 'COMPLETED', localDate: { gte: fromLocal, lte: toLocal } },
    });
  }
}

export const weeklyEmailRepository = new WeeklyEmailRepository();
