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
//
// Daily cap (EMAIL_DAILY_CAP): a sweep that stops at the cap is remembered as
// a catch-up and re-run every tick — anchored to its ORIGINAL time, so a
// Sunday recap finished on Monday still recaps Sunday's week — until it
// completes or 48 hours pass. Budget frees up as the rolling 24h window
// moves. Catch-ups live in memory: a restart after the scheduled day drops
// them (those users miss that one email; nobody is ever emailed twice).

const TICK_INTERVAL_MS = 60 * 60 * 1000;
export const WEEK_READY_HOUR_UTC = 7; // Mondays
export const WEEKLY_RECAP_HOUR_UTC = 17; // Sundays
const MONDAY_UTC = 1;
const SUNDAY_UTC = 0;
/** How long a sweep cut short by the daily cap keeps being retried. */
export const CATCH_UP_WINDOW_MS = 48 * 60 * 60 * 1000;

type SweepKind = 'week-ready' | 'recap';
interface Sweep {
  kind: SweepKind;
  /** The time the sweep is "about" — its week. */
  anchor: Date;
}

export class WeeklyEmailWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly catchUps = new Map<SweepKind, Date>();

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
    const sweeps = this.dueSweeps(now);
    if (sweeps.length === 0) return;

    this.running = true;
    try {
      // The scheduled sweep first (it is the timely one), then catch-ups.
      for (const sweep of sweeps) await this.run(sweep);
    } finally {
      this.running = false;
    }
  }

  private dueSweeps(now: Date): Sweep[] {
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const sweeps: Sweep[] = [];
    if (day === MONDAY_UTC && hour >= WEEK_READY_HOUR_UTC) {
      sweeps.push({ kind: 'week-ready', anchor: now });
    } else if (day === SUNDAY_UTC && hour >= WEEKLY_RECAP_HOUR_UTC) {
      sweeps.push({ kind: 'recap', anchor: now });
    }
    for (const [kind, anchor] of this.catchUps) {
      if (now.getTime() - anchor.getTime() > CATCH_UP_WINDOW_MS) {
        console.warn(`[WeeklyEmailWorker] ${kind}: catch-up window closed with sends deferred`);
        this.catchUps.delete(kind);
      } else if (!sweeps.some((s) => s.kind === kind)) {
        sweeps.push({ kind, anchor });
      }
    }
    return sweeps;
  }

  private async run({ kind, anchor }: Sweep): Promise<void> {
    try {
      const result =
        kind === 'week-ready'
          ? await weeklyEmailService.sendWeekReady(anchor)
          : await weeklyEmailService.sendWeeklyRecap(anchor);
      if (result.capped) {
        // Keep the earliest anchor: the window counts from the first attempt.
        if (!this.catchUps.has(kind)) this.catchUps.set(kind, anchor);
      } else {
        this.catchUps.delete(kind);
      }
      if (result.sent > 0 || result.failed > 0 || result.capped) {
        console.log(
          `[WeeklyEmailWorker] ${kind}: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed${result.capped ? `, ${result.deferred} deferred (daily cap)` : ''}`,
        );
      }
    } catch (err) {
      console.error(`[WeeklyEmailWorker] ${kind} sweep failed:`, err);
    }
  }
}

export const weeklyEmailWorker = new WeeklyEmailWorker();
