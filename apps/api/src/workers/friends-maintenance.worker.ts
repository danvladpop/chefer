import {
  followRepository,
  notificationRepository,
  suggestionDismissalRepository,
  type IFollowRepository,
  type INotificationRepository,
  type ISuggestionDismissalRepository,
} from '@chefer/database';
import { FRIENDS_LIMITS } from '@chefer/types';
import { moderationService } from '../application/friends/moderation.service.js';
import { logger } from '../lib/logger.js';

// ─── Following maintenance (docs/friends/implementation-plan.md §4.6, F1.5) ───
// Hourly tick. Once per UTC day it does the housekeeping:
//   1. expire PENDING follow requests older than `requestExpiryDays` (90) and
//      withdraw each one's FOLLOW_REQUEST Activity item — a declined request
//      keeps its item ("You declined"), so an expired one must not be left
//      behind to read that way;
//   2. prune Activity items older than `activityRetentionDays` (90);
//   3. prune suggestion dismissals older than `dismissalDays` (90).
// Once per ISO week (Monday 00:00 UTC) it also logs the `moderation.weekly`
// metrics line.
//
// Every step is idempotent. The "already done today / this week" guards are
// in-memory markers that are only set after the step succeeded, so a failed
// step retries on the next tick, and a restart may repeat one (harmless:
// nothing acts on the metrics line, and the deletes find nothing new).

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

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export interface FriendsMaintenanceDeps {
  follows: Pick<IFollowRepository, 'expirePendingOlderThan'>;
  notifications: Pick<INotificationRepository, 'withdraw' | 'deleteOlderThan'>;
  dismissals: Pick<ISuggestionDismissalRepository, 'deleteOlderThan'>;
  moderation: Pick<typeof moderationService, 'weeklyMetrics'>;
}

const defaultDeps: FriendsMaintenanceDeps = {
  follows: followRepository,
  notifications: notificationRepository,
  dismissals: suggestionDismissalRepository,
  moderation: moderationService,
};

export interface HousekeepingResult {
  expiredRequests: number;
  prunedNotifications: number;
  prunedDismissals: number;
}

export class FriendsMaintenanceWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastMetricsWeek: string | null = null;
  private lastHousekeepingDay: string | null = null;
  private readonly deps: FriendsMaintenanceDeps;

  constructor(deps: Partial<FriendsMaintenanceDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

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
      await this.housekeeping(now);
      await this.weeklyMetrics(now);
    } finally {
      this.running = false;
    }
  }

  /**
   * Expiry and retention, once per UTC day. Each step runs even when an
   * earlier one failed; the day is only marked done when all three succeeded.
   */
  private async housekeeping(now: Date): Promise<void> {
    const day = now.toISOString().slice(0, 10);
    if (day === this.lastHousekeepingDay) return;

    const result: HousekeepingResult = {
      expiredRequests: 0,
      prunedNotifications: 0,
      prunedDismissals: 0,
    };
    let failed = false;
    const step = async (name: string, run: () => Promise<void>): Promise<void> => {
      try {
        await run();
      } catch (err) {
        failed = true;
        console.error(`[FriendsMaintenanceWorker] ${name} failed:`, err);
      }
    };

    await step('expire requests', async () => {
      result.expiredRequests = await this.expireRequests(now);
    });
    await step('prune activity', async () => {
      result.prunedNotifications = await this.deps.notifications.deleteOlderThan(
        daysBefore(now, FRIENDS_LIMITS.activityRetentionDays),
      );
    });
    await step('prune dismissals', async () => {
      result.prunedDismissals = await this.deps.dismissals.deleteOlderThan(
        daysBefore(now, FRIENDS_LIMITS.dismissalDays),
      );
    });

    if (!failed) this.lastHousekeepingDay = day;
    if (result.expiredRequests + result.prunedNotifications + result.prunedDismissals > 0) {
      logger.info({ day, ...result }, 'friends.housekeeping');
    }
  }

  /**
   * Deletes the stale PENDING requests and withdraws each one's FOLLOW_REQUEST
   * Activity item (recipient = the followee, actor = the follower). A failed
   * withdraw is logged and skipped: the item is as old as the request, so the
   * retention prune that follows removes it in the same pass.
   */
  private async expireRequests(now: Date): Promise<number> {
    const expired = await this.deps.follows.expirePendingOlderThan(
      daysBefore(now, FRIENDS_LIMITS.requestExpiryDays),
    );
    for (const { followerId, followeeId } of expired) {
      try {
        await this.deps.notifications.withdraw(followeeId, 'FOLLOW_REQUEST', followerId);
      } catch (err) {
        console.error('[FriendsMaintenanceWorker] withdraw request item failed:', err);
      }
    }
    return expired.length;
  }

  private async weeklyMetrics(now: Date): Promise<void> {
    const week = isoWeekMarker(now);
    if (week === this.lastMetricsWeek) return;
    try {
      const metrics = await this.deps.moderation.weeklyMetrics(daysBefore(now, 7));
      this.lastMetricsWeek = week;
      logger.info({ week, ...metrics }, 'moderation.weekly');
    } catch (err) {
      console.error('[FriendsMaintenanceWorker] weekly metrics failed:', err);
    }
  }
}

export const friendsMaintenanceWorker = new FriendsMaintenanceWorker();
