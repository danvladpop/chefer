import { TRPCError } from '@trpc/server';
import {
  blockRepository,
  coachingLinkRepository,
  coachingRequestRepository,
  gymProfileRepository,
  trainerProfileRepository,
  type CoachingRequest,
  type IBlockRepository,
  type ICoachingLinkRepository,
  type ICoachingRequestRepository,
  type IGymProfileRepository,
  type ITrainerProfileRepository,
  type TrainerProfile,
} from '@chefer/database';
import {
  COACHING_CONSENT_COPY_VERSION,
  COACHING_COPY,
  COACHING_LIMITS,
  FALLBACK_TRAINER_NAME,
  LEGAL_VERSIONS,
  type CoachingRequestDto,
  type CoachingSource,
  type Page,
  type TrainerCardDto,
  type TrainerRequestDto,
  type TrainerSummaryDto,
} from '@chefer/types';
import { displayNameOf, queryTokens } from '@chefer/utils';
import { resolveStartedOn } from './coaching-dto.mappers.js';
import { coachingNoticeService, type CoachingNoticeService } from './coaching-notice.service.js';
import { COACHING_CONSENT_DOCUMENT_VERSION } from './consent-copy.js';

// ─── Trainer coaching: Find a trainer + coaching requests (PRD 2026-10 §4.1) ──
//
//   findTrainers   trainers only, NAME ONLY (never email), blocks excluded both
//                  ways; needs no Following on the searcher's side. A trainer
//                  is findable while trainer tools AND their (private)
//                  Following profile are on and moderation has not forced it
//                  private. The query is never logged.
//   trainerCard    what the profile screen needs before "Ask to coach me";
//                  a trainer who isn't findable, or a block either way, is the
//                  same NOT_FOUND "This trainer isn't available".
//   request        consent screen first (client), then one PENDING request per
//                  client, 14-day expiry; never creates a follow, never makes
//                  a profile public. Gym setup must be finished (simple mode
//                  counts: it finishes setup too).
//   cancel         the client withdraws their pending request.
//   accept/decline the trainer answers; accept starts the coaching in one
//                  transaction (a switch ends the old coaching first) under the
//                  same 50-client cap as invites.
//
// Denials that concern the other person use the single-NOT_FOUND pattern of
// social-access.service.ts: never "blocked", "not a trainer" or "turned off".

const DAY_MS = 24 * 60 * 60 * 1000;
/** Candidates ranked per search: a name that matches more trainers is a query to refine. */
export const TRAINER_SEARCH_CAP = 200;

export interface CoachingRequestDeps {
  requests: ICoachingRequestRepository;
  trainers: Pick<
    ITrainerProfileRepository,
    'searchFindable' | 'findFindable' | 'find' | 'findMany'
  >;
  links: Pick<
    ICoachingLinkRepository,
    'findActiveForClient' | 'countActiveForTrainer' | 'countActiveForTrainers'
  >;
  blocks: Pick<IBlockRepository, 'blockedIdsEither'>;
  gymProfiles: Pick<IGymProfileRepository, 'findByUserId'>;
  notices: Pick<
    CoachingNoticeService,
    'requestReceived' | 'requestWithdrawn' | 'requestAnswered' | 'ended'
  >;
  now: () => Date;
}

const defaultDeps: CoachingRequestDeps = {
  requests: coachingRequestRepository,
  trainers: trainerProfileRepository,
  links: coachingLinkRepository,
  blocks: blockRepository,
  gymProfiles: gymProfileRepository,
  notices: coachingNoticeService,
  now: () => new Date(),
};

/** Offset cursor over the ranked list: `o<offset>`. Untrusted: anything else restarts at 0. */
function decodeOffset(cursor: string | undefined): number {
  const match = /^o(\d{1,4})$/.exec(cursor ?? '');
  const offset = match ? Number(match[1]) : 0;
  return offset <= TRAINER_SEARCH_CAP ? offset : 0;
}

export function trainerUnavailableError(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: COACHING_COPY.server.trainerUnavailable });
}

function requestUnavailableError(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: COACHING_COPY.server.requestUnavailable });
}

export class CoachingRequestService {
  private readonly deps: CoachingRequestDeps;

  constructor(deps: Partial<CoachingRequestDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  // ─── Find a trainer ─────────────────────────────────────────────────────────

  async findTrainers(
    viewerId: string,
    input: { query: string; cursor?: string | undefined; limit: number },
  ): Promise<Page<TrainerSummaryDto>> {
    const tokens = queryTokens(input.query);
    if (tokens.length === 0) return { items: [], nextCursor: null };
    const blocked = await this.deps.blocks.blockedIdsEither(viewerId);
    const rows = await this.deps.trainers.searchFindable(
      tokens,
      [viewerId, ...blocked],
      TRAINER_SEARCH_CAP,
    );
    const offset = decodeOffset(input.cursor);
    const page = rows.slice(offset, offset + input.limit);
    const counts = await this.deps.links.countActiveForTrainers(page.map((r) => r.userId));
    const items = page.map((row) => toSummary(row, counts.get(row.userId) ?? 0));
    const next = offset + input.limit;
    return { items, nextCursor: next < rows.length ? `o${next}` : null };
  }

  async trainerCard(viewerId: string, trainerId: string): Promise<TrainerCardDto> {
    const trainer = await this.findableTrainer(viewerId, trainerId);
    const now = this.deps.now();
    const [active, current, pending, gym] = await Promise.all([
      this.deps.links.countActiveForTrainer(trainerId),
      this.deps.links.findActiveForClient(viewerId),
      this.deps.requests.findLiveForClient(viewerId, now),
      this.deps.gymProfiles.findByUserId(viewerId),
    ]);
    const others = [current?.trainerId, pending?.trainerId].filter(
      (id): id is string => id !== undefined && id !== trainerId,
    );
    const names = await this.names(others);
    return {
      ...toSummary(trainer, active),
      relation:
        current?.trainerId === trainerId
          ? 'YOUR_TRAINER'
          : pending?.trainerId === trainerId
            ? 'REQUESTED'
            : 'NONE',
      currentTrainerName:
        current && current.trainerId !== trainerId ? names(current.trainerId) : null,
      pendingRequestTo:
        pending && pending.trainerId !== trainerId ? names(pending.trainerId) : null,
      needsGymSetup: !gym?.setupCompletedAt,
    };
  }

  // ─── Client: request / cancel ───────────────────────────────────────────────

  /** `coaching.requestCoaching`: after the consent screen. Returns the new request. */
  async request(
    clientId: string,
    trainerId: string,
    source: CoachingSource,
    localDate?: string,
  ): Promise<CoachingRequestDto> {
    if (clientId === trainerId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.selfCoaching });
    }
    const trainer = await this.findableTrainer(clientId, trainerId);
    const now = this.deps.now();
    const [current, gym, active] = await Promise.all([
      this.deps.links.findActiveForClient(clientId),
      this.deps.gymProfiles.findByUserId(clientId),
      this.deps.links.countActiveForTrainer(trainerId),
    ]);
    if (current?.trainerId === trainerId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: COACHING_COPY.server.alreadyYourTrainer,
      });
    }
    if (!gym?.setupCompletedAt) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: COACHING_COPY.server.needsGymSetup,
      });
    }
    if (active >= COACHING_LIMITS.maxActiveClients) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.notTakingClients });
    }

    const result = await this.deps.requests.create({
      clientId,
      trainerId,
      startedOn: resolveStartedOn(localDate, now),
      expiresAt: new Date(now.getTime() + COACHING_LIMITS.requestTtlDays * DAY_MS),
      source,
      // Trainer mode M3 (§10): the consent screen shows copy v2.
      documentVersion: COACHING_CONSENT_DOCUMENT_VERSION,
      now,
    });
    if (result.status === 'pending_exists') {
      // Asking the same trainer twice is a no-op; anyone else needs a cancel first.
      if (result.request.trainerId === trainerId) {
        return this.toClientRequest(result.request, trainer.displayName);
      }
      throw new TRPCError({
        code: 'CONFLICT',
        message: COACHING_COPY.server.requestPendingElsewhere,
      });
    }
    if (result.status === 'conflict') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: COACHING_COPY.server.requestPendingElsewhere,
      });
    }
    await this.deps.notices.requestReceived(trainerId, clientId);
    return this.toClientRequest(result.request, trainer.displayName);
  }

  /** `coaching.cancelRequest`: idempotent. */
  async cancel(clientId: string, source: CoachingSource): Promise<{ ok: true }> {
    const cancelled = await this.deps.requests.cancel(clientId, {
      source,
      documentVersion: LEGAL_VERSIONS.privacy,
      now: this.deps.now(),
    });
    if (cancelled) await this.deps.notices.requestWithdrawn(cancelled.trainerId, clientId);
    return { ok: true };
  }

  /** The client's live request for `coaching.status`, or null. */
  async clientRequest(clientId: string): Promise<CoachingRequestDto | null> {
    const request = await this.deps.requests.findLiveForClient(clientId, this.deps.now());
    if (!request) return null;
    const trainer = await this.deps.trainers.find(request.trainerId);
    return this.toClientRequest(request, trainer?.displayName ?? FALLBACK_TRAINER_NAME);
  }

  // ─── Trainer: list / accept / decline ───────────────────────────────────────

  /** `trainer.requests.list`: live requests, oldest first; a client blocked either way is left out. */
  async listForTrainer(trainerId: string): Promise<TrainerRequestDto[]> {
    const now = this.deps.now();
    const [rows, blocked] = await Promise.all([
      this.deps.requests.listLiveForTrainer(trainerId, now),
      this.deps.blocks.blockedIdsEither(trainerId),
    ]);
    const hidden = new Set(blocked);
    const visible = rows.filter((r) => !hidden.has(r.clientId));
    const links = await Promise.all(
      visible.map((r) => this.deps.links.findActiveForClient(r.clientId)),
    );
    return visible.map((r, i) => ({
      id: r.id,
      client: { id: r.clientId, name: displayNameOf(r.client) },
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      hasTrainer: links[i] !== null && links[i]?.trainerId !== trainerId,
    }));
  }

  async accept(
    trainerId: string,
    requestId: string,
    source: CoachingSource,
  ): Promise<{ ok: true; clientId: string }> {
    const now = this.deps.now();
    const blocked = new Set(await this.deps.blocks.blockedIdsEither(trainerId));
    const pending = (await this.deps.requests.listLiveForTrainer(trainerId, now)).find(
      (r) => r.id === requestId,
    );
    if (!pending || blocked.has(pending.clientId)) throw requestUnavailableError();

    const result = await this.deps.requests.accept({
      trainerId,
      requestId,
      maxActiveClients: COACHING_LIMITS.maxActiveClients,
      startedOn: resolveStartedOn(undefined, now),
      source,
      documentVersion: LEGAL_VERSIONS.privacy,
      now,
      // The client consented to copy v2 when sending the request.
      consentCopyVersion: COACHING_CONSENT_COPY_VERSION,
    });
    switch (result.status) {
      case 'accepted': {
        const clientId = result.request.clientId;
        await this.deps.notices.requestAnswered(clientId, trainerId, true);
        // A switch: the client's previous trainer hears that the client left.
        for (const old of result.endedLinks) {
          await this.deps.notices.ended(old.trainerId, clientId, 'CLIENT', 'CLIENT');
        }
        return { ok: true, clientId };
      }
      case 'client_limit':
        throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.clientLimit });
      case 'conflict':
        throw new TRPCError({ code: 'CONFLICT', message: COACHING_COPY.server.tooManyAttempts });
      case 'trainer_off':
        throw new TRPCError({ code: 'FORBIDDEN', message: COACHING_COPY.server.trainerToolsOff });
      case 'unavailable':
        throw requestUnavailableError();
    }
  }

  async decline(
    trainerId: string,
    requestId: string,
    source: CoachingSource,
  ): Promise<{ ok: true }> {
    const declined = await this.deps.requests.decline(trainerId, requestId, {
      source,
      documentVersion: LEGAL_VERSIONS.privacy,
      now: this.deps.now(),
    });
    if (!declined) throw requestUnavailableError();
    await this.deps.notices.requestAnswered(declined.clientId, trainerId, false);
    return { ok: true };
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  /** The trainer when findable and not blocked either way; otherwise the uniform NOT_FOUND. */
  private async findableTrainer(viewerId: string, trainerId: string): Promise<TrainerProfile> {
    if (viewerId === trainerId) throw trainerUnavailableError();
    const [trainer, blocked] = await Promise.all([
      this.deps.trainers.findFindable(trainerId),
      this.deps.blocks.blockedIdsEither(viewerId),
    ]);
    if (!trainer || blocked.includes(trainerId)) throw trainerUnavailableError();
    return trainer;
  }

  private async names(ids: readonly string[]): Promise<(id: string) => string> {
    const rows = await this.deps.trainers.findMany([...new Set(ids)]);
    const byId = new Map(rows.map((r) => [r.userId, r.displayName]));
    return (id) => byId.get(id) ?? FALLBACK_TRAINER_NAME;
  }

  private toClientRequest(request: CoachingRequest, trainerName: string): CoachingRequestDto {
    return {
      id: request.id,
      trainer: { id: request.trainerId, name: trainerName },
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
    };
  }
}

function toSummary(row: TrainerProfile, activeClients: number): TrainerSummaryDto {
  return {
    trainerId: row.userId,
    name: row.displayName,
    gymLine: row.gymLine,
    acceptingClients: activeClients < COACHING_LIMITS.maxActiveClients,
  };
}

export const coachingRequestService = new CoachingRequestService();
