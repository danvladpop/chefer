import type { ReportReason, UserReport } from '@prisma/client';
import { prisma } from '../client';
import type { SocialDbClient } from './social-profile.repository';

// ─── Following: reports (docs/friends/implementation-plan.md §2.4, §4.6) ──────
// Append-only. Kept when either side turns Following off (PRD FD-14). The
// only update is `discountedAt`, set by an ops undo so those reports never
// count toward a threshold again. Counting is by DISTINCT eligible reporter.

export interface CreateUserReportData {
  reporterId: string;
  /** The reported user, or the reported recipe's creator. */
  targetUserId: string;
  recipeId?: string | null;
  reason: ReportReason;
  /** Reporter ≥ 24 h old and email verified, evaluated at report time (MODERATION). */
  eligible: boolean;
}

export interface ReportCountsSince {
  reports: number;
  eligibleReports: number;
}

/** What report eligibility is evaluated from (MODERATION, evaluated at report time). */
export interface ReporterFacts {
  createdAt: Date;
  emailVerified: Date | null;
}

export interface IUserReportRepository {
  create(data: CreateUserReportData, db?: SocialDbClient): Promise<UserReport>;
  /** Distinct reporters of eligible, not-discounted reports on this recipe. */
  distinctEligibleReportersForRecipe(recipeId: string, db?: SocialDbClient): Promise<number>;
  /**
   * Distinct reporters of eligible, not-discounted reports on this user or any
   * of their recipes (recipe reports carry the creator as `targetUserId`).
   */
  distinctEligibleReportersForUser(targetUserId: string, db?: SocialDbClient): Promise<number>;
  /** Ops undo of RECIPE_AUTO_HIDDEN: discounts the recipe's live reports. Returns the count. */
  discountForRecipe(recipeId: string, db?: SocialDbClient): Promise<number>;
  /** Ops undo of ACCOUNT_FORCED_PRIVATE: discounts every live report targeting the user. */
  discountForUser(targetUserId: string, db?: SocialDbClient): Promise<number>;
  /** Weekly metrics line: reports filed since `date`, and how many were eligible. */
  countSince(date: Date): Promise<ReportCountsSince>;
  /** The reporter's account age and email confirmation (never the email itself). */
  reporterFacts(reporterId: string): Promise<ReporterFacts | null>;
  /**
   * Whether the reporter has a tie with the target outside the header rule
   * (plan §4.6 step 1): a follow either way (any status) or an Activity item
   * from them in the reporter's inbox.
   */
  hasSocialTie(reporterId: string, targetUserId: string): Promise<boolean>;
  /** Retention (MODERATION.RECORD_RETENTION_MONTHS): deletes reports filed before `date`. */
  deleteOlderThan(date: Date): Promise<number>;
}

export class UserReportRepository implements IUserReportRepository {
  async create(data: CreateUserReportData, db: SocialDbClient = prisma): Promise<UserReport> {
    return db.userReport.create({ data });
  }

  async distinctEligibleReportersForRecipe(
    recipeId: string,
    db: SocialDbClient = prisma,
  ): Promise<number> {
    const rows = await db.userReport.groupBy({
      by: ['reporterId'],
      where: { recipeId, eligible: true, discountedAt: null },
    });
    return rows.length;
  }

  async distinctEligibleReportersForUser(
    targetUserId: string,
    db: SocialDbClient = prisma,
  ): Promise<number> {
    const rows = await db.userReport.groupBy({
      by: ['reporterId'],
      where: { targetUserId, eligible: true, discountedAt: null },
    });
    return rows.length;
  }

  async discountForRecipe(recipeId: string, db: SocialDbClient = prisma): Promise<number> {
    const { count } = await db.userReport.updateMany({
      where: { recipeId, discountedAt: null },
      data: { discountedAt: new Date() },
    });
    return count;
  }

  async discountForUser(targetUserId: string, db: SocialDbClient = prisma): Promise<number> {
    const { count } = await db.userReport.updateMany({
      where: { targetUserId, discountedAt: null },
      data: { discountedAt: new Date() },
    });
    return count;
  }

  async countSince(date: Date): Promise<ReportCountsSince> {
    const [reports, eligibleReports] = await Promise.all([
      prisma.userReport.count({ where: { createdAt: { gte: date } } }),
      prisma.userReport.count({ where: { createdAt: { gte: date }, eligible: true } }),
    ]);
    return { reports, eligibleReports };
  }

  async reporterFacts(reporterId: string): Promise<ReporterFacts | null> {
    return prisma.user.findUnique({
      where: { id: reporterId },
      select: { createdAt: true, emailVerified: true },
    });
  }

  async hasSocialTie(reporterId: string, targetUserId: string): Promise<boolean> {
    const [follow, item] = await Promise.all([
      prisma.follow.findFirst({
        where: {
          OR: [
            { followerId: reporterId, followeeId: targetUserId },
            { followerId: targetUserId, followeeId: reporterId },
          ],
        },
        select: { id: true },
      }),
      prisma.notification.findFirst({
        where: { userId: reporterId, actorId: targetUserId },
        select: { id: true },
      }),
    ]);
    return follow !== null || item !== null;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const { count } = await prisma.userReport.deleteMany({ where: { createdAt: { lt: date } } });
    return count;
  }
}

export const userReportRepository = new UserReportRepository();
