import {
  bookingRepository,
  coachingInviteRepository,
  coachingLinkRepository,
  coachingNoteRepository,
  coachingRequestRepository,
  trainerProfileRepository,
  workoutTemplateRepository,
  type IBookingRepository,
  type ICoachingInviteRepository,
  type ICoachingLinkRepository,
  type ICoachingNoteRepository,
  type ICoachingRequestRepository,
  type ITrainerProfileRepository,
  type IWorkoutTemplateRepository,
} from '@chefer/database';
import { COACHING_RETENTION, LEGAL_VERSIONS } from '@chefer/types';
import { trainerProfileService } from '../application/coaching/trainer-profile.service.js';
import { logger } from '../lib/logger.js';

// ─── Trainer coaching maintenance (docs/trainer-platform/spec.md §8.4, Q-6) ───
// Hourly tick; the housekeeping itself runs once per UTC day. Retention comes
// from COACHING_RETENTION (@chefer/types): recommended defaults that counsel
// must still confirm.
//   1. delete invites that expired more than `inviteAfterExpiryDays` (30) ago;
//   2. delete private notes hidden more than `hiddenNoteDays` (30) ago;
//   3. delete ENDED links that ended more than `endedLinkMonths` (24) ago;
//   4. expire coaching requests past their 14 days (withdrawn consent events);
//   5. delete answered / cancelled / expired requests after `requestAfterAnswerDays` (30);
//   6. the allowlist sweep: a trainer no longer on TRAINER_ALLOWLIST stops being
//      a trainer (PRD 2026-10 §4.3; also enforced lazily on their next request);
//   7. hard-delete workout templates soft-deleted more than
//      `TEMPLATE_SOFT_DELETE_DAYS` (30) ago (trainer-mode.md §10). Clients'
//      copies keep their stored template name, so nothing else changes.
//   8. bookings (trainer-mode.md §10) follow the link's retention: places in
//      bookings of links that ended more than `endedLinkMonths` (24) ago are
//      deleted, then bookings left with nobody and empty series. Runs BEFORE
//      step 3 deletes those links. The trainer's own blocked time goes after
//      `BLOCK_RETENTION_MONTHS` (24). Coached workouts are the client's and stay.
// Every step is idempotent; the "done today" marker is only set when all steps
// succeeded, so a failed step retries on the next tick.

const TICK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Trainer mode §10: a deleted template is purged this many days later. */
export const TEMPLATE_SOFT_DELETE_DAYS = COACHING_RETENTION.templateSoftDeleteDays;
/** Trainer mode §10: the trainer's own blocked time is kept this many months. */
export const BLOCK_RETENTION_MONTHS = COACHING_RETENTION.endedLinkMonths;

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** The same UTC day-of-month `months` calendar months earlier (clamped by Date). */
function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export interface CoachingMaintenanceDeps {
  invites: Pick<ICoachingInviteRepository, 'deleteExpiredBefore'>;
  notes: Pick<ICoachingNoteRepository, 'deleteHiddenBefore'>;
  links: Pick<ICoachingLinkRepository, 'deleteEndedBefore'>;
  requests: Pick<ICoachingRequestRepository, 'expireDue' | 'deleteAnsweredBefore'>;
  trainers: Pick<ITrainerProfileRepository, 'listActiveWithEmail'>;
  templates: Pick<IWorkoutTemplateRepository, 'purgeDeletedBefore'>;
  bookings: Pick<IBookingRepository, 'deleteForEndedLinksBefore' | 'deleteBlocksBefore'>;
  /** TrainerProfileService.enforceAllowlist: true when it turned trainer tools off. */
  enforceAllowlist: (user: { id: string; email: string }) => Promise<boolean>;
}

const defaultDeps: CoachingMaintenanceDeps = {
  invites: coachingInviteRepository,
  notes: coachingNoteRepository,
  links: coachingLinkRepository,
  requests: coachingRequestRepository,
  trainers: trainerProfileRepository,
  templates: workoutTemplateRepository,
  bookings: bookingRepository,
  enforceAllowlist: (user) => trainerProfileService.enforceAllowlist(user),
};

export interface CoachingHousekeepingResult {
  prunedInvites: number;
  prunedNotes: number;
  prunedLinks: number;
  expiredRequests: number;
  prunedRequests: number;
  trainersRemoved: number;
  prunedTemplates: number;
  prunedBookings: number;
}

export class CoachingMaintenanceWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastDay: string | null = null;
  private readonly deps: CoachingMaintenanceDeps;

  constructor(deps: Partial<CoachingMaintenanceDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  start(): void {
    if (this.timer) return;
    console.log('[CoachingMaintenanceWorker] started (hourly)');
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[CoachingMaintenanceWorker] stopped');
  }

  /** Exposed for tests: one pass regardless of the timer. Returns what it pruned (or null when it already ran today / is running). */
  async tick(now = new Date()): Promise<CoachingHousekeepingResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await this.housekeeping(now);
    } finally {
      this.running = false;
    }
  }

  private async housekeeping(now: Date): Promise<CoachingHousekeepingResult | null> {
    const day = now.toISOString().slice(0, 10);
    if (day === this.lastDay) return null;

    const result: CoachingHousekeepingResult = {
      prunedInvites: 0,
      prunedNotes: 0,
      prunedLinks: 0,
      expiredRequests: 0,
      prunedRequests: 0,
      trainersRemoved: 0,
      prunedTemplates: 0,
      prunedBookings: 0,
    };
    let failed = false;
    const step = async (name: string, run: () => Promise<void>): Promise<void> => {
      try {
        await run();
      } catch (err) {
        failed = true;
        console.error(`[CoachingMaintenanceWorker] ${name} failed:`, err);
      }
    };

    await step('prune invites', async () => {
      result.prunedInvites = await this.deps.invites.deleteExpiredBefore(
        daysBefore(now, COACHING_RETENTION.inviteAfterExpiryDays),
      );
    });
    await step('prune hidden notes', async () => {
      result.prunedNotes = await this.deps.notes.deleteHiddenBefore(
        daysBefore(now, COACHING_RETENTION.hiddenNoteDays),
      );
    });
    // Bookings first: they are matched to the ended links step 3 deletes.
    let bookingsPruned = false;
    await step('prune bookings', async () => {
      result.prunedBookings =
        (await this.deps.bookings.deleteForEndedLinksBefore(
          monthsBefore(now, COACHING_RETENTION.endedLinkMonths),
        )) +
        (await this.deps.bookings.deleteBlocksBefore(monthsBefore(now, BLOCK_RETENTION_MONTHS)));
      bookingsPruned = true;
    });
    await step('prune ended links', async () => {
      // Never drop a link whose bookings are still to be matched to it (retried next tick).
      if (!bookingsPruned) throw new Error('bookings not pruned yet');
      result.prunedLinks = await this.deps.links.deleteEndedBefore(
        monthsBefore(now, COACHING_RETENTION.endedLinkMonths),
      );
    });

    await step('expire requests', async () => {
      result.expiredRequests = await this.deps.requests.expireDue({
        source: 'web',
        documentVersion: LEGAL_VERSIONS.privacy,
        now,
      });
    });
    await step('prune requests', async () => {
      result.prunedRequests = await this.deps.requests.deleteAnsweredBefore(
        daysBefore(now, COACHING_RETENTION.requestAfterAnswerDays),
      );
    });
    await step('allowlist sweep', async () => {
      for (const t of await this.deps.trainers.listActiveWithEmail()) {
        if (await this.deps.enforceAllowlist({ id: t.userId, email: t.email })) {
          result.trainersRemoved += 1;
        }
      }
    });

    await step('prune deleted templates', async () => {
      result.prunedTemplates = await this.deps.templates.purgeDeletedBefore(
        daysBefore(now, TEMPLATE_SOFT_DELETE_DAYS),
      );
    });

    if (!failed) this.lastDay = day;
    // Counts only: never a name, a note or a client id.
    if (Object.values(result).some((n) => n > 0))
      logger.info({ day, ...result }, 'coaching.housekeeping');
    return result;
  }
}

export const coachingMaintenanceWorker = new CoachingMaintenanceWorker();
