import { Prisma, type CoachingLink, type CoachingRequest } from '@prisma/client';
import { prisma } from '../client';
import {
  closePendingRequestsTx,
  startLinkTx,
  type ClientNameRow,
} from './coaching-link.repository';

// ─── Trainer coaching: coaching requests (PRD 2026-10 §4.1) ───────────────────
// A client asks a trainer to coach them; the trainer accepts or declines. The
// client consents when SENDING (granted `COACHING_SHARING`, `contextId` = the
// request); a cancel, decline or expiry withdraws it on the same row id. An
// accept starts the coaching in one transaction (`startLinkTx`: a switch ends
// the old coaching first) and the link keeps `requestId`.
//
// One PENDING request per client: the raw-SQL partial unique index
// `coaching_requests_one_pending` is the backstop. A PENDING row past
// `expiresAt` reads as expired everywhere and is flipped to EXPIRED (with its
// withdrawn event) before the client's next request and by the maintenance
// worker. A request never creates a follow.

export type CoachingRequestWithClient = CoachingRequest & { client: ClientNameRow };

export interface CreateRequestData {
  clientId: string;
  trainerId: string;
  /** The client's device-local date when asking; anchors the coaching's start on accept. */
  startedOn: string | null;
  expiresAt: Date;
  source: string;
  documentVersion: string;
  now: Date;
}

export type CreateRequestResult =
  | { status: 'created'; request: CoachingRequest }
  /** The client already has a live PENDING request (to anyone). */
  | { status: 'pending_exists'; request: CoachingRequest }
  /** Lost a race with another request by the same client (partial unique index). */
  | { status: 'conflict' };

export interface AcceptRequestData {
  trainerId: string;
  requestId: string;
  maxActiveClients: number;
  /** Fallback start day when the request carries none. */
  startedOn: string | null;
  source: string;
  documentVersion: string;
  now: Date;
}

export type AcceptRequestResult =
  | { status: 'accepted'; request: CoachingRequest; link: CoachingLink; endedLinks: CoachingLink[] }
  /** Unknown, answered, cancelled or expired request, or not this trainer's. */
  | { status: 'unavailable' }
  | { status: 'client_limit' }
  /** The trainer turned tools off meanwhile. */
  | { status: 'trainer_off' }
  /** Lost a race with another coaching start for this client. */
  | { status: 'conflict' };

export interface AnswerRequestData {
  source: string;
  documentVersion: string;
  now: Date;
}

export interface ICoachingRequestRepository {
  /** The client's live request: PENDING and not past `expiresAt`. */
  findLiveForClient(clientId: string, now: Date): Promise<CoachingRequest | null>;
  /** The trainer's live requests with each client's name columns, oldest first. */
  listLiveForTrainer(trainerId: string, now: Date): Promise<CoachingRequestWithClient[]>;
  /**
   * One transaction: expire the client's stale PENDING rows, refuse when a live
   * one exists, create the request and its granted consent event.
   */
  create(data: CreateRequestData): Promise<CreateRequestResult>;
  /** The client cancels their live request (withdrawn event). Null when there was none. */
  cancel(clientId: string, data: AnswerRequestData): Promise<CoachingRequest | null>;
  /** The trainer declines a live request of theirs (withdrawn event). Null when not available. */
  decline(trainerId: string, requestId: string, data: AnswerRequestData): Promise<CoachingRequest | null>;
  /** The trainer accepts: request ACCEPTED and coaching started, in one transaction. */
  accept(data: AcceptRequestData): Promise<AcceptRequestResult>;
  /** Maintenance: flips every PENDING row past `expiresAt` to EXPIRED (withdrawn events). Returns the count. */
  expireDue(data: AnswerRequestData): Promise<number>;
  /** Maintenance: deletes answered / cancelled / expired rows answered before `cutoff`. */
  deleteAnsweredBefore(cutoff: Date): Promise<number>;
}

/** Thrown inside the accept transaction to roll it back with a typed outcome. */
class AcceptAbort extends Error {
  constructor(readonly result: Exclude<AcceptRequestResult, { status: 'accepted' }>) {
    super(result.status);
  }
}

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export class CoachingRequestRepository implements ICoachingRequestRepository {
  async findLiveForClient(clientId: string, now: Date): Promise<CoachingRequest | null> {
    return prisma.coachingRequest.findFirst({
      where: { clientId, status: 'PENDING', expiresAt: { gt: now } },
    });
  }

  async listLiveForTrainer(trainerId: string, now: Date): Promise<CoachingRequestWithClient[]> {
    return prisma.coachingRequest.findMany({
      where: { trainerId, status: 'PENDING', expiresAt: { gt: now } },
      include: { client: { select: { id: true, firstName: true, lastName: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(data: CreateRequestData): Promise<CreateRequestResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        await expireTx(tx, { clientId: data.clientId }, data);
        const live = await tx.coachingRequest.findFirst({
          where: { clientId: data.clientId, status: 'PENDING' },
        });
        if (live) return { status: 'pending_exists', request: live } satisfies CreateRequestResult;
        const request = await tx.coachingRequest.create({
          data: {
            clientId: data.clientId,
            trainerId: data.trainerId,
            startedOn: data.startedOn,
            createdAt: data.now,
            expiresAt: data.expiresAt,
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
            contextId: request.id,
            createdAt: data.now,
          },
        });
        return { status: 'created', request } satisfies CreateRequestResult;
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { status: 'conflict' };
      throw err;
    }
  }

  async cancel(clientId: string, data: AnswerRequestData): Promise<CoachingRequest | null> {
    return prisma.$transaction(async (tx) => {
      await expireTx(tx, { clientId }, data);
      const [closed] = await closePendingRequestsTx(tx, { clientId, status: 'CANCELLED', ...data });
      return closed ?? null;
    });
  }

  async decline(
    trainerId: string,
    requestId: string,
    data: AnswerRequestData,
  ): Promise<CoachingRequest | null> {
    return prisma.$transaction(async (tx) => {
      const request = await tx.coachingRequest.findFirst({
        where: { id: requestId, trainerId, status: 'PENDING', expiresAt: { gt: data.now } },
      });
      if (!request) return null;
      const updated = await tx.coachingRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'DECLINED', respondedAt: data.now },
      });
      if (updated.count === 0) return null;
      await tx.consentEvent.create({
        data: withdrawnEvent(request, data),
      });
      return { ...request, status: 'DECLINED', respondedAt: data.now };
    });
  }

  async accept(data: AcceptRequestData): Promise<AcceptRequestResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        const request = await tx.coachingRequest.findFirst({
          where: {
            id: data.requestId,
            trainerId: data.trainerId,
            status: 'PENDING',
            expiresAt: { gt: data.now },
          },
        });
        if (!request) throw new AcceptAbort({ status: 'unavailable' });
        const trainer = await tx.trainerProfile.findFirst({
          where: { userId: data.trainerId, disabledAt: null },
        });
        if (!trainer) throw new AcceptAbort({ status: 'trainer_off' });
        const active = await tx.coachingLink.count({
          where: { trainerId: data.trainerId, status: 'ACTIVE' },
        });
        if (active >= data.maxActiveClients) throw new AcceptAbort({ status: 'client_limit' });

        // Conditional claim so a double tap starts the coaching once.
        const claimed = await tx.coachingRequest.updateMany({
          where: { id: request.id, status: 'PENDING' },
          data: { status: 'ACCEPTED', respondedAt: data.now },
        });
        if (claimed.count === 0) throw new AcceptAbort({ status: 'unavailable' });

        const { link, endedLinks } = await startLinkTx(tx, {
          trainerId: data.trainerId,
          clientId: request.clientId,
          inviteCode: null,
          requestId: request.id,
          trainerLabel: null,
          startedOn: request.startedOn ?? data.startedOn,
          source: data.source,
          documentVersion: data.documentVersion,
          now: data.now,
          writeGrantedEvent: false,
        });
        return {
          status: 'accepted',
          request: { ...request, status: 'ACCEPTED', respondedAt: data.now },
          link,
          endedLinks,
        } satisfies AcceptRequestResult;
      });
    } catch (err) {
      if (err instanceof AcceptAbort) return err.result;
      if (isUniqueViolation(err)) return { status: 'conflict' };
      throw err;
    }
  }

  async expireDue(data: AnswerRequestData): Promise<number> {
    return prisma.$transaction(async (tx) => (await expireTx(tx, {}, data)).length);
  }

  async deleteAnsweredBefore(cutoff: Date): Promise<number> {
    const res = await prisma.coachingRequest.deleteMany({
      where: { status: { not: 'PENDING' }, respondedAt: { lt: cutoff } },
    });
    return res.count;
  }
}

function withdrawnEvent(request: CoachingRequest, data: AnswerRequestData) {
  return {
    userId: request.clientId,
    kind: 'COACHING_SHARING' as const,
    granted: false,
    providers: [],
    documentVersion: data.documentVersion,
    source: data.source,
    contextId: request.id,
    createdAt: data.now,
  };
}

/** Flips PENDING rows past `expiresAt` (optionally one client's) to EXPIRED with their withdrawn events. */
async function expireTx(
  tx: Prisma.TransactionClient,
  scope: { clientId?: string },
  data: AnswerRequestData,
): Promise<CoachingRequest[]> {
  const due = await tx.coachingRequest.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lte: data.now },
      ...(scope.clientId !== undefined && { clientId: scope.clientId }),
    },
  });
  if (due.length === 0) return [];
  await tx.coachingRequest.updateMany({
    where: { id: { in: due.map((r) => r.id) }, status: 'PENDING' },
    data: { status: 'EXPIRED', respondedAt: data.now },
  });
  await tx.consentEvent.createMany({ data: due.map((r) => withdrawnEvent(r, data)) });
  return due;
}

export const coachingRequestRepository = new CoachingRequestRepository();
