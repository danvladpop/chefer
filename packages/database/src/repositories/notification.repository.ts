import type { Notification, NotificationKind, Prisma } from '@prisma/client';
import { prisma } from '../client';
import type { SocialDbClient, SocialKeysetCursor } from './social-profile.repository';

// ─── Following: in-app Activity (docs/friends/implementation-plan.md §2.4) ────
// One row per (recipient, kind, actor): re-sending a request upserts the row
// (fresh createdAt, unread again) instead of stacking duplicates. No push and
// no email (PRD §12) — this table is the whole mechanism.

/**
 * Following's kinds: the only ones `list` / `unreadCount` / `markReadUpTo` and
 * Following's turn-off touch, so a shipped app's Activity inbox never meets a
 * kind it does not know.
 */
export const SOCIAL_NOTIFICATION_KINDS = [
  'FOLLOW_REQUEST',
  'NEW_FOLLOWER',
  'REQUEST_ACCEPTED',
] as const satisfies readonly NotificationKind[];

/** Trainer coaching's kinds (PRD 2026-10 §4.2): read only through `listCoaching`. */
export const COACHING_NOTIFICATION_KINDS = [
  'COACHING_REQUEST',
  'COACHING_REQUEST_ACCEPTED',
  'COACHING_REQUEST_DECLINED',
  'COACHING_ROUTINE_UPDATED',
  'COACHING_ENDED',
  // Trainer mode M3 (§7.1): client-side booking and coached-workout notices.
  'COACHING_BOOKING_CREATED',
  'COACHING_BOOKING_CHANGED',
  'COACHING_BOOKING_CANCELLED',
  'COACHING_WORKOUT_LOGGED',
] as const satisfies readonly NotificationKind[];
export type CoachingNotificationKindDb = (typeof COACHING_NOTIFICATION_KINDS)[number];

/** Household sharing's kinds (ADR 0003): read only through `listHousehold`. */
export const HOUSEHOLD_NOTIFICATION_KINDS = [
  'HOUSEHOLD_PARTNER_JOINED',
  'HOUSEHOLD_PARTNER_LEFT',
  'HOUSEHOLD_REMOVED',
  'HOUSEHOLD_ENDED',
] as const satisfies readonly NotificationKind[];
export type HouseholdNotificationKindDb = (typeof HOUSEHOLD_NOTIFICATION_KINDS)[number];

const SOCIAL_KIND_FILTER = { in: [...SOCIAL_NOTIFICATION_KINDS] };

export interface CoachingNotificationData {
  /** Recipient. */
  userId: string;
  kind: CoachingNotificationKindDb;
  /** The other person; the recipient themself when the other account is being deleted. */
  actorId: string;
  /** What the card renders (JSON). */
  payload: Prisma.InputJsonValue;
}

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

  // ─── Trainer coaching (PRD 2026-10 §4.2) ───
  /** The (userId, kind, actorId) row, read or not: a new routine change folds into its payload while unread. */
  findCoaching(
    userId: string,
    kind: CoachingNotificationKindDb,
    actorId: string,
  ): Promise<Notification | null>;
  /** Create, or refresh the (userId, kind, actorId) row: new payload, createdAt = now, unread. */
  upsertCoaching(data: CoachingNotificationData): Promise<Notification>;
  /**
   * The recipient's coaching notices: unread ones, and read ones created at or
   * after `since`. Newest first. `excludeKinds`: kinds the caller's app cannot
   * render (filtered in the query, so they never crowd out the limit).
   */
  listCoaching(
    userId: string,
    since: Date,
    limit: number,
    excludeKinds?: readonly CoachingNotificationKindDb[],
  ): Promise<Notification[]>;
  /** Marks one of the recipient's coaching notices read. False when it isn't theirs. */
  markCoachingRead(userId: string, id: string): Promise<boolean>;
  /** Withdraws one coaching notice (a cancelled request disappears from the trainer's list). */
  withdrawCoaching(
    userId: string,
    kind: CoachingNotificationKindDb,
    actorId: string,
  ): Promise<number>;
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
        kind: SOCIAL_KIND_FILTER,
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
    return prisma.notification.count({ where: { userId, readAt: null, kind: SOCIAL_KIND_FILTER } });
  }

  async markReadUpTo(userId: string, upTo: Date): Promise<number> {
    const { count } = await prisma.notification.updateMany({
      where: { userId, readAt: null, createdAt: { lte: upTo }, kind: SOCIAL_KIND_FILTER },
      data: { readAt: new Date() },
    });
    return count;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const { count } = await prisma.notification.deleteMany({ where: { createdAt: { lt: date } } });
    return count;
  }

  async findCoaching(
    userId: string,
    kind: CoachingNotificationKindDb,
    actorId: string,
  ): Promise<Notification | null> {
    return prisma.notification.findUnique({
      where: { userId_kind_actorId: { userId, kind, actorId } },
    });
  }

  async upsertCoaching(data: CoachingNotificationData): Promise<Notification> {
    const { userId, kind, actorId, payload } = data;
    return prisma.notification.upsert({
      where: { userId_kind_actorId: { userId, kind, actorId } },
      create: { userId, kind, actorId, payload },
      update: { payload, createdAt: new Date(), readAt: null },
    });
  }

  async listCoaching(
    userId: string,
    since: Date,
    limit: number,
    excludeKinds: readonly CoachingNotificationKindDb[] = [],
  ): Promise<Notification[]> {
    const excluded = new Set<string>(excludeKinds);
    return prisma.notification.findMany({
      where: {
        userId,
        kind: { in: COACHING_NOTIFICATION_KINDS.filter((k) => !excluded.has(k)) },
        OR: [{ readAt: null }, { createdAt: { gte: since } }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  async markCoachingRead(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.notification.updateMany({
      where: { id, userId, kind: { in: [...COACHING_NOTIFICATION_KINDS] }, readAt: null },
      data: { readAt: new Date() },
    });
    if (count > 0) return true;
    // Already read is fine; someone else's id is not.
    return (await prisma.notification.count({ where: { id, userId } })) > 0;
  }

  async withdrawCoaching(
    userId: string,
    kind: CoachingNotificationKindDb,
    actorId: string,
  ): Promise<number> {
    const { count } = await prisma.notification.deleteMany({ where: { userId, kind, actorId } });
    return count;
  }
}

export const notificationRepository = new NotificationRepository();

// ─── Household notices (ADR 0003) ─────────────────────────────────────────────
// Same table, own kinds, own reader — shipped Activity and coaching readers
// filter on their kind lists, so they never meet these.

export class HouseholdNoticeRepository {
  async upsert(data: {
    userId: string;
    kind: HouseholdNotificationKindDb;
    actorId: string;
    name: string;
  }): Promise<Notification> {
    const { userId, kind, actorId, name } = data;
    const payload = { name } satisfies Prisma.InputJsonValue;
    return prisma.notification.upsert({
      where: { userId_kind_actorId: { userId, kind, actorId } },
      create: { userId, kind, actorId, payload },
      update: { payload, createdAt: new Date(), readAt: null },
    });
  }

  /** Unread notices, plus read ones since `since`, newest first. */
  async list(userId: string, since: Date, limit: number): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: {
        userId,
        kind: { in: [...HOUSEHOLD_NOTIFICATION_KINDS] },
        OR: [{ readAt: null }, { createdAt: { gte: since } }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.notification.updateMany({
      where: { id, userId, kind: { in: [...HOUSEHOLD_NOTIFICATION_KINDS] } },
      data: { readAt: new Date() },
    });
    return count > 0;
  }
}

export const householdNoticeRepository = new HouseholdNoticeRepository();
