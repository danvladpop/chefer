import { Prisma, type CoachingEndedBy, type CoachingLink } from '@prisma/client';
import { prisma } from '../client';

// ─── Trainer coaching: links (docs/trainer-platform/spec.md §5.1, §8) ─────────
// The trainer ↔ client relationship. Access is decided ONLY from ACTIVE rows.
// Every change that writes a link also writes the consent event on the CLIENT's
// log and hides / un-hides the trainer's private note, in the same transaction.
// The migration's partial unique index (one ACTIVE link per client) is the
// backstop for two concurrent joins: the loser gets `{ status: 'conflict' }`.

export interface ClientNameRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
}

export type ActiveLinkWithClient = CoachingLink & { client: ClientNameRow };

export interface JoinLinkData {
  code: string;
  clientId: string;
  /** Consent-log source: 'web' | 'mobile'. */
  source: string;
  /** The privacy-policy version recorded on the consent events. */
  documentVersion: string;
  /** The trainer's active-client cap, checked inside the transaction. */
  maxActiveClients: number;
  /** The client's device-local date (YYYY-MM-DD) at join, stored as `CoachingLink.startedOn`; null = unknown. */
  startedOn: string | null;
  now: Date;
}

export type JoinLinkResult =
  | { status: 'joined'; link: CoachingLink; endedLinks: CoachingLink[] }
  /** Unknown, used, revoked or expired code, or the trainer turned tools off. */
  | { status: 'invite_unavailable' }
  | { status: 'client_limit' }
  /** Lost a race with another join for the same client (partial unique index). */
  | { status: 'conflict' };

export interface EndLinkData {
  trainerId: string;
  clientId: string;
  endedBy: CoachingEndedBy;
  source: string;
  documentVersion: string;
  now: Date;
}

export interface ICoachingLinkRepository {
  /** The ACTIVE link of this pair, or null. */
  findActivePair(trainerId: string, clientId: string): Promise<CoachingLink | null>;
  /** The client's ACTIVE link (at most one), or null. */
  findActiveForClient(clientId: string): Promise<CoachingLink | null>;
  /** The trainer's ACTIVE links with each client's name columns, oldest first. */
  listActiveForTrainer(trainerId: string): Promise<ActiveLinkWithClient[]>;
  countActiveForTrainer(trainerId: string): Promise<number>;
  /** The client's most recent link ended by the TRAINER or SYSTEM at or after `since`. */
  findLatestStoppedForClient(clientId: string, since: Date): Promise<CoachingLink | null>;
  /**
   * One transaction: claim the invite, end the client's other ACTIVE link
   * (`CLIENT`, withdrawn event, note hidden), create the link, record the
   * granted `COACHING_SHARING` event (`contextId` = the new link), un-hide an
   * earlier note of this pair.
   */
  join(data: JoinLinkData): Promise<JoinLinkResult>;
  /**
   * One transaction: end the pair's ACTIVE link, record the withdrawn event
   * (`contextId` = the link), hide the note. Null when there was no ACTIVE link.
   */
  end(data: EndLinkData): Promise<CoachingLink | null>;
  /** Maintenance: deletes ENDED links that ended before `cutoff`. */
  deleteEndedBefore(cutoff: Date): Promise<number>;
}

/** Thrown inside the join transaction to roll it back with a typed outcome. */
class JoinAbort extends Error {
  constructor(readonly result: Exclude<JoinLinkResult, { status: 'joined' }>) {
    super(result.status);
  }
}

export class CoachingLinkRepository implements ICoachingLinkRepository {
  async findActivePair(trainerId: string, clientId: string): Promise<CoachingLink | null> {
    return prisma.coachingLink.findFirst({ where: { trainerId, clientId, status: 'ACTIVE' } });
  }

  async findActiveForClient(clientId: string): Promise<CoachingLink | null> {
    return prisma.coachingLink.findFirst({ where: { clientId, status: 'ACTIVE' } });
  }

  async listActiveForTrainer(trainerId: string): Promise<ActiveLinkWithClient[]> {
    return prisma.coachingLink.findMany({
      where: { trainerId, status: 'ACTIVE' },
      include: { client: { select: { id: true, firstName: true, lastName: true, name: true } } },
      orderBy: { startedAt: 'asc' },
    });
  }

  async countActiveForTrainer(trainerId: string): Promise<number> {
    return prisma.coachingLink.count({ where: { trainerId, status: 'ACTIVE' } });
  }

  async findLatestStoppedForClient(clientId: string, since: Date): Promise<CoachingLink | null> {
    return prisma.coachingLink.findFirst({
      where: {
        clientId,
        status: 'ENDED',
        endedBy: { in: ['TRAINER', 'SYSTEM'] },
        endedAt: { gte: since },
      },
      orderBy: { endedAt: 'desc' },
    });
  }

  async join(data: JoinLinkData): Promise<JoinLinkResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        const invite = await tx.coachingInvite.findUnique({ where: { code: data.code } });
        if (!invite) throw new JoinAbort({ status: 'invite_unavailable' });
        const trainer = await tx.trainerProfile.findFirst({
          where: { userId: invite.trainerId, disabledAt: null },
        });
        if (!trainer || invite.trainerId === data.clientId) {
          throw new JoinAbort({ status: 'invite_unavailable' });
        }
        // Atomic claim: exactly one of two racing joins with the same code wins.
        const claimed = await tx.coachingInvite.updateMany({
          where: {
            code: data.code,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: data.now },
          },
          data: { usedAt: data.now, usedById: data.clientId },
        });
        if (claimed.count === 0) throw new JoinAbort({ status: 'invite_unavailable' });

        const active = await tx.coachingLink.count({
          where: { trainerId: invite.trainerId, status: 'ACTIVE' },
        });
        if (active >= data.maxActiveClients) throw new JoinAbort({ status: 'client_limit' });

        // A switch: end the client's current link first so the partial unique
        // index never trips for it.
        const previous = await tx.coachingLink.findMany({
          where: { clientId: data.clientId, status: 'ACTIVE' },
        });
        if (previous.length > 0) {
          await tx.coachingLink.updateMany({
            where: { id: { in: previous.map((l) => l.id) } },
            data: { status: 'ENDED', endedAt: data.now, endedBy: 'CLIENT' },
          });
          await tx.consentEvent.createMany({
            data: previous.map((l) => ({
              userId: data.clientId,
              kind: 'COACHING_SHARING' as const,
              granted: false,
              providers: [],
              documentVersion: data.documentVersion,
              source: data.source,
              contextId: l.id,
              createdAt: data.now,
            })),
          });
          for (const l of previous) {
            await tx.coachingNote.updateMany({
              where: { trainerId: l.trainerId, clientId: l.clientId, hiddenAt: null },
              data: { hiddenAt: data.now },
            });
          }
        }

        const link = await tx.coachingLink.create({
          data: {
            trainerId: invite.trainerId,
            clientId: data.clientId,
            inviteCode: invite.code,
            trainerLabel: invite.label,
            startedAt: data.now,
            startedOn: data.startedOn,
          },
        });
        await tx.consentEvent.create({
          data: {
            userId: data.clientId,
            kind: 'COACHING_SHARING',
            granted: true,
            providers: [],
            documentVersion: data.documentVersion,
            source: data.source,
            contextId: link.id,
            createdAt: data.now,
          },
        });
        // The same pair within the retention window gets its private note back.
        await tx.coachingNote.updateMany({
          where: { trainerId: invite.trainerId, clientId: data.clientId, hiddenAt: { not: null } },
          data: { hiddenAt: null },
        });
        return { status: 'joined', link, endedLinks: previous } satisfies JoinLinkResult;
      });
    } catch (err) {
      if (err instanceof JoinAbort) return err.result;
      // The partial unique index: another join for this client committed first.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { status: 'conflict' };
      }
      throw err;
    }
  }

  async end(data: EndLinkData): Promise<CoachingLink | null> {
    return prisma.$transaction(async (tx) => {
      const link = await tx.coachingLink.findFirst({
        where: { trainerId: data.trainerId, clientId: data.clientId, status: 'ACTIVE' },
      });
      if (!link) return null;
      // Conditional claim so a double tap ends (and logs) once.
      const ended = await tx.coachingLink.updateMany({
        where: { id: link.id, status: 'ACTIVE' },
        data: { status: 'ENDED', endedAt: data.now, endedBy: data.endedBy },
      });
      if (ended.count === 0) return null;
      await tx.consentEvent.create({
        data: {
          userId: data.clientId,
          kind: 'COACHING_SHARING',
          granted: false,
          providers: [],
          documentVersion: data.documentVersion,
          source: data.source,
          contextId: link.id,
          createdAt: data.now,
        },
      });
      await tx.coachingNote.updateMany({
        where: { trainerId: data.trainerId, clientId: data.clientId, hiddenAt: null },
        data: { hiddenAt: data.now },
      });
      return { ...link, status: 'ENDED', endedAt: data.now, endedBy: data.endedBy };
    });
  }

  async deleteEndedBefore(cutoff: Date): Promise<number> {
    const res = await prisma.coachingLink.deleteMany({
      where: { status: 'ENDED', endedAt: { lt: cutoff } },
    });
    return res.count;
  }
}

export const coachingLinkRepository = new CoachingLinkRepository();
