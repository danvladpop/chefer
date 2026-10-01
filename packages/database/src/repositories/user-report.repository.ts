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
}

export const userReportRepository = new UserReportRepository();
