import { TRPCError } from '@trpc/server';
import {
  coachingContentRepository,
  coachingInviteRepository,
  coachingLinkRepository,
  gymProfileRepository,
  trainerProfileRepository,
  type CoachingLink,
  type ICoachingContentRepository,
  type ICoachingInviteRepository,
  type ICoachingLinkRepository,
  type IGymProfileRepository,
  type ITrainerProfileRepository,
} from '@chefer/database';
import {
  COACHING_COPY,
  COACHING_LIMITS,
  FALLBACK_TRAINER_NAME,
  LEGAL_VERSIONS,
  type ClientRowDto,
  type CoachingSource,
  type CoachingStatusDto,
} from '@chefer/types';
import {
  addDaysLocal,
  daysBetweenLocal,
  displayNameOf,
  goalForWeek,
  weekStartOf,
} from '@chefer/utils';
import { clientUnavailableError } from '../../lib/coaching-errors.js';
import { readGoalHistory, serverToday } from '../gym/mappers.js';
import { inviteStateOf } from './coaching-dto.mappers.js';

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
  now: () => Date;
}

const defaultDeps: CoachingLinkDeps = {
  links: coachingLinkRepository,
  invites: coachingInviteRepository,
  trainers: trainerProfileRepository,
  gymProfiles: gymProfileRepository,
  content: coachingContentRepository,
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
   * CoachingLinkRepository.join). Joining the trainer you already have is a no-op.
   */
  async join(clientId: string, code: string, source: CoachingSource): Promise<CoachingStatusDto> {
    const now = this.deps.now();
    const invite = await this.deps.invites.find(code);
    if (!invite) throw invalidInvite();
    if (invite.trainerId === clientId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.selfCoaching });
    }
    const current = await this.deps.links.findActiveForClient(clientId);
    if (current?.trainerId === invite.trainerId) return this.status(clientId);
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
        now,
      });
      if (result.status === 'joined') return this.status(clientId);
      if (result.status === 'invite_unavailable') throw invalidInvite();
      if (result.status === 'client_limit') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.clientLimit });
      }
    }
    throw new TRPCError({ code: 'CONFLICT', message: COACHING_COPY.server.tooManyAttempts });
  }

  /** `coaching.status` */
  async status(clientId: string): Promise<CoachingStatusDto> {
    const now = this.deps.now();
    const active = await this.deps.links.findActiveForClient(clientId);
    if (active) {
      return {
        trainer: {
          name: await this.trainerName(active.trainerId),
          since: active.startedAt.toISOString(),
        },
        stopped: null,
      };
    }
    const since = new Date(now.getTime() - COACHING_LIMITS.stoppedNoticeDays * DAY_MS);
    const stopped = await this.deps.links.findLatestStoppedForClient(clientId, since);
    return {
      trainer: null,
      stopped:
        stopped?.endedAt != null
          ? {
              trainerName: await this.trainerName(stopped.trainerId),
              at: stopped.endedAt.toISOString(),
            }
          : null,
    };
  }

  /** `coaching.leave`: the trainer loses access at once; the routine, trainer notes and pending targets stay the client's. */
  async leave(clientId: string, source: CoachingSource): Promise<CoachingStatusDto> {
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
    }
    return this.status(clientId);
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
    const day = today ?? serverToday(this.deps.now());
    const links = await this.deps.links.listActiveForTrainer(trainerId);
    if (links.length === 0) return [];
    const ids = links.map((l) => l.clientId);
    const weekStart = weekStartOf(day);
    const [last, counts, profiles, stamps] = await Promise.all([
      this.deps.content.lastWorkoutDates(ids),
      this.deps.content.countSessions(ids, weekStart, addDaysLocal(weekStart, 6)),
      this.deps.content.gymProfiles(ids),
      this.deps.content.activeRoutineStamps(ids),
    ]);
    return links.map((link) => {
      const profile = profiles.get(link.clientId);
      const lastWorkoutDate = last.get(link.clientId) ?? null;
      const stamp = stamps.get(link.clientId);
      const goalHistory = profile ? readGoalHistory(profile.goalHistory) : [];
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
        inactiveDays: Math.max(
          0,
          daysBetweenLocal(lastWorkoutDate ?? link.startedAt.toISOString().slice(0, 10), day),
        ),
        routineChangedByClientAt: changedByClientAt(link, stamp),
      };
    });
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
