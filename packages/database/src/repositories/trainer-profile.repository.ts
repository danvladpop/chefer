import type { TrainerProfile } from '@prisma/client';
import { prisma } from '../client';
import { cancelFutureBookingsTx } from './booking.repository';
import { closePendingRequestsTx, endSharingTx } from './coaching-link.repository';

// ─── Trainer coaching: trainer profiles (docs/trainer-platform/spec.md §5.1) ──
// One row = the user turned trainer tools on. `disabledAt` set = turned off
// (every link ENDED, invites revoked); the row is kept so a former trainer's
// display name still resolves on a client's old "Changed by Ana" stamps.

export interface DeactivateTrainerData {
  /** Consent-log source of the withdrawal events written for each client ('web' | 'mobile'). */
  source: string;
  /** The privacy-policy version recorded on those events. */
  documentVersion: string;
  now: Date;
}

export interface ITrainerProfileRepository {
  /** The row, active or not. */
  find(userId: string): Promise<TrainerProfile | null>;
  /** The row only while trainer tools are ON (`disabledAt` null). */
  findActive(userId: string): Promise<TrainerProfile | null>;
  /** Rows for these ids (active or not), to resolve display names. */
  findMany(userIds: string[]): Promise<TrainerProfile[]>;
  /**
   * Creates the profile, or turns it back on (clears `disabledAt`, new `activatedAt`).
   * `gymLine` undefined = unchanged (null on a new row).
   */
  activate(userId: string, displayName: string, gymLine?: string | null): Promise<TrainerProfile>;
  /** Null when the user has no active profile. `gymLine` undefined = unchanged. */
  updateName(
    userId: string,
    displayName: string,
    gymLine?: string | null,
  ): Promise<TrainerProfile | null>;
  /**
   * Find a trainer (PRD 2026-10 §4.1): ACTIVE trainers who have Following on and
   * are not forced private by moderation, every token matching the trainer
   * display name or the Following search name. NAME ONLY: never selects or
   * filters on email. Ordered by display name, at most `limit`.
   */
  searchFindable(
    tokens: readonly string[],
    excludeIds: readonly string[],
    limit: number,
  ): Promise<TrainerProfile[]>;
  /** The ACTIVE profile when this trainer is findable (Following on, not forced private). */
  findFindable(userId: string): Promise<TrainerProfile | null>;
  /** Every ACTIVE trainer's id and email (the allowlist sweep). */
  listActiveWithEmail(): Promise<{ userId: string; email: string }[]>;
  /**
   * Turns trainer tools off in ONE transaction: every ACTIVE link ENDED
   * (`SYSTEM`) with a withdrawn `COACHING_SHARING` event on each client's log,
   * the trainer's notes hidden, open invites revoked, the profile disabled.
   * Pending coaching requests to the trainer are DECLINED (withdrawn events).
   * Returns the clients whose link ended and whose request was declined.
   * No-op (empty) when already off.
   */
  deactivate(
    userId: string,
    data: DeactivateTrainerData,
  ): Promise<{ endedClientIds: string[]; declinedClientIds: string[] }>;
}

export class TrainerProfileRepository implements ITrainerProfileRepository {
  async find(userId: string): Promise<TrainerProfile | null> {
    return prisma.trainerProfile.findUnique({ where: { userId } });
  }

  async findActive(userId: string): Promise<TrainerProfile | null> {
    return prisma.trainerProfile.findFirst({ where: { userId, disabledAt: null } });
  }

  async findMany(userIds: string[]): Promise<TrainerProfile[]> {
    if (userIds.length === 0) return [];
    return prisma.trainerProfile.findMany({ where: { userId: { in: userIds } } });
  }

  async activate(
    userId: string,
    displayName: string,
    gymLine?: string | null,
  ): Promise<TrainerProfile> {
    return prisma.trainerProfile.upsert({
      where: { userId },
      create: { userId, displayName, gymLine: gymLine ?? null },
      update: {
        displayName,
        ...(gymLine !== undefined && { gymLine }),
        disabledAt: null,
        activatedAt: new Date(),
      },
    });
  }

  async updateName(
    userId: string,
    displayName: string,
    gymLine?: string | null,
  ): Promise<TrainerProfile | null> {
    const res = await prisma.trainerProfile.updateMany({
      where: { userId, disabledAt: null },
      data: { displayName, ...(gymLine !== undefined && { gymLine }) },
    });
    return res.count === 0 ? null : this.find(userId);
  }

  async searchFindable(
    tokens: readonly string[],
    excludeIds: readonly string[],
    limit: number,
  ): Promise<TrainerProfile[]> {
    if (tokens.length === 0) return [];
    return prisma.trainerProfile.findMany({
      where: {
        disabledAt: null,
        userId: { notIn: [...excludeIds] },
        user: { socialProfile: { is: { forcedPrivateAt: null } } },
        AND: tokens.map((token) => ({
          OR: [
            { displayName: { contains: token, mode: 'insensitive' as const } },
            { user: { socialProfile: { is: { searchName: { contains: token } } } } },
          ],
        })),
      },
      orderBy: [{ displayName: 'asc' }, { userId: 'asc' }],
      take: limit,
    });
  }

  async findFindable(userId: string): Promise<TrainerProfile | null> {
    return prisma.trainerProfile.findFirst({
      where: {
        userId,
        disabledAt: null,
        user: { socialProfile: { is: { forcedPrivateAt: null } } },
      },
    });
  }

  async listActiveWithEmail(): Promise<{ userId: string; email: string }[]> {
    const rows = await prisma.trainerProfile.findMany({
      where: { disabledAt: null },
      select: { userId: true, user: { select: { email: true } } },
    });
    return rows.map((r) => ({ userId: r.userId, email: r.user.email }));
  }

  async deactivate(
    userId: string,
    data: DeactivateTrainerData,
  ): Promise<{ endedClientIds: string[]; declinedClientIds: string[] }> {
    return prisma.$transaction(async (tx) => {
      const disabled = await tx.trainerProfile.updateMany({
        where: { userId, disabledAt: null },
        data: { disabledAt: data.now },
      });
      if (disabled.count === 0) return { endedClientIds: [], declinedClientIds: [] };

      const links = await tx.coachingLink.findMany({
        where: { trainerId: userId, status: 'ACTIVE' },
      });
      if (links.length > 0) {
        await tx.coachingLink.updateMany({
          where: { id: { in: links.map((l) => l.id) } },
          data: { status: 'ENDED', endedAt: data.now, endedBy: 'SYSTEM' },
        });
        await tx.consentEvent.createMany({
          data: links.map((l) => ({
            userId: l.clientId,
            kind: 'COACHING_SHARING' as const,
            granted: false,
            providers: [],
            documentVersion: data.documentVersion,
            source: data.source,
            contextId: l.id,
            createdAt: data.now,
          })),
        });
        await endSharingTx(tx, links, data);
        // Trainer mode M3: every client's future bookings with this trainer are cancelled.
        await cancelFutureBookingsTx(tx, {
          trainerId: userId,
          clientIds: links.map((l) => l.clientId),
          now: data.now,
        });
      }
      await tx.coachingNote.updateMany({
        where: { trainerId: userId, hiddenAt: null },
        data: { hiddenAt: data.now },
      });
      await tx.coachingInvite.updateMany({
        where: { trainerId: userId, usedAt: null, revokedAt: null },
        data: { revokedAt: data.now },
      });
      const declined = await closePendingRequestsTx(tx, {
        trainerId: userId,
        status: 'DECLINED',
        source: data.source,
        documentVersion: data.documentVersion,
        now: data.now,
      });
      return {
        endedClientIds: links.map((l) => l.clientId),
        declinedClientIds: declined.map((r) => r.clientId),
      };
    });
  }
}

export const trainerProfileRepository = new TrainerProfileRepository();
