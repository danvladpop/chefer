import {
  coachingLinkRepository,
  coachingNoteRepository,
  trainerProfileRepository,
  type CoachingLink,
  type ICoachingLinkRepository,
  type ICoachingNoteRepository,
  type ITrainerProfileRepository,
  type TrainerProfile,
} from '@chefer/database';
import { clientUnavailableError } from '../../lib/coaching-errors.js';
import { isCoachingEnabledFor } from '../../lib/coaching-flags.js';

// ─── Trainer coaching: authorization (docs/trainer-platform/spec.md §8.1) ─────
// THE place that decides what a trainer may see or do for a client (mirrors
// application/friends/social-access.service.ts). Every `trainer.client.*`
// procedure goes through `requireCoachingAccess(scope)` (lib/coaching-middleware.ts),
// which calls `assert` here. The access matrix test is the oracle
// (coaching-access.service.test.ts).
//
// Rules, in order:
//   0. The `coaching` flag (or COACHING_ALLOWLIST) is on for the trainer.
//   1. The trainer has an active TrainerProfile.
//   2. trainerId is not clientId.
//   3. An ACTIVE CoachingLink(trainerId, clientId) exists. Scopes `read` (routine,
//      workouts, adherence, history) and `write` (routine, next targets) both
//      require it. `note` requires rule 1 plus an active link OR an existing,
//      not-hidden note row (a hidden note is not readable in Phase 1).
//   4. No cross-request cache; a per-request memo only. Ending a link takes
//      effect on the trainer's very next request.
//
// Denied is ONE value whatever the reason: NOT_FOUND "This client isn't
// available" (the INV-3 pattern), never a reason.

export type CoachingScope = 'read' | 'write' | 'note';

/** What `assert` resolved: the trainer, the client and (for read/write) the ACTIVE link. */
export interface CoachingAccess {
  trainerId: string;
  clientId: string;
  scope: CoachingScope;
  /** The ACTIVE link. Null only for a `note` scope that was allowed by an existing note row. */
  link: CoachingLink | null;
}

export interface CoachingTrainer {
  id: string;
  email: string;
}

/**
 * Per-request memo (spec §8.1.4: "a per-request memo only"). `requireActiveTrainer`
 * creates one per procedure call and puts it on `ctx.coachingMemo`. Never share
 * one across requests. A service that changes the graph mid-request (join,
 * leave, remove) must not re-resolve through the same memo.
 */
export class CoachingAccessMemo {
  readonly profiles = new Map<string, Promise<TrainerProfile | null>>();
  readonly access = new Map<string, Promise<CoachingAccess>>();

  clear(): void {
    this.profiles.clear();
    this.access.clear();
  }
}

export interface CoachingAccessDeps {
  trainers: Pick<ITrainerProfileRepository, 'findActive'>;
  links: Pick<ICoachingLinkRepository, 'findActivePair'>;
  notes: Pick<ICoachingNoteRepository, 'find'>;
  /** Rule 0: `isCoachingEnabledFor` (lib/coaching-middleware.ts), injected to keep this file free of env. */
  enabledFor: (trainer: CoachingTrainer) => boolean;
}

/** Memoises a promise under `key`; a rejection is forgotten so a retry queries again. */
function remember<T>(
  map: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const hit = map.get(key);
  if (hit) return hit;
  const promise = load();
  map.set(key, promise);
  promise.catch(() => map.delete(key));
  return promise;
}

export class CoachingAccessService {
  constructor(private readonly deps: CoachingAccessDeps) {}

  /** The trainer's ACTIVE TrainerProfile (null = tools off or never on). */
  trainerProfile(trainerId: string, memo?: CoachingAccessMemo): Promise<TrainerProfile | null> {
    if (!memo) return this.deps.trainers.findActive(trainerId);
    return remember(memo.profiles, trainerId, () => this.deps.trainers.findActive(trainerId));
  }

  /**
   * Enforces rules 0–3 and returns the resolved access, or throws the one
   * uniform NOT_FOUND. `scope` `write` means the same as `read` today (both
   * need the ACTIVE link); it is kept separate so a later read-only role can
   * differ without touching every caller.
   */
  assert(
    trainer: CoachingTrainer,
    clientId: string,
    scope: CoachingScope,
    memo?: CoachingAccessMemo,
  ): Promise<CoachingAccess> {
    if (!memo) return this.compute(trainer, clientId, scope, undefined);
    return remember(memo.access, `${trainer.id}\u0000${clientId}\u0000${scope}`, () =>
      this.compute(trainer, clientId, scope, memo),
    );
  }

  private async compute(
    trainer: CoachingTrainer,
    clientId: string,
    scope: CoachingScope,
    memo: CoachingAccessMemo | undefined,
  ): Promise<CoachingAccess> {
    // 0. flag / allowlist
    if (!this.deps.enabledFor(trainer)) throw clientUnavailableError();
    // 1. active trainer profile
    if (!(await this.trainerProfile(trainer.id, memo))) throw clientUnavailableError();
    // 2. never yourself
    if (trainer.id === clientId) throw clientUnavailableError();
    // 3. an ACTIVE link
    const link = await this.deps.links.findActivePair(trainer.id, clientId);
    if (link) return { trainerId: trainer.id, clientId, scope, link };
    if (scope === 'note') {
      const note = await this.deps.notes.find(trainer.id, clientId);
      if (note?.hiddenAt === null) return { trainerId: trainer.id, clientId, scope, link: null };
    }
    throw clientUnavailableError();
  }
}

export const coachingAccessService = new CoachingAccessService({
  trainers: trainerProfileRepository,
  links: coachingLinkRepository,
  notes: coachingNoteRepository,
  enabledFor: isCoachingEnabledFor,
});
