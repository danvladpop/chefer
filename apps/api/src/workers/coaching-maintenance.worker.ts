import {
  coachingInviteRepository,
  coachingLinkRepository,
  coachingNoteRepository,
  type ICoachingInviteRepository,
  type ICoachingLinkRepository,
  type ICoachingNoteRepository,
} from '@chefer/database';
import { COACHING_RETENTION } from '@chefer/types';
import { logger } from '../lib/logger.js';

// ─── Trainer coaching maintenance (docs/trainer-platform/spec.md §8.4, Q-6) ───
// Hourly tick; the housekeeping itself runs once per UTC day. Retention comes
// from COACHING_RETENTION (@chefer/types): recommended defaults that counsel
// must still confirm.
//   1. delete invites that expired more than `inviteAfterExpiryDays` (30) ago;
//   2. delete private notes hidden more than `hiddenNoteDays` (30) ago;
//   3. delete ENDED links that ended more than `endedLinkMonths` (24) ago.
// Every step is idempotent; the "done today" marker is only set when all steps
// succeeded, so a failed step retries on the next tick.

const TICK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
}

const defaultDeps: CoachingMaintenanceDeps = {
  invites: coachingInviteRepository,
  notes: coachingNoteRepository,
  links: coachingLinkRepository,
};

export interface CoachingHousekeepingResult {
  prunedInvites: number;
  prunedNotes: number;
  prunedLinks: number;
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

    const result: CoachingHousekeepingResult = { prunedInvites: 0, prunedNotes: 0, prunedLinks: 0 };
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
    await step('prune ended links', async () => {
      result.prunedLinks = await this.deps.links.deleteEndedBefore(
        monthsBefore(now, COACHING_RETENTION.endedLinkMonths),
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
