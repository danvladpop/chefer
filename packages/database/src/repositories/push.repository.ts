import type { Prisma, PushDevice, PushOutbox, PushPlatform } from '@prisma/client';
import { prisma } from '../client';

// ─── Push notifications (docs/prd-2026-10/trainer-mode.md §7.2, §8.4, §10; M4) ──
// Devices (one Expo token belongs to one user at a time), the §7.2 switches
// (a missing row = the default) and the outbox the push-delivery worker drains.
// Writes that join a domain change take `db` (a transaction client), so the
// outbox row commits or rolls back with it. Tokens never leave this layer in
// logs or errors: callers only ever log counts.

export type PushDbClient = Prisma.TransactionClient;

export interface RegisterPushDeviceData {
  userId: string;
  token: string;
  platform: PushPlatform;
  appVersion: string;
  now: Date;
}

/** What the worker sends to: id (for receipts) and token. */
export interface PushDeviceTarget {
  id: string;
  expoPushToken: string;
}

/** A user's device without the token (the GDPR export, support). */
export type PushDeviceSummary = Pick<
  PushDevice,
  'platform' | 'appVersion' | 'lastSeenAt' | 'createdAt'
>;

export interface IPushDeviceRepository {
  /** Upsert by token: a token signed in on another account moves to `userId`; lastSeenAt = now. */
  register(data: RegisterPushDeviceData): Promise<PushDevice>;
  /** Deletes `token` if it is `userId`'s (sign out). Returns whether a row went. */
  unregister(userId: string, token: string): Promise<boolean>;
  /** The user's devices, most recently seen first, at most `limit`. */
  listTargets(userId: string, limit: number): Promise<PushDeviceTarget[]>;
  /** For several users at once (the worker), most recently seen first per user. */
  listTargetsForUsers(
    userIds: readonly string[],
    perUser: number,
  ): Promise<Map<string, PushDeviceTarget[]>>;
  /** Devices for the export (never the token). */
  listForExport(userId: string): Promise<PushDeviceSummary[]>;
  hasDevice(userId: string, db?: PushDbClient): Promise<boolean>;
  /** Expo said DeviceNotRegistered. */
  deleteByIds(ids: readonly string[]): Promise<number>;
  /** Retention (§10): devices unseen since `cutoff`. */
  pruneUnseenBefore(cutoff: Date): Promise<number>;
}

export interface IPushPreferenceRepository {
  /** The rows the user has (keys never set are absent: the default applies). */
  list(userId: string, db?: PushDbClient): Promise<{ key: string; enabled: boolean }[]>;
  /** One key's stored value, or null (the default applies). */
  find(userId: string, key: string, db?: PushDbClient): Promise<boolean | null>;
  set(userId: string, key: string, enabled: boolean): Promise<void>;
}

export interface EnqueuePushData {
  userId: string;
  kind: string;
  actorId: string | null;
  payload: Prisma.InputJsonValue;
  dedupeKey: string;
}

export interface IPushOutboxRepository {
  /** Idempotent on `dedupeKey`: false when that key was already enqueued. */
  enqueue(data: EnqueuePushData, db?: PushDbClient): Promise<boolean>;
  /** Rows for (recipient, kind, actor) created at or after `since` (the throttle). */
  recentForThrottle(
    userId: string,
    kind: string,
    actorId: string | null,
    since: Date,
    db?: PushDbClient,
  ): Promise<number>;
  /** Unsent rows created at or after `notBefore` with attempts < `maxAttempts`, oldest first. */
  claimDue(limit: number, notBefore: Date, maxAttempts: number): Promise<PushOutbox[]>;
  /** Sent: `ticketIds` are what receipts are checked for (none = nothing to check). */
  markSent(id: string, ticketIds: readonly string[], now: Date): Promise<void>;
  /** A failed attempt: attempts + 1, the error code (never a token). */
  markFailed(id: string, error: string): Promise<void>;
  /** Sent rows with tickets, sent at or before `before`, receipts not yet checked; oldest first. */
  rowsAwaitingReceipts(before: Date, limit: number): Promise<PushOutbox[]>;
  markReceiptsChecked(ids: readonly string[], now: Date): Promise<void>;
  /** Retention (§10): rows sent before `cutoff`. */
  deleteSentBefore(cutoff: Date): Promise<number>;
  /** Unsent rows created before `cutoff` (given up, or stale while delivery was off). */
  deleteUnsentBefore(cutoff: Date): Promise<number>;
}

export class PushDeviceRepository implements IPushDeviceRepository {
  register(data: RegisterPushDeviceData): Promise<PushDevice> {
    return prisma.pushDevice.upsert({
      where: { expoPushToken: data.token },
      create: {
        userId: data.userId,
        expoPushToken: data.token,
        platform: data.platform,
        appVersion: data.appVersion,
        lastSeenAt: data.now,
      },
      update: {
        userId: data.userId,
        platform: data.platform,
        appVersion: data.appVersion,
        lastSeenAt: data.now,
      },
    });
  }

  async unregister(userId: string, token: string): Promise<boolean> {
    const { count } = await prisma.pushDevice.deleteMany({
      where: { userId, expoPushToken: token },
    });
    return count > 0;
  }

  listTargets(userId: string, limit: number): Promise<PushDeviceTarget[]> {
    return prisma.pushDevice.findMany({
      where: { userId },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
      take: limit,
      select: { id: true, expoPushToken: true },
    });
  }

  async listTargetsForUsers(
    userIds: readonly string[],
    perUser: number,
  ): Promise<Map<string, PushDeviceTarget[]>> {
    const out = new Map<string, PushDeviceTarget[]>();
    if (userIds.length === 0) return out;
    const rows = await prisma.pushDevice.findMany({
      where: { userId: { in: [...new Set(userIds)] } },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
      select: { id: true, userId: true, expoPushToken: true },
    });
    for (const row of rows) {
      const list = out.get(row.userId) ?? [];
      if (list.length < perUser) list.push({ id: row.id, expoPushToken: row.expoPushToken });
      out.set(row.userId, list);
    }
    return out;
  }

  listForExport(userId: string): Promise<PushDeviceSummary[]> {
    return prisma.pushDevice.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { platform: true, appVersion: true, lastSeenAt: true, createdAt: true },
    });
  }

  async hasDevice(userId: string, db: PushDbClient = prisma): Promise<boolean> {
    const row = await db.pushDevice.findFirst({ where: { userId }, select: { id: true } });
    return row !== null;
  }

  async deleteByIds(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await prisma.pushDevice.deleteMany({ where: { id: { in: [...ids] } } });
    return count;
  }

  async pruneUnseenBefore(cutoff: Date): Promise<number> {
    const { count } = await prisma.pushDevice.deleteMany({ where: { lastSeenAt: { lt: cutoff } } });
    return count;
  }
}

export class PushPreferenceRepository implements IPushPreferenceRepository {
  list(userId: string, db: PushDbClient = prisma): Promise<{ key: string; enabled: boolean }[]> {
    return db.pushPreference.findMany({
      where: { userId },
      select: { key: true, enabled: true },
    });
  }

  async find(userId: string, key: string, db: PushDbClient = prisma): Promise<boolean | null> {
    const row = await db.pushPreference.findUnique({
      where: { userId_key: { userId, key } },
      select: { enabled: true },
    });
    return row?.enabled ?? null;
  }

  async set(userId: string, key: string, enabled: boolean): Promise<void> {
    await prisma.pushPreference.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, enabled },
      update: { enabled },
    });
  }
}

export class PushOutboxRepository implements IPushOutboxRepository {
  async enqueue(data: EnqueuePushData, db: PushDbClient = prisma): Promise<boolean> {
    // skipDuplicates (ON CONFLICT DO NOTHING) never aborts a surrounding transaction.
    const { count } = await db.pushOutbox.createMany({
      data: [
        {
          userId: data.userId,
          kind: data.kind,
          actorId: data.actorId,
          payload: data.payload,
          dedupeKey: data.dedupeKey,
        },
      ],
      skipDuplicates: true,
    });
    return count > 0;
  }

  recentForThrottle(
    userId: string,
    kind: string,
    actorId: string | null,
    since: Date,
    db: PushDbClient = prisma,
  ): Promise<number> {
    return db.pushOutbox.count({ where: { userId, kind, actorId, createdAt: { gte: since } } });
  }

  claimDue(limit: number, notBefore: Date, maxAttempts: number): Promise<PushOutbox[]> {
    return prisma.pushOutbox.findMany({
      where: { sentAt: null, attempts: { lt: maxAttempts }, createdAt: { gte: notBefore } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  async markSent(id: string, ticketIds: readonly string[], now: Date): Promise<void> {
    await prisma.pushOutbox.update({
      where: { id },
      data: {
        sentAt: now,
        ticketIds: [...ticketIds],
        // Nothing to look up later: the receipts pass skips it.
        ...(ticketIds.length === 0 && { receiptsCheckedAt: now }),
      },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await prisma.pushOutbox.update({
      where: { id },
      data: { attempts: { increment: 1 }, lastError: error.slice(0, 200) },
    });
  }

  rowsAwaitingReceipts(before: Date, limit: number): Promise<PushOutbox[]> {
    return prisma.pushOutbox.findMany({
      where: {
        sentAt: { lte: before },
        receiptsCheckedAt: null,
        NOT: { ticketIds: { isEmpty: true } },
      },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  async markReceiptsChecked(ids: readonly string[], now: Date): Promise<void> {
    if (ids.length === 0) return;
    await prisma.pushOutbox.updateMany({
      where: { id: { in: [...ids] } },
      data: { receiptsCheckedAt: now },
    });
  }

  async deleteSentBefore(cutoff: Date): Promise<number> {
    const { count } = await prisma.pushOutbox.deleteMany({ where: { sentAt: { lt: cutoff } } });
    return count;
  }

  async deleteUnsentBefore(cutoff: Date): Promise<number> {
    const { count } = await prisma.pushOutbox.deleteMany({
      where: { sentAt: null, createdAt: { lt: cutoff } },
    });
    return count;
  }
}

export const pushDeviceRepository = new PushDeviceRepository();
export const pushPreferenceRepository = new PushPreferenceRepository();
export const pushOutboxRepository = new PushOutboxRepository();
