import type { SuggestionDismissal } from '@prisma/client';
import { prisma } from '../client';
import type { SocialDbClient } from './social-profile.repository';

// ─── Following: suggestion dismissals (docs/friends/implementation-plan.md §2.4)
// "Not interested" on a suggestion hides that person for 90 days
// (FRIENDS_LIMITS.dismissalDays); the maintenance worker prunes older rows.

export interface ISuggestionDismissalRepository {
  /** Dismiss (or re-dismiss, refreshing `createdAt`) `dismissedUserId` for `userId`. */
  upsert(
    userId: string,
    dismissedUserId: string,
    db?: SocialDbClient,
  ): Promise<SuggestionDismissal>;
  /** Ids `userId` dismissed at or after `since`. */
  activeIds(userId: string, since: Date): Promise<string[]>;
  /** Block side effect: removes dismissals between `a` and `b` in both directions. */
  deleteBetween(a: string, b: string, db?: SocialDbClient): Promise<number>;
  deleteOlderThan(date: Date): Promise<number>;
}

export class SuggestionDismissalRepository implements ISuggestionDismissalRepository {
  async upsert(
    userId: string,
    dismissedUserId: string,
    db: SocialDbClient = prisma,
  ): Promise<SuggestionDismissal> {
    return db.suggestionDismissal.upsert({
      where: { userId_dismissedUserId: { userId, dismissedUserId } },
      create: { userId, dismissedUserId },
      update: { createdAt: new Date() },
    });
  }

  async activeIds(userId: string, since: Date): Promise<string[]> {
    const rows = await prisma.suggestionDismissal.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { dismissedUserId: true },
    });
    return rows.map((r) => r.dismissedUserId);
  }

  async deleteBetween(a: string, b: string, db: SocialDbClient = prisma): Promise<number> {
    const { count } = await db.suggestionDismissal.deleteMany({
      where: {
        OR: [
          { userId: a, dismissedUserId: b },
          { userId: b, dismissedUserId: a },
        ],
      },
    });
    return count;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const { count } = await prisma.suggestionDismissal.deleteMany({
      where: { createdAt: { lt: date } },
    });
    return count;
  }
}

export const suggestionDismissalRepository = new SuggestionDismissalRepository();
