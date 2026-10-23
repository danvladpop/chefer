import {
  Prisma,
  type CoachingEndedBy,
  type CoachingLink,
  type CoachingRequest,
} from '@prisma/client';
import { prisma } from '../client';
import { cancelFutureBookingsTx } from './booking.repository';

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
  /** Trainer mode M3 (§10): the consent copy version the client agreed to (default 1). */
  consentCopyVersion?: number;
  /** The granted event's `documentVersion` (default: `documentVersion`), e.g. "<privacy>+coaching-v2". */
  grantedDocumentVersion?: string;
  /** Lane K1: the consent screen's food / weight switches (default: share nothing). */
  share?: ShareChoice;
  /** The granted sharing events' `documentVersion`, e.g. "<privacy>+coaching-data-v1". */
  shareDocumentVersion?: string;
}

export type JoinLinkResult =
  | { status: 'joined'; link: CoachingLink; endedLinks: CoachingLink[] }
  /** Unknown, used, revoked or expired code, or the trainer turned tools off. */
  | { status: 'invite_unavailable' }
  | { status: 'client_limit' }
  /** Lost a race with another join for the same client (partial unique index). */
  | { status: 'conflict' };

/**
 * Lane K1: the client's food / weight switches as stored on a link
 * (`shareFoodAt` / `shareWeightAt`, null = off), and as asked on a request.
 */
export interface ShareChoice {
  food: boolean;
  weight: boolean;
}

export interface SetSharingData {
  clientId: string;
  /** Undefined = leave that switch as it is. */
  food?: boolean | undefined;
  weight?: boolean | undefined;
  source: string;
  /** The granted events' `documentVersion` ("<privacy>+coaching-data-v1"). */
  grantedDocumentVersion: string;
  /** The withdrawn events' `documentVersion` (the privacy version, like every withdrawal). */
  documentVersion: string;
  now: Date;
}

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
  /** ACTIVE client counts per trainer (missing = 0). */
  countActiveForTrainers(trainerIds: readonly string[]): Promise<Map<string, number>>;
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
  /**
   * Trainer mode M3 (§10): the client read a newer consent copy. One
   * transaction: the ACTIVE link's `consentCopyVersion` is raised and a granted
   * `COACHING_SHARING` event records it (`contextId` = the link). False when
   * there is no ACTIVE link or it already has this version (idempotent).
   */
  acknowledgeConsentCopy(data: {
    clientId: string;
    version: number;
    source: string;
    documentVersion: string;
    now: Date;
  }): Promise<boolean>;
  /**
   * Lane K1: the client turns food / weight sharing on or off for their ACTIVE
   * coaching. One transaction: the link's `shareFoodAt` / `shareWeightAt` and a
   * COACHING_SHARING event per switch that actually changed (`providers`
   * ['FOOD'] / ['WEIGHT'], `contextId` = the link). Null when there is no
   * ACTIVE link. Idempotent: a switch already in that state writes nothing.
   */
  setSharing(data: SetSharingData): Promise<CoachingLink | null>;
}

/** The transaction client handed to `prisma.$transaction(async (tx) => …)`. */
export type CoachingTx = Prisma.TransactionClient;

export interface StartLinkData {
  trainerId: string;
  clientId: string;
  inviteCode: string | null;
  requestId: string | null;
  trainerLabel: string | null;
  startedOn: string | null;
  source: string;
  documentVersion: string;
  now: Date;
  /**
   * An invite join records the client's consent now (`contextId` = the link).
   * An accepted coaching request does not: the client consented when sending
   * it (`contextId` = the request), and the link keeps `requestId`.
   */
  writeGrantedEvent: boolean;
  /** Trainer mode M3 (§10): stored on the link (default 1 = the pre-bookings copy). */
  consentCopyVersion?: number;
  /** The granted event's `documentVersion` (default: `documentVersion`). */
  grantedDocumentVersion?: string;
  /**
   * Lane K1: what the client chose to share from the start (default nothing).
   * Written as granted sharing events when `writeGrantedEvent` (an invite join);
   * an accepted request's choices were logged when the client sent it.
   */
  share?: ShareChoice;
  /** The granted sharing events' `documentVersion` (default: `documentVersion`). */
  shareDocumentVersion?: string;
}

/** The consent events for the switches of `share` that are on (lane K1). */
function sharingEvents(
  data: {
    clientId: string;
    granted: boolean;
    contextId: string;
    documentVersion: string;
    source: string;
    now: Date;
  },
  share: ShareChoice,
): Prisma.ConsentEventCreateManyInput[] {
  const kinds = [...(share.food ? ['FOOD'] : []), ...(share.weight ? ['WEIGHT'] : [])];
  return kinds.map((kind) => ({
    userId: data.clientId,
    kind: 'COACHING_SHARING' as const,
    granted: data.granted,
    providers: [kind],
    documentVersion: data.documentVersion,
    source: data.source,
    contextId: data.contextId,
    createdAt: data.now,
  }));
}

/**
 * Inside a transaction, for links that are ending: a withdrawn sharing event
 * for every switch that was on, and the switches cleared, so an ended link
 * never reads as sharing (lane K1). Access needs an ACTIVE link anyway.
 */
export async function endSharingTx(
  tx: CoachingTx,
  links: readonly Pick<CoachingLink, 'id' | 'clientId' | 'shareFoodAt' | 'shareWeightAt'>[],
  data: { source: string; documentVersion: string; now: Date },
): Promise<void> {
  const sharing = links.filter((l) => l.shareFoodAt !== null || l.shareWeightAt !== null);
  if (sharing.length === 0) return;
  await tx.consentEvent.createMany({
    data: sharing.flatMap((l) =>
      sharingEvents(
        { clientId: l.clientId, granted: false, contextId: l.id, ...data },
        { food: l.shareFoodAt !== null, weight: l.shareWeightAt !== null },
      ),
    ),
  });
  await tx.coachingLink.updateMany({
    where: { id: { in: sharing.map((l) => l.id) } },
    data: { shareFoodAt: null, shareWeightAt: null },
  });
}

/**
 * Inside a transaction: ends the client's other ACTIVE link (a switch: `CLIENT`,
 * withdrawn event, note hidden) BEFORE creating the new one, so the partial
 * unique index never trips for it; creates the link; un-hides an earlier note
 * of this pair (the 30-day reconnection window). Shared by invite joins and
 * accepted coaching requests.
 */
export async function startLinkTx(
  tx: CoachingTx,
  data: StartLinkData,
): Promise<{ link: CoachingLink; endedLinks: CoachingLink[] }> {
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
    await endSharingTx(tx, previous, data);
    for (const l of previous) {
      await tx.coachingNote.updateMany({
        where: { trainerId: l.trainerId, clientId: l.clientId, hiddenAt: null },
        data: { hiddenAt: data.now },
      });
      // Trainer mode M3: the old trainer's future bookings with this client are cancelled.
      await cancelFutureBookingsTx(tx, {
        trainerId: l.trainerId,
        clientIds: [l.clientId],
        now: data.now,
      });
    }
  }

  // Coaching started some other way (an invite, or the trainer accepted this
  // request, already marked ACCEPTED): any other pending request is moot.
  await closePendingRequestsTx(tx, {
    clientId: data.clientId,
    status: 'CANCELLED',
    source: data.source,
    documentVersion: data.documentVersion,
    now: data.now,
  });

  const link = await tx.coachingLink.create({
    data: {
      trainerId: data.trainerId,
      clientId: data.clientId,
      inviteCode: data.inviteCode,
      requestId: data.requestId,
      trainerLabel: data.trainerLabel,
      startedAt: data.now,
      startedOn: data.startedOn,
      ...(data.consentCopyVersion !== undefined && {
        consentCopyVersion: data.consentCopyVersion,
      }),
      ...(data.share?.food && { shareFoodAt: data.now }),
      ...(data.share?.weight && { shareWeightAt: data.now }),
    },
  });
  if (data.writeGrantedEvent) {
    await tx.consentEvent.create({
      data: {
        userId: data.clientId,
        kind: 'COACHING_SHARING',
        granted: true,
        providers: [],
        documentVersion: data.grantedDocumentVersion ?? data.documentVersion,
        source: data.source,
        contextId: link.id,
        createdAt: data.now,
      },
    });
    if (data.share) {
      const events = sharingEvents(
        {
          clientId: data.clientId,
          granted: true,
          contextId: link.id,
          documentVersion: data.shareDocumentVersion ?? data.documentVersion,
          source: data.source,
          now: data.now,
        },
        data.share,
      );
      if (events.length > 0) await tx.consentEvent.createMany({ data: events });
    }
  }
  // The same pair within the retention window gets its private note back.
  await tx.coachingNote.updateMany({
    where: { trainerId: data.trainerId, clientId: data.clientId, hiddenAt: { not: null } },
    data: { hiddenAt: null },
  });
  return { link, endedLinks: previous };
}

/**
 * Inside a transaction: closes PENDING coaching requests (one client's, or every
 * one sent to a trainer) with `status`, and logs the withdrawn `COACHING_SHARING`
 * event (`contextId` = the request) on each client's log. Returns the closed rows.
 */
export async function closePendingRequestsTx(
  tx: CoachingTx,
  data: {
    clientId?: string;
    trainerId?: string;
    status: 'CANCELLED' | 'DECLINED' | 'EXPIRED';
    source: string;
    documentVersion: string;
    now: Date;
  },
): Promise<CoachingRequest[]> {
  const where = {
    status: 'PENDING' as const,
    ...(data.clientId !== undefined && { clientId: data.clientId }),
    ...(data.trainerId !== undefined && { trainerId: data.trainerId }),
  };
  const rows = await tx.coachingRequest.findMany({ where });
  if (rows.length === 0) return [];
  await tx.coachingRequest.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, status: 'PENDING' },
    data: { status: data.status, respondedAt: data.now },
  });
  await tx.consentEvent.createMany({
    data: rows.map((r) => ({
      userId: r.clientId,
      kind: 'COACHING_SHARING' as const,
      granted: false,
      providers: [],
      documentVersion: data.documentVersion,
      source: data.source,
      contextId: r.id,
      createdAt: data.now,
    })),
  });
  return rows;
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

  async countActiveForTrainers(trainerIds: readonly string[]): Promise<Map<string, number>> {
    if (trainerIds.length === 0) return new Map();
    const rows = await prisma.coachingLink.groupBy({
      by: ['trainerId'],
      where: { trainerId: { in: [...trainerIds] }, status: 'ACTIVE' },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.trainerId, r._count._all]));
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

        const { link, endedLinks } = await startLinkTx(tx, {
          trainerId: invite.trainerId,
          clientId: data.clientId,
          inviteCode: invite.code,
          requestId: null,
          trainerLabel: invite.label,
          startedOn: data.startedOn,
          source: data.source,
          documentVersion: data.documentVersion,
          now: data.now,
          writeGrantedEvent: true,
          ...(data.consentCopyVersion !== undefined && {
            consentCopyVersion: data.consentCopyVersion,
          }),
          ...(data.grantedDocumentVersion !== undefined && {
            grantedDocumentVersion: data.grantedDocumentVersion,
          }),
          ...(data.share !== undefined && { share: data.share }),
          ...(data.shareDocumentVersion !== undefined && {
            shareDocumentVersion: data.shareDocumentVersion,
          }),
        });
        return { status: 'joined', link, endedLinks } satisfies JoinLinkResult;
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
      await endSharingTx(tx, [link], data);
      await tx.coachingNote.updateMany({
        where: { trainerId: data.trainerId, clientId: data.clientId, hiddenAt: null },
        data: { hiddenAt: data.now },
      });
      // Trainer mode M3: the client's future bookings with this trainer are cancelled.
      await cancelFutureBookingsTx(tx, {
        trainerId: data.trainerId,
        clientIds: [data.clientId],
        now: data.now,
      });
      return {
        ...link,
        status: 'ENDED',
        endedAt: data.now,
        endedBy: data.endedBy,
        shareFoodAt: null,
        shareWeightAt: null,
      };
    });
  }

  async acknowledgeConsentCopy(data: {
    clientId: string;
    version: number;
    source: string;
    documentVersion: string;
    now: Date;
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const link = await tx.coachingLink.findFirst({
        where: { clientId: data.clientId, status: 'ACTIVE' },
      });
      if (!link) return false;
      const raised = await tx.coachingLink.updateMany({
        where: { id: link.id, status: 'ACTIVE', consentCopyVersion: { lt: data.version } },
        data: { consentCopyVersion: data.version },
      });
      if (raised.count === 0) return false;
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
      return true;
    });
  }

  async setSharing(data: SetSharingData): Promise<CoachingLink | null> {
    return prisma.$transaction(async (tx) => {
      const link = await tx.coachingLink.findFirst({
        where: { clientId: data.clientId, status: 'ACTIVE' },
      });
      if (!link) return null;
      const turnOn = {
        food: data.food === true && link.shareFoodAt === null,
        weight: data.weight === true && link.shareWeightAt === null,
      };
      const turnOff = {
        food: data.food === false && link.shareFoodAt !== null,
        weight: data.weight === false && link.shareWeightAt !== null,
      };
      const changed = turnOn.food || turnOn.weight || turnOff.food || turnOff.weight;
      if (!changed) return link;
      const updated = await tx.coachingLink.update({
        where: { id: link.id },
        data: {
          ...(turnOn.food && { shareFoodAt: data.now }),
          ...(turnOff.food && { shareFoodAt: null }),
          ...(turnOn.weight && { shareWeightAt: data.now }),
          ...(turnOff.weight && { shareWeightAt: null }),
        },
      });
      const base = {
        clientId: data.clientId,
        contextId: link.id,
        source: data.source,
        now: data.now,
      };
      await tx.consentEvent.createMany({
        data: [
          ...sharingEvents(
            { ...base, granted: true, documentVersion: data.grantedDocumentVersion },
            turnOn,
          ),
          ...sharingEvents(
            { ...base, granted: false, documentVersion: data.documentVersion },
            turnOff,
          ),
        ],
      });
      return updated;
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
