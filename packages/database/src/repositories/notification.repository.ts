import type { Notification, NotificationKind } from '@prisma/client';
import { prisma } from '../client';
import type { SocialDbClient, SocialKeysetCursor } from './social-profile.repository';

// ─── Following: in-app Activity (docs/friends/implementation-plan.md §2.4) ────
// One row per (recipient, kind, actor): re-sending a request upserts the row
// (fresh createdAt, unread again) instead of stacking duplicates. No push and
// no email (PRD §12) — this table is the whole mechanism.

export interface SocialNotificationData {
  /** Recipient. */
  userId: string;
  kind: NotificationKind;
  actorId: string;
}

export interface INotificationRepository {
  /** Create, or refresh an existing (userId, kind, actorId) row to createdAt = now, unread. */
  upsertSocial(data: SocialNotificationData, db?: SocialDbClient): Promise<Notification>;
  /** Removes one item (e.g. the FOLLOW_REQUEST after a cancel/decline). Returns the count removed. */
  withdraw(
    userId: string,
    kind: NotificationKind,
    actorId: string,
    db?: SocialDbClient,
  ): Promise<number>;
  /** Block side effect: removes every item between `a` and `b`, both directions. */
  withdrawBetween(a: string, b: string, db?: SocialDbClient): Promise<number>;
  /** The recipient's items, newest first. */
  list(userId: string, cursor: SocialKeysetCursor | null, limit: number): Promise<Notification[]>;
  unreadCount(userId: string): Promise<number>;
  /** Marks unread items created at or before `upTo` as read. Returns the count marked. */
  markReadUpTo(userId: string, upTo: Date): Promise<number>;
  /** Retention (FRIENDS_LIMITS.activityRetentionDays). */
  deleteOlderThan(date: Date): Promise<number>;
}

export class NotificationRepository implements INotificationRepository {
  async upsertSocial(
    data: SocialNotificationData,
    db: SocialDbClient = prisma,
  ): Promise<Notification> {
    const { userId, kind, actorId } = data;
    return db.notification.upsert({
      where: { userId_kind_actorId: { userId, kind, actorId } },
      create: { userId, kind, actorId },
      update: { createdAt: new Date(), readAt: null },
    });
  }

  async withdraw(
    userId: string,
    kind: NotificationKind,
    actorId: string,
    db: SocialDbClient = prisma,
  ): Promise<number> {
    const { count } = await db.notification.deleteMany({ where: { userId, kind, actorId } });
    return count;
  }

  async withdrawBetween(a: string, b: string, db: SocialDbClient = prisma): Promise<number> {
    const { count } = await db.notification.deleteMany({
      where: {
        OR: [
          { userId: a, actorId: b },
          { userId: b, actorId: a },
        ],
      },
    });
    return count;
  }

  async list(
    userId: string,
    cursor: SocialKeysetCursor | null,
    limit: number,
  ): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: {
        userId,
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markReadUpTo(userId: string, upTo: Date): Promise<number> {
    const { count } = await prisma.notification.updateMany({
      where: { userId, readAt: null, createdAt: { lte: upTo } },
      data: { readAt: new Date() },
    });
    return count;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const { count } = await prisma.notification.deleteMany({ where: { createdAt: { lt: date } } });
    return count;
  }
}

export const notificationRepository = new NotificationRepository();
