import { weeklyEmailService } from '../application/notifications/weekly-email.service.js';

// ─── Weekly emails (audit P2-5) ───────────────────────────────────────────────
// Hourly discovery tick, like WeeklyPlanWorker. Chefer stores no per-user
// time zone, so the sends use fixed UTC hours:
// - Monday from 07:00 UTC: "your week is ready" (08:00/09:00 in Central
//   Europe, 03:00 on the US east coast — the inbox is waiting at breakfast).
//   Always after the Sunday WeeklyPlanWorker (Sundays from 08:00 UTC).
// - Sunday from 17:00 UTC: the week's recap (18:00/19:00 CET).
// "From" — a restart later that day still sends; the email_sends claims
// make every repeated tick a no-op for users already emailed.

const TICK_INTERVAL_MS = 60 * 60 * 1000;
export const WEEK_READY_HOUR_UTC = 7; // Mondays
export const WEEKLY_RECAP_HOUR_UTC = 17; // Sundays
const MONDAY_UTC = 1;
const SUNDAY_UTC = 0;

export class WeeklyEmailWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(): void {
    if (this.timer) return;
    console.log(
      '[WeeklyEmailWorker] started (Mondays from %d:00 UTC, Sundays from %d:00 UTC)',
      WEEK_READY_HOUR_UTC,
      WEEKLY_RECAP_HOUR_UTC,
    );
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[WeeklyEmailWorker] stopped');
  }

  /** Exposed for tests — runs one pass regardless of the timer. */
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const weekReady = day === MONDAY_UTC && hour >= WEEK_READY_HOUR_UTC;
    const recap = day === SUNDAY_UTC && hour >= WEEKLY_RECAP_HOUR_UTC;
    if (!weekReady && !recap) return;

    this.running = true;
    try {
      const result = weekReady
        ? await weeklyEmailService.sendWeekReady(now)
        : await weeklyEmailService.sendWeeklyRecap(now);
      if (result.sent > 0 || result.failed > 0) {
        console.log(
          `[WeeklyEmailWorker] ${weekReady ? 'week-ready' : 'recap'}: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed`,
        );
      }
    } catch (err) {
      console.error('[WeeklyEmailWorker] sweep failed:', err);
    } finally {
      this.running = false;
    }
  }
}

export const weeklyEmailWorker = new WeeklyEmailWorker();
