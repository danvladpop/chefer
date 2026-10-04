import { TRPCError } from '@trpc/server';
import { trainerProfileRepository, type ITrainerProfileRepository } from '@chefer/database';
import {
  COACHING_COPY,
  LEGAL_VERSIONS,
  type CoachingSource,
  type TrainerProfileInput,
  type TrainerStatusDto,
} from '@chefer/types';
import { containsBlockedTerm, normalizeSearchName } from '@chefer/utils';
import { canBeTrainer } from '../../lib/coaching-flags.js';
import type { CoachingTrainer } from './coaching-access.service.js';

// ─── Trainer coaching: trainer profile (spec §2.1, §7.2) ──────────────────────
// Turning trainer tools on creates a TrainerProfile (display name, word-filtered
// like Following names). Turning them off ends every link, revokes open invites
// and hides the private notes in one transaction (TrainerProfileRepository).

export interface TrainerProfileDeps {
  trainers: ITrainerProfileRepository;
  /** `canBeTrainer`: coaching on AND on TRAINER_ALLOWLIST (Q-1). Injected so tests need no env. */
  canBeTrainer: (user: CoachingTrainer) => boolean;
  now: () => Date;
}

const defaultDeps: TrainerProfileDeps = {
  trainers: trainerProfileRepository,
  canBeTrainer,
  now: () => new Date(),
};

export class TrainerProfileService {
  private readonly deps: TrainerProfileDeps;

  constructor(deps: Partial<TrainerProfileDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** `trainer.status`: may this user turn trainer tools on, are they on, and under which name. */
  async status(user: CoachingTrainer): Promise<TrainerStatusDto> {
    const profile = await this.deps.trainers.findActive(user.id);
    return {
      canActivate: this.deps.canBeTrainer(user),
      active: profile !== null,
      displayName: profile?.displayName ?? null,
    };
  }

  /** `trainer.activate`: idempotent (a second call renames); a user off the allowlist is refused. */
  async activate(
    user: CoachingTrainer,
    input: TrainerProfileInput,
    _source: CoachingSource,
  ): Promise<TrainerStatusDto> {
    if (!this.deps.canBeTrainer(user)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: COACHING_COPY.server.notAllowed });
    }
    const displayName = assertNameAllowed(input.displayName);
    await this.deps.trainers.activate(user.id, displayName);
    return this.status(user);
  }

  /** `trainer.updateProfile` */
  async updateProfile(
    user: CoachingTrainer,
    input: TrainerProfileInput,
  ): Promise<TrainerStatusDto> {
    const displayName = assertNameAllowed(input.displayName);
    const updated = await this.deps.trainers.updateName(user.id, displayName);
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
  async deactivate(userId: string, source: CoachingSource): Promise<{ ok: true }> {
    await this.deps.trainers.deactivate(userId, {
      source,
      documentVersion: LEGAL_VERSIONS.privacy,
      now: this.deps.now(),
    });
    return { ok: true };
  }
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
