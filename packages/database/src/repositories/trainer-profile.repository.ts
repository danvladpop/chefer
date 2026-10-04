import type { TrainerProfile } from '@prisma/client';
import { prisma } from '../client';

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
  /** Creates the profile, or turns it back on (clears `disabledAt`, new `activatedAt`). */
  activate(userId: string, displayName: string): Promise<TrainerProfile>;
  /** False when the user has no active profile. */
  updateName(userId: string, displayName: string): Promise<TrainerProfile | null>;
  /**
   * Turns trainer tools off in ONE transaction: every ACTIVE link ENDED
   * (`SYSTEM`) with a withdrawn `COACHING_SHARING` event on each client's log,
   * the trainer's notes hidden, open invites revoked, the profile disabled.
   * Returns the clients whose link ended. No-op (empty) when already off.
   */
  deactivate(userId: string, data: DeactivateTrainerData): Promise<{ endedClientIds: string[] }>;
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

  async activate(userId: string, displayName: string): Promise<TrainerProfile> {
    return prisma.trainerProfile.upsert({
      where: { userId },
      create: { userId, displayName },
      update: { displayName, disabledAt: null, activatedAt: new Date() },
    });
  }

  async updateName(userId: string, displayName: string): Promise<TrainerProfile | null> {
    const res = await prisma.trainerProfile.updateMany({
      where: { userId, disabledAt: null },
      data: { displayName },
    });
    return res.count === 0 ? null : this.find(userId);
  }

  async deactivate(
    userId: string,
    data: DeactivateTrainerData,
  ): Promise<{ endedClientIds: string[] }> {
    return prisma.$transaction(async (tx) => {
      const disabled = await tx.trainerProfile.updateMany({
        where: { userId, disabledAt: null },
        data: { disabledAt: data.now },
      });
      if (disabled.count === 0) return { endedClientIds: [] };

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
      }
      await tx.coachingNote.updateMany({
        where: { trainerId: userId, hiddenAt: null },
        data: { hiddenAt: data.now },
      });
      await tx.coachingInvite.updateMany({
        where: { trainerId: userId, usedAt: null, revokedAt: null },
        data: { revokedAt: data.now },
      });
      return { endedClientIds: links.map((l) => l.clientId) };
    });
  }
}

export const trainerProfileRepository = new TrainerProfileRepository();
