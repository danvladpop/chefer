import { TRPCError } from '@trpc/server';
import {
  coachingLinkRepository,
  socialProfileRepository,
  trainerProfileRepository,
  type ICoachingLinkRepository,
  type ISocialProfileRepository,
  type ITrainerProfileRepository,
} from '@chefer/database';
import {
  COACHING_COPY,
  LEGAL_VERSIONS,
  type CoachingSource,
  type TrainerProfileInput,
  type TrainerStatusDto,
} from '@chefer/types';
import { containsBlockedTerm, normalizeSearchName } from '@chefer/utils';
import {
  canBeTrainer,
  isCoachingEnabledFor,
  trainerAllowlistConfigured,
} from '../../lib/coaching-flags.js';
import { logger } from '../../lib/logger.js';
import { prefillNames, socialProfileService } from '../friends/social-profile.service.js';
import type { CoachingTrainer } from './coaching-access.service.js';
import { coachingNoticeService, type CoachingNoticeService } from './coaching-notice.service.js';

// ─── Trainer coaching: trainer profile (spec §2.1, §7.2; PRD 2026-10 §4.1, §4.3) ─
// Turning trainer tools on creates a TrainerProfile (display name and optional
// "Gym / city" line, word-filtered like Following names) AND turns on a PRIVATE
// Following profile when there is none, so clients can find the trainer by
// name while their plan and workouts stay hidden. Turning Following off later
// drops them out of Find a trainer; their invites keep working.
//
// "The trainer stops" (PRD §4.3): turning trainer tools off, being removed from
// TRAINER_ALLOWLIST, or deleting the account ends every coaching in one
// transaction (TrainerProfileRepository.deactivate) and each client gets an
// in-app notice; pending requests are declined.

export interface TrainerProfileDeps {
  trainers: ITrainerProfileRepository;
  links: Pick<ICoachingLinkRepository, 'countActiveForTrainer'>;
  socialProfiles: Pick<ISocialProfileRepository, 'find' | 'findUsers'>;
  /** Turns Following on (PRIVATE) for a new trainer; SocialProfileService.activate. */
  activateFollowing: (
    userId: string,
    names: { firstName: string; lastName: string },
    source: CoachingSource,
  ) => Promise<void>;
  notices: Pick<CoachingNoticeService, 'ended' | 'requestAnswered'>;
  /** `canBeTrainer`: coaching on AND on TRAINER_ALLOWLIST (Q-1). Injected so tests need no env. */
  canBeTrainer: (user: CoachingTrainer) => boolean;
  /**
   * Whether the allowlist sweep may run for this user: coaching is on for them
   * and TRAINER_ALLOWLIST is configured at all (an unset list is a
   * misconfiguration, never a reason to end everyone's coaching).
   */
  allowlistApplies: (user: CoachingTrainer) => boolean;
  now: () => Date;
}

const defaultDeps: TrainerProfileDeps = {
  trainers: trainerProfileRepository,
  links: coachingLinkRepository,
  socialProfiles: socialProfileRepository,
  activateFollowing: async (userId, names, source) => {
    await socialProfileService.activate(
      userId,
      { visibility: 'PRIVATE', firstName: names.firstName, lastName: names.lastName },
      source,
    );
  },
  notices: coachingNoticeService,
  canBeTrainer,
  allowlistApplies: (user) => isCoachingEnabledFor(user) && trainerAllowlistConfigured(),
  now: () => new Date(),
};

export class TrainerProfileService {
  private readonly deps: TrainerProfileDeps;

  constructor(deps: Partial<TrainerProfileDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** `trainer.status`: may this user turn trainer tools on, are they on, and under which name. */
  async status(user: CoachingTrainer): Promise<TrainerStatusDto> {
    const [profile, social] = await Promise.all([
      this.deps.trainers.findActive(user.id),
      this.deps.socialProfiles.find(user.id),
    ]);
    return {
      canActivate: this.deps.canBeTrainer(user),
      active: profile !== null,
      displayName: profile?.displayName ?? null,
      gymLine: profile?.gymLine ?? null,
      activeClients: profile ? await this.deps.links.countActiveForTrainer(user.id) : 0,
      findable: profile !== null && social !== null && social.forcedPrivateAt === null,
    };
  }

  /**
   * `trainer.activate`: idempotent (a second call renames); a user off the
   * allowlist is refused. Turns on a PRIVATE Following profile when the user
   * has none (names prefilled from the account, else the trainer name).
   */
  async activate(
    user: CoachingTrainer,
    input: TrainerProfileInput,
    source: CoachingSource,
  ): Promise<TrainerStatusDto> {
    if (!this.deps.canBeTrainer(user)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: COACHING_COPY.server.notAllowed });
    }
    const displayName = assertNameAllowed(input.displayName);
    const gymLine = gymLineOf(input.gymLine);
    await this.deps.trainers.activate(user.id, displayName, gymLine);
    if (!(await this.deps.socialProfiles.find(user.id))) {
      const [row] = await this.deps.socialProfiles.findUsers([user.id]);
      const names = prefillNames(row);
      await this.deps.activateFollowing(
        user.id,
        { firstName: names.firstName ?? displayName, lastName: names.lastName ?? '' },
        source,
      );
    }
    return this.status(user);
  }

  /** `trainer.updateProfile` */
  async updateProfile(
    user: CoachingTrainer,
    input: TrainerProfileInput,
  ): Promise<TrainerStatusDto> {
    const displayName = assertNameAllowed(input.displayName);
    const updated = await this.deps.trainers.updateName(
      user.id,
      displayName,
      gymLineOf(input.gymLine),
    );
    if (!updated) {
      throw new TRPCError({ code: 'FORBIDDEN', message: COACHING_COPY.server.trainerToolsOff });
    }
    return this.status(user);
  }

  /**
   * `trainer.deactivate`: every client link ENDED (`SYSTEM`) with a withdrawn
   * consent event on each client's log, open invites revoked, private notes
   * hidden (deleted after COACHING_RETENTION.hiddenNoteDays).
   */
  async deactivate(
    userId: string,
    source: CoachingSource,
    opts: { accountDeleted?: boolean } = {},
  ): Promise<{ ok: true }> {
    const profile = opts.accountDeleted ? await this.deps.trainers.find(userId) : null;
    const { endedClientIds, declinedClientIds } = await this.deps.trainers.deactivate(userId, {
      source,
      documentVersion: LEGAL_VERSIONS.privacy,
      now: this.deps.now(),
    });
    // The trainer's account is about to go (its rows cascade): each client's
    // notice is then written with the client as its own actor, name kept.
    const gone = opts.accountDeleted ? { otherGoneName: profile?.displayName ?? '' } : {};
    for (const clientId of endedClientIds) {
      await this.deps.notices.ended(clientId, userId, 'TRAINER', 'SYSTEM', gone);
    }
    if (!opts.accountDeleted) {
      for (const clientId of declinedClientIds) {
        await this.deps.notices.requestAnswered(clientId, userId, false);
      }
    }
    return { ok: true };
  }

  /**
   * The allowlist sweep (PRD §4.3): a trainer who is no longer on
   * TRAINER_ALLOWLIST stops being a trainer. Runs lazily on every trainer
   * request (requireActiveTrainer) and daily from the maintenance worker.
   * Returns true when it turned trainer tools off.
   */
  async enforceAllowlist(user: CoachingTrainer): Promise<boolean> {
    if (!this.deps.allowlistApplies(user) || this.deps.canBeTrainer(user)) return false;
    if (!(await this.deps.trainers.findActive(user.id))) return false;
    await this.deactivate(user.id, 'web');
    logger.info({}, 'coaching.trainer_removed_from_allowlist');
    return true;
  }
}

/** The "Gym / city" line: undefined = unchanged, blank = cleared, word-filtered like names. */
function gymLineOf(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  if (containsBlockedTerm(trimmed) || isReserved(trimmed)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.nameRejected });
  }
  return trimmed;
}

/** A trainer may not pass themselves off as Chefer (same rule as Following display names). */
function isReserved(name: string): boolean {
  return normalizeSearchName(name, '')
    .split(' ')
    .some((word) => word.startsWith('chefer'));
}

/** The word filter (PRD §9.4) over the name clients will see. One error, no echo of the text. */
function assertNameAllowed(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '' || containsBlockedTerm(trimmed) || isReserved(trimmed)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.nameRejected });
  }
  return trimmed;
}

export const trainerProfileService = new TrainerProfileService();
