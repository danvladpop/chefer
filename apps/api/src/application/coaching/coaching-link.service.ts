import { TRPCError } from '@trpc/server';
import {
  bookingRepository,
  coachingContentRepository,
  coachingInviteRepository,
  coachingLinkRepository,
  dailyLogRepository,
  gymProfileRepository,
  trainerProfileRepository,
  type CoachingLink,
  type IBookingRepository,
  type ICoachingContentRepository,
  type ICoachingInviteRepository,
  type ICoachingLinkRepository,
  type IDailyLogRepository,
  type IGymProfileRepository,
  type ITrainerProfileRepository,
} from '@chefer/database';
import {
  COACHING_CONSENT_COPY_VERSION,
  COACHING_COPY,
  COACHING_LIMITS,
  FALLBACK_TRAINER_NAME,
  LEGAL_VERSIONS,
  QUIET_LIMITS,
  TRAINER_MODE_API_LEVEL,
  type ClientRowDto,
  type CoachingShareChoice,
  type CoachingSharingDto,
  type CoachingSource,
  type CoachingStatusDto,
} from '@chefer/types';
import {
  addDaysLocal,
  daysBetweenLocal,
  dbDateKey,
  displayNameOf,
  goalForWeek,
  quietState,
  weekStartOf,
} from '@chefer/utils';
import { clientUnavailableError } from '../../lib/coaching-errors.js';
import { readGoalHistory, serverToday } from '../gym/mappers.js';
import { keepItSimple } from './coaching-content.service.js';
import {
  clientSharingOf,
  inviteStateOf,
  linkStartDay,
  resolveStartedOn,
  sharingOf,
} from './coaching-dto.mappers.js';
import { coachingNoticeService, type CoachingNoticeService } from './coaching-notice.service.js';
import { coachingRequestService, type CoachingRequestService } from './coaching-request.service.js';
import {
  COACHING_CONSENT_DOCUMENT_VERSION,
  COACHING_DATA_DOCUMENT_VERSION,
} from './consent-copy.js';

// ─── Trainer coaching: links (spec §2.3, §2.7, §7.2, §7.3) ────────────────────
// join / leave / remove are single transactions in CoachingLinkRepository: the
// link row, the consent event on the CLIENT's log (`contextId` = the link) and
// the private note's hidden flag move together.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CoachingLinkDeps {
  links: ICoachingLinkRepository;
  invites: Pick<ICoachingInviteRepository, 'find'>;
  trainers: Pick<ITrainerProfileRepository, 'find' | 'findMany'>;
  gymProfiles: Pick<IGymProfileRepository, 'findByUserId'>;
  content: ICoachingContentRepository;
  notices: Pick<CoachingNoticeService, 'ended'>;
  requests: Pick<CoachingRequestService, 'clientRequest'>;
  /** Trainer mode M3: each client row's next booking (`ClientRowDto.nextBookingAt`). */
  bookings: Pick<IBookingRepository, 'nextStartsByClient'>;
  /** Lane K4: the last food log of clients who share it (quiet = nothing logged). */
  foodLogs: Pick<IDailyLogRepository, 'lastLoggedDates'>;
  now: () => Date;
}

const defaultDeps: CoachingLinkDeps = {
  links: coachingLinkRepository,
  invites: coachingInviteRepository,
  trainers: trainerProfileRepository,
  gymProfiles: gymProfileRepository,
  content: coachingContentRepository,
  notices: coachingNoticeService,
  requests: coachingRequestService,
  bookings: bookingRepository,
  foodLogs: dailyLogRepository,
  now: () => new Date(),
};

export class CoachingLinkService {
  private readonly deps: CoachingLinkDeps;

  constructor(deps: Partial<CoachingLinkDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /**
   * `coaching.join`: validates the invite, needs a finished gym setup (the engine
   * needs the equipment and plates), then one transaction (see
   * CoachingLinkRepository.join). `localDate` is the client's device-local date,
   * stored as the link's `startedOn` (see `linkStartDay`). Joining the trainer you already have is a no-op.
   */
  async join(
    clientId: string,
    code: string,
    source: CoachingSource,
    localDate?: string,
    level = 0,
    share?: CoachingShareChoice,
  ): Promise<CoachingStatusDto> {
    const now = this.deps.now();
    const invite = await this.deps.invites.find(code);
    if (!invite) throw invalidInvite();
    if (invite.trainerId === clientId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.selfCoaching });
    }
    const current = await this.deps.links.findActiveForClient(clientId);
    if (current?.trainerId === invite.trainerId) return this.status(clientId, level);
    if (inviteStateOf(invite, now) !== 'OPEN') throw invalidInvite();

    const profile = await this.deps.gymProfiles.findByUserId(clientId);
    if (!profile?.setupCompletedAt) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: COACHING_COPY.server.needsGymSetup,
      });
    }

    // Two joins racing for the same client: the loser re-reads once (the winner
    // may be this very trainer, which is then a no-op).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await this.deps.links.join({
        code,
        clientId,
        source,
        documentVersion: LEGAL_VERSIONS.privacy,
        maxActiveClients: COACHING_LIMITS.maxActiveClients,
        startedOn: resolveStartedOn(localDate, now),
        now,
        // Trainer mode M3 (§10): the consent screen shows copy v2 (bookings, logged workouts).
        consentCopyVersion: COACHING_CONSENT_COPY_VERSION,
        grantedDocumentVersion: COACHING_CONSENT_DOCUMENT_VERSION,
        // Lane K1: the consent screen's food / weight switches (absent = share nothing).
        ...(share && { share, shareDocumentVersion: COACHING_DATA_DOCUMENT_VERSION }),
      });
      if (result.status === 'joined') {
        // A switch: the previous trainer hears that the client left.
        for (const old of result.endedLinks) {
          await this.deps.notices.ended(old.trainerId, clientId, 'CLIENT', 'CLIENT');
        }
        return this.status(clientId, level);
      }
      if (result.status === 'invite_unavailable') throw invalidInvite();
      if (result.status === 'client_limit') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.clientLimit });
      }
    }
    throw new TRPCError({ code: 'CONFLICT', message: COACHING_COPY.server.tooManyAttempts });
  }

  /**
   * `coaching.acknowledgeConsentUpdate` (trainer mode M3, §10): records the v2
   * consent copy on the client's ACTIVE link. Idempotent; a no-op with no link.
   */
  async acknowledgeConsentUpdate(clientId: string, source: CoachingSource): Promise<{ ok: true }> {
    await this.deps.links.acknowledgeConsentCopy({
      clientId,
      version: COACHING_CONSENT_COPY_VERSION,
      source,
      documentVersion: COACHING_CONSENT_DOCUMENT_VERSION,
      now: this.deps.now(),
    });
    return { ok: true };
  }

  /**
   * `coaching.status`. `level` = the caller's contract level (web: Infinity).
   * At TRAINER_MODE_API_LEVEL+ it carries `consentUpdate` (null when there is
   * nothing new); below, the field is absent.
   */
  async status(clientId: string, level = 0): Promise<CoachingStatusDto> {
    const now = this.deps.now();
    const [active, request] = await Promise.all([
      this.deps.links.findActiveForClient(clientId),
      this.deps.requests.clientRequest(clientId),
    ]);
    const trainerMode = level >= TRAINER_MODE_API_LEVEL;
    if (active) {
      const name = await this.trainerName(active.trainerId);
      return {
        trainer: { name, since: active.startedAt.toISOString(), sharing: sharingOf(active) },
        request,
        stopped: null,
        ...(trainerMode && {
          consentUpdate:
            active.consentCopyVersion < COACHING_CONSENT_COPY_VERSION
              ? { trainerName: name, version: COACHING_CONSENT_COPY_VERSION }
              : null,
        }),
      };
    }
    const since = new Date(now.getTime() - COACHING_LIMITS.stoppedNoticeDays * DAY_MS);
    const stopped = await this.deps.links.findLatestStoppedForClient(clientId, since);
    return {
      trainer: null,
      ...(trainerMode && { consentUpdate: null }),
      request,
      stopped:
        stopped?.endedAt != null
          ? {
              trainerName: await this.trainerName(stopped.trainerId),
              at: stopped.endedAt.toISOString(),
            }
          : null,
    };
  }

  /**
   * `coaching.setSharing` (lane K1): turn food / weight sharing on or off for
   * the client's ACTIVE coaching. A revoke is effective on the trainer's very
   * next request (access is never cached across requests). NOT_FOUND without
   * an active coaching.
   */
  async setSharing(
    clientId: string,
    input: { food?: boolean | undefined; weight?: boolean | undefined },
    source: CoachingSource,
  ): Promise<CoachingSharingDto> {
    const link = await this.deps.links.setSharing({
      clientId,
      food: input.food,
      weight: input.weight,
      source,
      grantedDocumentVersion: COACHING_DATA_DOCUMENT_VERSION,
      documentVersion: LEGAL_VERSIONS.privacy,
      now: this.deps.now(),
    });
    if (!link) {
      throw new TRPCError({ code: 'NOT_FOUND', message: COACHING_COPY.server.notFound });
    }
    return sharingOf(link);
  }

  /** `coaching.leave`: the trainer loses access at once; the routine, trainer notes and pending targets stay the client's. */
  async leave(clientId: string, source: CoachingSource, level = 0): Promise<CoachingStatusDto> {
    const link = await this.deps.links.findActiveForClient(clientId);
    if (link) {
      await this.deps.links.end({
        trainerId: link.trainerId,
        clientId,
        endedBy: 'CLIENT',
        source,
        documentVersion: LEGAL_VERSIONS.privacy,
        now: this.deps.now(),
      });
      await this.deps.notices.ended(link.trainerId, clientId, 'CLIENT', 'CLIENT');
    }
    return this.status(clientId, level);
  }

  /** `trainer.clients.remove`: ends the link (`TRAINER`), withdrawal event on the client's log, note hidden. */
  async removeClient(
    trainerId: string,
    clientId: string,
    source: CoachingSource,
  ): Promise<{ ok: true }> {
    const ended = await this.deps.links.end({
      trainerId,
      clientId,
      endedBy: 'TRAINER',
      source,
      documentVersion: LEGAL_VERSIONS.privacy,
      now: this.deps.now(),
    });
    if (!ended) throw clientUnavailableError();
    await this.deps.notices.ended(clientId, trainerId, 'TRAINER', 'TRAINER');
    return { ok: true };
  }

  /**
   * `trainer.clients.list`: one row per active client with this week's sessions
   * against their goal, the last workout, the quiet-days count and whether the
   * client changed the routine after the trainer last did. `today` is the
   * trainer's device-local date (default: the server's UTC date). Batched: a
   * handful of queries however many clients.
   */
  async listClients(trainerId: string, today: string | undefined): Promise<ClientRowDto[]> {
    return (await this.clientRowsWithQuiet(trainerId, today)).rows;
  }

  /**
   * Lane K4: the client rows plus, per client, the first day they counted as
   * quiet (`trainer.badges` counts those after the trainer last looked).
   */
  async clientRowsWithQuiet(
    trainerId: string,
    today: string | undefined,
  ): Promise<{ rows: ClientRowDto[]; quietSince: Map<string, string> }> {
    const day = today ?? serverToday(this.deps.now());
    const links = await this.deps.links.listActiveForTrainer(trainerId);
    if (links.length === 0) return { rows: [], quietSince: new Map() };
    const ids = links.map((l) => l.clientId);
    const weekStart = weekStartOf(day);
    // Lane K4: food counts as activity only for clients who share their food log.
    const foodSharers = links.filter((l) => l.shareFoodAt != null).map((l) => l.clientId);
    const foodSince = new Date(
      `${addDaysLocal(day, -QUIET_LIMITS.activityWindowDays)}T00:00:00.000Z`,
    );
    const [last, counts, profiles, stamps, nextBookings, trainer, food] = await Promise.all([
      this.deps.content.lastWorkoutDates(ids),
      this.deps.content.countSessions(ids, weekStart, addDaysLocal(weekStart, 6)),
      this.deps.content.gymProfiles(ids),
      this.deps.content.activeRoutineStamps(ids),
      this.deps.bookings.nextStartsByClient(trainerId, ids, this.deps.now()),
      this.deps.trainers.find(trainerId),
      this.deps.foodLogs.lastLoggedDates(foodSharers, foodSince),
    ]);
    const quietAfterDays = trainer?.quietAfterDays ?? QUIET_LIMITS.defaultDays;
    const quietSince = new Map<string, string>();
    const rows = links.map((link) => {
      const profile = profiles.get(link.clientId);
      const lastWorkoutDate = last.get(link.clientId) ?? null;
      const stamp = stamps.get(link.clientId);
      const goalHistory = profile ? readGoalHistory(profile.goalHistory) : [];
      // Never a food date for a client who doesn't share it, whatever the read returned.
      const foodDate = link.shareFoodAt != null ? food.get(link.clientId) : undefined;
      const quiet = quietState({
        lastWorkoutDate,
        lastFoodDate: foodDate ? dbDateKey(foodDate) : null,
        startDay: linkStartDay(link),
        today: day,
        quietAfterDays,
      });
      quietSince.set(link.clientId, quiet.quietSince);
      return {
        clientId: link.clientId,
        name: displayNameOf(link.client),
        since: link.startedAt.toISOString(),
        label: link.trainerLabel,
        lastWorkoutDate,
        week: {
          sessions: counts.get(link.clientId) ?? 0,
          goal: profile
            ? goalHistory.length > 0
              ? goalForWeek(goalHistory, weekStart)
              : profile.weeklyGoal
            : 0,
        },
        inactiveDays: Math.max(0, daysBetweenLocal(lastWorkoutDate ?? linkStartDay(link), day)),
        routineChangedByClientAt: changedByClientAt(link, stamp),
        keepItSimple: keepItSimple(profile),
        nextBookingAt: nextBookings.get(link.clientId)?.toISOString() ?? null,
        sharing: clientSharingOf(link),
        lastActivityDate: quiet.lastActivityDate,
        quietDays: quiet.quietDays,
        quiet: quiet.quiet,
      };
    });
    return { rows, quietSince };
  }

  private async trainerName(trainerId: string): Promise<string> {
    return (await this.deps.trainers.find(trainerId))?.displayName ?? FALLBACK_TRAINER_NAME;
  }
}

/** The client saved the routine after the link started (and, as the last editor, after the trainer last did). */
function changedByClientAt(
  link: CoachingLink,
  stamp: { lastEditedById: string | null; lastEditedAt: Date | null } | undefined,
): string | null {
  if (!stamp?.lastEditedAt || stamp.lastEditedById !== link.clientId) return null;
  return stamp.lastEditedAt >= link.startedAt ? stamp.lastEditedAt.toISOString() : null;
}

function invalidInvite(): TRPCError {
  return new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.inviteNotValid });
}

export const coachingLinkService = new CoachingLinkService();
