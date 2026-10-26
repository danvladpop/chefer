import { Prisma, type CoachingCheckIn } from '@prisma/client';
import { prisma } from '../client';

// ─── Trainer coaching: weekly check-ins (lane K3) ─────────────────────────────
// One row per (trainer, client, period). The client may change their answers
// until the next check-in opens (an upsert). Access is decided by the API
// (an ACTIVE coaching), never by this repository.

export interface UpsertCheckInData {
  trainerId: string;
  clientId: string;
  periodStart: string;
  questions: string[];
  answers: Record<string, number>;
  note: string | null;
  now: Date;
}

/** Who gets the check-in email for one trainer's period. */
export interface CheckInEmailRecipient {
  trainerId: string;
  trainerName: string;
  clientId: string;
  email: string;
  firstName: string | null;
}

export interface ICoachingCheckInRepository {
  find(trainerId: string, clientId: string, periodStart: string): Promise<CoachingCheckIn | null>;
  upsert(data: UpsertCheckInData): Promise<{ checkIn: CoachingCheckIn; created: boolean }>;
  /** Newest first. */
  listForPair(trainerId: string, clientId: string, take: number): Promise<CoachingCheckIn[]>;
  /**
   * The email sweep: ACTIVE clients of active trainers whose check-ins are on
   * for `day`, with a confirmed address and check-in emails on, and no
   * `email_sends` claim for (`kind`, `claimDate`) yet.
   */
  findEmailRecipients(data: {
    day: number;
    kind: string;
    claimDate: Date;
  }): Promise<CheckInEmailRecipient[]>;
  /** Claims the check-in email for (user, kind, date) in `email_sends`; false when already claimed. */
  claimEmail(userId: string, kind: string, claimDate: Date): Promise<boolean>;
  /** Releases a claim whose email failed, so a later tick retries it. */
  releaseEmail(userId: string, kind: string, claimDate: Date): Promise<void>;
  /** Maintenance: check-ins older than `cutoff` of pairs with no ACTIVE coaching. */
  deleteOrphanedBefore(cutoff: Date): Promise<number>;
}

export class CoachingCheckInRepository implements ICoachingCheckInRepository {
  async find(trainerId: string, clientId: string, periodStart: string) {
    return prisma.coachingCheckIn.findUnique({
      where: { trainerId_clientId_periodStart: { trainerId, clientId, periodStart } },
    });
  }

  async upsert(data: UpsertCheckInData) {
    const where = {
      trainerId_clientId_periodStart: {
        trainerId: data.trainerId,
        clientId: data.clientId,
        periodStart: data.periodStart,
      },
    };
    const existing = await prisma.coachingCheckIn.findUnique({ where, select: { id: true } });
    const fields = {
      questions: data.questions,
      answers: data.answers as Prisma.InputJsonObject,
      note: data.note,
      submittedAt: data.now,
    };
    const checkIn = await prisma.coachingCheckIn.upsert({
      where,
      create: {
        trainerId: data.trainerId,
        clientId: data.clientId,
        periodStart: data.periodStart,
        ...fields,
      },
      update: fields,
    });
    return { checkIn, created: existing === null };
  }

  async listForPair(trainerId: string, clientId: string, take: number) {
    return prisma.coachingCheckIn.findMany({
      where: { trainerId, clientId },
      orderBy: { periodStart: 'desc' },
      take,
    });
  }

  async findEmailRecipients(data: { day: number; kind: string; claimDate: Date }) {
    const links = await prisma.coachingLink.findMany({
      where: {
        status: 'ACTIVE',
        trainer: {
          trainerProfile: { disabledAt: null, checkInEnabled: true, checkInDay: data.day },
        },
        client: {
          emailVerified: { not: null },
          coachingCheckInEmail: true,
          emailSends: { none: { kind: data.kind, weekStart: data.claimDate } },
        },
      },
      select: {
        trainerId: true,
        clientId: true,
        trainer: { select: { trainerProfile: { select: { displayName: true } } } },
        client: { select: { email: true, firstName: true } },
      },
    });
    return links.map((l) => ({
      trainerId: l.trainerId,
      trainerName: l.trainer.trainerProfile?.displayName ?? 'Your trainer',
      clientId: l.clientId,
      email: l.client.email,
      firstName: l.client.firstName,
    }));
  }

  async claimEmail(userId: string, kind: string, claimDate: Date): Promise<boolean> {
    try {
      await prisma.emailSend.create({ data: { userId, kind, weekStart: claimDate } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async releaseEmail(userId: string, kind: string, claimDate: Date): Promise<void> {
    await prisma.emailSend.deleteMany({ where: { userId, kind, weekStart: claimDate } });
  }

  async deleteOrphanedBefore(cutoff: Date): Promise<number> {
    const old = await prisma.coachingCheckIn.findMany({
      where: { submittedAt: { lt: cutoff } },
      select: { id: true, trainerId: true, clientId: true },
    });
    if (old.length === 0) return 0;
    const active = await prisma.coachingLink.findMany({
      where: {
        status: 'ACTIVE',
        OR: old.map((c) => ({ trainerId: c.trainerId, clientId: c.clientId })),
      },
      select: { trainerId: true, clientId: true },
    });
    const live = new Set(active.map((l) => `${l.trainerId}\u0000${l.clientId}`));
    const ids = old.filter((c) => !live.has(`${c.trainerId}\u0000${c.clientId}`)).map((c) => c.id);
    if (ids.length === 0) return 0;
    const res = await prisma.coachingCheckIn.deleteMany({ where: { id: { in: ids } } });
    return res.count;
  }
}

export const coachingCheckInRepository = new CoachingCheckInRepository();
