import type { IAiUsageRepository } from '@chefer/database';
import type { AiBudgetBlock, AiBudgetGates } from '../ai/budget-gate.js';
import { microToUsd, usdToMicro } from '../ai/pricing.js';

// ─── AI budgets (Phase 2 cost tracking) ───────────────────────────────────────
// Spend is the estimated cost of every recorded model call (AiUsageEvent,
// priced at the PAID list price — lib/ai/pricing.ts), so the limits mean the
// same thing on today's free tiers and after the switch to paid models.
//
// Per user, per calendar month (UTC):
//   ≥ AI_USER_MONTHLY_SOFT_USD  logged once per user per month and flagged
//                               (profile.getAiUsage `aiBudget.status: 'soft'`)
//   ≥ AI_USER_MONTHLY_HARD_USD  new user-initiated AI actions are refused
//                               (premium plan generation falls back to the
//                               curated week instead of failing)
// Globally, per UTC day:
//   ≥ 50% / 80% of AI_GLOBAL_DAILY_USD  one alert email each, per day
//   ≥ 100%  one alert email; new user-initiated AI is refused ("AI is paused
//           for today") and background AI pauses until 00:00 UTC
//
// AI_BUDGET_ENFORCE: `on` (default) as above; `warn` computes, logs and
// emails but never refuses; `off` checks nothing (usage is still recorded).
//
// Reads are cached in memory for `cacheMs` (60 s): one aggregate query per
// minute for the global total and per active user, not one per call. Between
// refreshes every recorded call is added to the cached totals (`record`), so
// the cache never lags real spend by more than the in-flight calls. The alert
// markers are in memory too: a restart on the same day can repeat an alert
// once (harmless), never more.

export type AiBudgetEnforce = 'on' | 'warn' | 'off';

export interface AiBudgetConfig {
  enforce: AiBudgetEnforce;
  userSoftUsd: number;
  userHardUsd: number;
  globalDailyUsd: number;
}

export type AiBudgetStatusLevel = 'ok' | 'soft' | 'hard';

export interface UserAiBudgetStatus {
  /** This calendar month's (UTC) estimated AI cost, USD. */
  monthCostUsd: number;
  softLimitUsd: number;
  hardLimitUsd: number;
  status: AiBudgetStatusLevel;
  /** Today's global AI budget is used up (user AI paused until 00:00 UTC). */
  pausedToday: boolean;
}

export interface GlobalAiSpend {
  todayMicro: number;
  limitMicro: number;
}

export interface AiBudgetLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string, err?: unknown) => void;
}

export interface AiBudgetDeps {
  repo: Pick<IAiUsageRepository, 'sumCostSince'>;
  /** Mails the owner; omitted = alerts are only logged. */
  sendAlert?: ((alert: { subject: string; text: string }) => Promise<void>) | undefined;
  now?: () => Date;
  cacheMs?: number;
  log?: AiBudgetLogger;
}

/** Shown verbatim by web and mobile (TOO_MANY_REQUESTS, like every quota). */
export const AI_USER_BUDGET_MESSAGE =
  "You've used this month's AI allowance. AI features are back on the 1st — your plans, recipes and tracking keep working as usual.";
export const AI_PAUSED_TODAY_MESSAGE =
  "AI is paused for today — the chef is taking a break. It's back after midnight UTC, and everything else keeps working.";

/** Global alert thresholds, as a share of AI_GLOBAL_DAILY_USD. */
export const GLOBAL_ALERT_THRESHOLDS = [0.5, 0.8, 1] as const;

const DEFAULT_CACHE_MS = 60_000;

export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function utcMonthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

const usd = (micro: number): string => `$${microToUsd(micro).toFixed(2)}`;

interface CachedSum {
  /** The UTC day (global) or month (user) the sum belongs to. */
  period: string;
  micro: number;
  fetchedAt: number;
}

export class AiBudget {
  private readonly now: () => Date;
  private readonly cacheMs: number;
  private readonly log: AiBudgetLogger;
  private global: CachedSum | null = null;
  private globalFetch: Promise<number> | null = null;
  private readonly users = new Map<string, CachedSum>();
  /** Thresholds already alerted, for `alertDay`. */
  private alertDay = '';
  private readonly alerted = new Set<number>();
  /** userId → month the soft-limit warning was logged for. */
  private readonly softWarned = new Map<string, string>();

  constructor(
    private readonly config: AiBudgetConfig,
    private readonly deps: AiBudgetDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
    this.cacheMs = deps.cacheMs ?? DEFAULT_CACHE_MS;
    this.log = deps.log ?? {
      info: (m) => console.info(m),
      warn: (m) => console.warn(m),
      error: (m, e) => console.error(m, e),
    };
  }

  get enforce(): AiBudgetEnforce {
    return this.config.enforce;
  }

  /**
   * Adds one recorded call to the cached totals (usage-recorder's
   * onRecorded). Synchronous and cheap; may trigger a threshold alert.
   */
  record(event: { userId: string | null; costMicroUsd: number }): void {
    if (event.costMicroUsd <= 0) return;
    const now = this.now();
    if (this.global?.period === utcDayKey(now)) {
      this.global.micro += event.costMicroUsd;
      this.maybeAlert(now, this.global.micro);
    }
    if (event.userId) {
      const cached = this.users.get(event.userId);
      if (cached?.period === utcMonthKey(now)) cached.micro += event.costMicroUsd;
    }
  }

  /** Today's (UTC) recorded spend vs the global limit; cached for `cacheMs`. */
  async globalSpend(): Promise<GlobalAiSpend> {
    const now = this.now();
    const day = utcDayKey(now);
    const fresh =
      this.global?.period === day && now.getTime() - this.global.fetchedAt < this.cacheMs;
    if (!fresh) {
      // One query in flight at a time, however many requests ask at once.
      this.globalFetch ??= this.deps.repo
        .sumCostSince(startOfUtcDay(now))
        .then((micro) => {
          this.global = { period: day, micro, fetchedAt: now.getTime() };
          return micro;
        })
        .finally(() => {
          this.globalFetch = null;
        });
      await this.globalFetch;
    }
    const todayMicro = this.global?.micro ?? 0;
    this.maybeAlert(now, todayMicro);
    return { todayMicro, limitMicro: usdToMicro(this.config.globalDailyUsd) };
  }

  /** This month's (UTC) recorded spend for one user; cached for `cacheMs`. */
  async userMonthSpendMicro(userId: string): Promise<number> {
    const now = this.now();
    const month = utcMonthKey(now);
    const cached = this.users.get(userId);
    if (cached?.period === month && now.getTime() - cached.fetchedAt < this.cacheMs) {
      return cached.micro;
    }
    const micro = await this.deps.repo.sumCostSince(startOfUtcMonth(now), userId);
    // Bounded: a stale entry is only kept until its user asks again; prune
    // when the map grows past a few thousand active users.
    if (this.users.size > 5_000) this.users.clear();
    this.users.set(userId, { period: month, micro, fetchedAt: now.getTime() });
    return micro;
  }

  /** Whether today's global budget is used up (regardless of the enforce mode). */
  async globalExhausted(): Promise<boolean> {
    const { todayMicro, limitMicro } = await this.globalSpend();
    return todayMicro >= limitMicro;
  }

  /**
   * Why `userId` may not start a new AI action, or null. `warn` mode logs the
   * would-be refusal and returns null; `off` checks nothing.
   */
  async checkUser(userId: string): Promise<AiBudgetBlock | null> {
    if (this.config.enforce === 'off') return null;
    const block = await this.evaluateUser(userId);
    if (!block) return null;
    if (this.config.enforce === 'warn') {
      this.log.warn(
        `[ai.budget] would refuse AI for user ${userId} (${block.reason}) — AI_BUDGET_ENFORCE=warn`,
      );
      return null;
    }
    this.log.info(`[ai.budget] refused AI for user ${userId} (${block.reason})`);
    return block;
  }

  /** Whether background AI may spend now (false only when enforcing and the day's budget is used up). */
  async backgroundAllowed(): Promise<boolean> {
    if (this.config.enforce === 'off') return true;
    const exhausted = await this.globalExhausted();
    if (exhausted && this.config.enforce === 'warn') {
      this.log.warn(
        '[ai.budget] global daily AI budget reached — AI_BUDGET_ENFORCE=warn, background AI continues',
      );
      return true;
    }
    return !exhausted;
  }

  /** The user's month for profile.getAiUsage (computed whatever the enforce mode). */
  async userStatus(userId: string): Promise<UserAiBudgetStatus> {
    const [monthMicro, global] = await Promise.all([
      this.userMonthSpendMicro(userId),
      this.globalSpend(),
    ]);
    return {
      monthCostUsd: microToUsd(monthMicro),
      softLimitUsd: this.config.userSoftUsd,
      hardLimitUsd: this.config.userHardUsd,
      status: this.levelFor(monthMicro),
      pausedToday: this.config.enforce === 'on' && global.todayMicro >= global.limitMicro,
    };
  }

  /** Gates for lib/ai/budget-gate.ts. */
  gates(): AiBudgetGates {
    return {
      user: (userId) => this.checkUser(userId),
      background: () => this.backgroundAllowed(),
    };
  }

  private levelFor(monthMicro: number): AiBudgetStatusLevel {
    if (monthMicro >= usdToMicro(this.config.userHardUsd)) return 'hard';
    if (monthMicro >= usdToMicro(this.config.userSoftUsd)) return 'soft';
    return 'ok';
  }

  private async evaluateUser(userId: string): Promise<AiBudgetBlock | null> {
    if (await this.globalExhausted()) {
      return { reason: 'global_daily', message: AI_PAUSED_TODAY_MESSAGE };
    }
    const monthMicro = await this.userMonthSpendMicro(userId);
    const level = this.levelFor(monthMicro);
    if (level === 'hard') return { reason: 'user_monthly', message: AI_USER_BUDGET_MESSAGE };
    if (level === 'soft') {
      const month = utcMonthKey(this.now());
      if (this.softWarned.get(userId) !== month) {
        this.softWarned.set(userId, month);
        this.log.warn(
          `[ai.budget] user ${userId} passed the soft monthly AI budget: ${usd(monthMicro)} of $${this.config.userSoftUsd.toFixed(2)} (hard limit $${this.config.userHardUsd.toFixed(2)})`,
        );
      }
    }
    return null;
  }

  /** Sends each threshold's alert at most once per UTC day. */
  private maybeAlert(now: Date, todayMicro: number): void {
    if (this.config.enforce === 'off') return;
    const limitMicro = usdToMicro(this.config.globalDailyUsd);
    if (limitMicro <= 0) return;
    const day = utcDayKey(now);
    if (day !== this.alertDay) {
      this.alertDay = day;
      this.alerted.clear();
    }
    // Only the highest newly crossed threshold mails (a jump from 40% to 90%
    // sends the 80% alert, not two), but every lower one is marked done.
    let crossed: number | null = null;
    for (const threshold of GLOBAL_ALERT_THRESHOLDS) {
      if (todayMicro >= threshold * limitMicro && !this.alerted.has(threshold)) {
        this.alerted.add(threshold);
        crossed = threshold;
      }
    }
    if (crossed === null) return;
    const pct = Math.round(crossed * 100);
    const paused = crossed >= 1;
    const subject = `[Chefer] AI spend at ${pct}% of today's budget (${usd(todayMicro)} of ${usd(limitMicro)})`;
    const text = [
      `Estimated AI spend today (${day}, UTC): ${usd(todayMicro)} of AI_GLOBAL_DAILY_USD=${usd(limitMicro)} (${pct}% threshold).`,
      '',
      paused
        ? this.config.enforce === 'on'
          ? 'AI is now PAUSED until 00:00 UTC: new user AI actions are refused ("AI is paused for today"), premium plans fall back to curated weeks and background AI workers wait for tomorrow.'
          : 'AI_BUDGET_ENFORCE=warn: nothing is refused — this is a warning only.'
        : `At 100% new user AI actions are refused and background AI pauses until 00:00 UTC${this.config.enforce === 'warn' ? ' (not while AI_BUDGET_ENFORCE=warn)' : ''}.`,
      '',
      'Costs are estimated at the PAID list price of each model, even on free tiers (apps/api/src/lib/ai/pricing.ts).',
      'Breakdown: the admin-only tRPC query user.aiCostSummary.',
    ].join('\n');
    this.log.warn(`[ai.budget] ${subject}`);
    if (!this.deps.sendAlert) return;
    this.deps.sendAlert({ subject, text }).catch((err: unknown) => {
      this.log.error('[ai.budget] could not send the budget alert email', err);
    });
  }
}
