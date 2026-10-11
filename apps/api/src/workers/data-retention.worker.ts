import {
  aiUsageRepository,
  sessionRepository,
  type IAiUsageRepository,
  type ISessionRepository,
} from '@chefer/database';

// ─── Data retention (Phase 2) ─────────────────────────────────────────────────
// Hourly tick, work once per UTC day (same shape as FriendsMaintenanceWorker,
// which is Following-specific and runs only for that feature's data):
//   1. delete auth sessions whose `expires` has passed (sign-in rejects them
//      already; the rows were never cleaned up);
//   2. delete AI usage events (AiUsageEvent) older than 90 days — the budgets
//      only read the current UTC day and month, the admin summary today and
//      this month;
//   3. delete AI quota reservations (AiCallLog) older than 90 days — the daily
//      quotas and profile.getAiUsage only count today's rows. The account
//      export (application/user/account-data.service.ts) lists the history
//      that is kept. Neither docs/analytics-funnel.md (PostHog) nor
//      docs/beta-dashboard.sql reads either AI table or `sessions`.
//
// Each step runs even when an earlier one failed; the day is only marked done
// when all of them succeeded, so a failure retries on the next tick.

const TICK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How long AI usage events and AI call logs are kept. */
export const AI_LOG_RETENTION_DAYS = 90;

export interface DataRetentionDeps {
  sessions: Pick<ISessionRepository, 'deleteExpired'>;
  aiUsage: Pick<IAiUsageRepository, 'deleteOlderThan' | 'deleteCallLogsOlderThan'>;
}

export interface DataRetentionResult {
  expiredSessions: number;
  aiUsageEvents: number;
  aiCallLogs: number;
}

export class DataRetentionWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastDay: string | null = null;
  private readonly deps: DataRetentionDeps;

  constructor(deps: Partial<DataRetentionDeps> = {}) {
    this.deps = { sessions: sessionRepository, aiUsage: aiUsageRepository, ...deps };
  }

  start(): void {
    if (this.timer) return;
    console.log('[DataRetentionWorker] started (hourly)');
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[DataRetentionWorker] stopped');
  }

  /** Exposed for tests — one pass; the prune runs at most once per UTC day. */
  async tick(now = new Date()): Promise<DataRetentionResult | null> {
    if (this.running) return null;
    const day = now.toISOString().slice(0, 10);
    if (day === this.lastDay) return null;
    this.running = true;
    try {
      const cutoff = new Date(now.getTime() - AI_LOG_RETENTION_DAYS * DAY_MS);
      const result: DataRetentionResult = { expiredSessions: 0, aiUsageEvents: 0, aiCallLogs: 0 };
      let failed = false;
      const step = async (name: string, run: () => Promise<void>): Promise<void> => {
        try {
          await run();
        } catch (err) {
          failed = true;
          console.error(`[DataRetentionWorker] ${name} failed (retrying next tick)`, err);
        }
      };
      await step('expired sessions', async () => {
        result.expiredSessions = await this.deps.sessions.deleteExpired(now);
      });
      await step('AI usage events', async () => {
        result.aiUsageEvents = await this.deps.aiUsage.deleteOlderThan(cutoff);
      });
      await step('AI call logs', async () => {
        result.aiCallLogs = await this.deps.aiUsage.deleteCallLogsOlderThan(cutoff);
      });
      if (!failed) this.lastDay = day;
      console.log(
        `[DataRetentionWorker] pruned ${result.expiredSessions} expired session(s), ${result.aiUsageEvents} AI usage event(s) and ${result.aiCallLogs} AI call log(s) older than ${AI_LOG_RETENTION_DAYS} days`,
      );
      return result;
    } finally {
      this.running = false;
    }
  }
}

export const dataRetentionWorker = new DataRetentionWorker();
