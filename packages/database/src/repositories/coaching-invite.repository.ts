import type { CoachingInvite } from '@prisma/client';
import { prisma } from '../client';

// ─── Trainer coaching: invites (docs/trainer-platform/spec.md §5.1) ───────────
// Single use. The 10-character code is the only secret. Joining claims the row
// inside the join transaction (CoachingLinkRepository.join).

export interface CreateInviteData {
  code: string;
  trainerId: string;
  label: string | null;
  expiresAt: Date;
}

export interface ICoachingInviteRepository {
  /** Throws a Prisma P2002 when the code already exists (the service retries with a new code). */
  create(data: CreateInviteData): Promise<CoachingInvite>;
  find(code: string): Promise<CoachingInvite | null>;
  /** The trainer's invites created at or after `since`, newest first. */
  listForTrainer(trainerId: string, since: Date): Promise<CoachingInvite[]>;
  /** Invites that are still usable (not used, not revoked, not expired). */
  countOpen(trainerId: string, now: Date): Promise<number>;
  /** Invites created by the trainer since `since` (daily rate limit survives a restart). */
  countCreatedSince(trainerId: string, since: Date): Promise<number>;
  /** True when an unused, unrevoked invite of this trainer was revoked. */
  revoke(trainerId: string, code: string, now: Date): Promise<boolean>;
  /** Maintenance: deletes invites that expired before `cutoff`. */
  deleteExpiredBefore(cutoff: Date): Promise<number>;
}

export class CoachingInviteRepository implements ICoachingInviteRepository {
  async create(data: CreateInviteData): Promise<CoachingInvite> {
    return prisma.coachingInvite.create({ data });
  }

  async find(code: string): Promise<CoachingInvite | null> {
    return prisma.coachingInvite.findUnique({ where: { code } });
  }

  async listForTrainer(trainerId: string, since: Date): Promise<CoachingInvite[]> {
    return prisma.coachingInvite.findMany({
      where: { trainerId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async countOpen(trainerId: string, now: Date): Promise<number> {
    return prisma.coachingInvite.count({
      where: { trainerId, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
    });
  }

  async countCreatedSince(trainerId: string, since: Date): Promise<number> {
    return prisma.coachingInvite.count({ where: { trainerId, createdAt: { gte: since } } });
  }

  async revoke(trainerId: string, code: string, now: Date): Promise<boolean> {
    const res = await prisma.coachingInvite.updateMany({
      where: { code, trainerId, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    return res.count > 0;
  }

  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    const res = await prisma.coachingInvite.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    return res.count;
  }
}

export const coachingInviteRepository = new CoachingInviteRepository();
