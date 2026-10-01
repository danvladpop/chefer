import { moderationService } from '../application/friends/moderation.service.js';
import { logger } from '../lib/logger.js';

// ─── Following maintenance (docs/friends/implementation-plan.md §4.6, F1.5) ───
// STUB (F0.3): wired into index.ts start/stop so F1.5 only fills in the tick.
// F1.5 adds: expire pending follow requests older than 90 days, prune
// Activity items older than 90 days.
//
// Today the tick only logs the weekly moderation metrics line, once per ISO
// week (Monday 00:00 UTC). The guard is an in-memory marker: a restart may
// log the line twice in a week, which is harmless — nothing acts on it.

const TICK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC Monday (YYYY-MM-DD) of the ISO week containing `now`. */
export function isoWeekMarker(now: Date): string {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
  );
  return monday.toISOString().slice(0, 10);
}

export class FriendsMaintenanceWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastMetricsWeek: string | null = null;

  start(): void {
    if (this.timer) return;
    console.log('[FriendsMaintenanceWorker] started (hourly)');
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[FriendsMaintenanceWorker] stopped');
  }

  /** Exposed for tests — runs one pass regardless of the timer. */
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.weeklyMetrics(now);
    } finally {
      this.running = false;
    }
  }

  private async weeklyMetrics(now: Date): Promise<void> {
    const week = isoWeekMarker(now);
    if (week === this.lastMetricsWeek) return;
    try {
      const metrics = await moderationService.weeklyMetrics(new Date(now.getTime() - 7 * DAY_MS));
      this.lastMetricsWeek = week;
      logger.info({ week, ...metrics }, 'moderation.weekly');
    } catch (err) {
      console.error('[FriendsMaintenanceWorker] weekly metrics failed:', err);
    }
  }
}

export const friendsMaintenanceWorker = new FriendsMaintenanceWorker();
