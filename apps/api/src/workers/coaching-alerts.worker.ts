import {
  coachingCheckInService,
  type CoachingCheckInService,
} from '../application/coaching/coaching-check-in.service.js';
import {
  trainerAlertsService,
  type TrainerAlertsService,
} from '../application/coaching/trainer-alerts.service.js';

// ─── Trainer coaching alerts (lane K, market review 2026-10) ──────────────────
// Hourly tick, like WeeklyEmailWorker:
//   - K3: on each trainer's check-in weekday, from CHECK_IN_LIMITS.emailHourUtc
//     (server UTC), email every client whose check-in opened today, once per
//     period (`email_sends` claims make repeated ticks and restarts no-ops).
//   - K4: from QUIET_LIMITS.digestHourUtc daily, the "clients went quiet" digest
//     to trainers who turned it on, only when someone is quiet, once a day.
// A failing part logs and waits for the next tick; it never stops the others.

const TICK_INTERVAL_MS = 60 * 60 * 1000;

export interface CoachingAlertsDeps {
  checkIns: Pick<CoachingCheckInService, 'sendCheckInEmails'>;
  alerts: Pick<TrainerAlertsService, 'sendQuietDigests'>;
}

export class CoachingAlertsWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly deps: CoachingAlertsDeps;

  constructor(deps: Partial<CoachingAlertsDeps> = {}) {
    this.deps = { checkIns: coachingCheckInService, alerts: trainerAlertsService, ...deps };
  }

  start(): void {
    if (this.timer) return;
    console.log('[CoachingAlertsWorker] started (hourly)');
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[CoachingAlertsWorker] stopped');
  }

  /** Exposed for tests: one pass regardless of the timer. */
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      try {
        const r = await this.deps.checkIns.sendCheckInEmails(now);
        if (r.sent > 0 || r.failed > 0 || r.capped) {
          console.log(
            `[CoachingAlertsWorker] check-in emails: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed${r.capped ? ' (daily cap reached)' : ''}`,
          );
        }
      } catch (err) {
        console.error('[CoachingAlertsWorker] check-in emails failed:', err);
      }
      try {
        const r = await this.deps.alerts.sendQuietDigests(now);
        if (r.sent > 0 || r.failed > 0 || r.capped) {
          console.log(
            `[CoachingAlertsWorker] quiet digests: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed${r.capped ? ' (daily cap reached)' : ''}`,
          );
        }
      } catch (err) {
        console.error('[CoachingAlertsWorker] quiet digests failed:', err);
      }
    } finally {
      this.running = false;
    }
  }
}

export const coachingAlertsWorker = new CoachingAlertsWorker();
