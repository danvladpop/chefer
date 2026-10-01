import type { IngredientNotice, IngredientNoticeKind } from '@prisma/client';
import { prisma } from '../client';

// ─── Weekly-review notices (docs/plan-ingredient-catalog.md §8.2, D6) ─────────
// One in-app notice per (user, kind, review): "3 of your ingredients now use
// Chefer's verified data" after a merge, or "please check this ingredient"
// after REJECT_DATA. Re-applying a review refreshes the row instead of adding
// another. No email.

export interface IIngredientNoticeRepository {
  /** Creates or refreshes the user's notice for one review (unread again). */
  upsert(
    userId: string,
    kind: IngredientNoticeKind,
    review: string,
    ingredientNames: string[],
  ): Promise<IngredientNotice>;
  /** The user's unread notices, newest first. */
  listUnread(userId: string): Promise<IngredientNotice[]>;
  /** Marks one of the user's notices read. Returns false when it isn't theirs. */
  markRead(userId: string, id: string): Promise<boolean>;
}

export class IngredientNoticeRepository implements IIngredientNoticeRepository {
  async upsert(
    userId: string,
    kind: IngredientNoticeKind,
    review: string,
    ingredientNames: string[],
  ): Promise<IngredientNotice> {
    return prisma.ingredientNotice.upsert({
      where: { userId_kind_review: { userId, kind, review } },
      create: { userId, kind, review, ingredientNames },
      update: { ingredientNames, readAt: null },
    });
  }

  async listUnread(userId: string): Promise<IngredientNotice[]> {
    return prisma.ingredientNotice.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.ingredientNotice.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    return count > 0;
  }
}

export const ingredientNoticeRepository = new IngredientNoticeRepository();
