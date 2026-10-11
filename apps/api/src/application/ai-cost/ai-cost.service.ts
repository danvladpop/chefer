import type { IAiUsageRepository, IUserRepository } from '@chefer/database';
import {
  startOfUtcDay,
  startOfUtcMonth,
  type UserAiBudgetStatus,
} from '../../lib/ai-budget/budget.js';
import { microToUsd, PRICES_CHECKED_ON } from '../../lib/ai/pricing.js';

// ─── AI cost reporting (Phase 2) ──────────────────────────────────────────────
// Read side of the cost tracking: the user's own month for
// profile.getAiUsage, and the admin summary (user.aiCostSummary). Costs are
// estimates at each model's PAID list price (lib/ai/pricing.ts).

export interface AiCostSummary {
  /** When the summary was computed. */
  generatedAt: Date;
  /** Date the price table was last checked (lib/ai/pricing.ts). */
  pricesCheckedOn: string;
  todayCostUsd: number;
  monthCostUsd: number;
  globalDailyLimitUsd: number;
  enforce: 'on' | 'warn' | 'off';
  /** This month, per routing workload, most expensive first. */
  byWorkload: { workload: string; costUsd: number; calls: number }[];
  /** This month's 10 most expensive users. */
  topUsers: {
    userId: string;
    email: string | null;
    name: string | null;
    planTier: string | null;
    costUsd: number;
    calls: number;
  }[];
}

export interface AiCostServiceDeps {
  usage: Pick<IAiUsageRepository, 'sumCostSince' | 'costByWorkloadSince' | 'topUsersSince'>;
  users: Pick<IUserRepository, 'findMany'>;
  budget: {
    userStatus(userId: string): Promise<UserAiBudgetStatus>;
    readonly enforce: 'on' | 'warn' | 'off';
  };
  globalDailyLimitUsd: number;
  now?: () => Date;
}

export class AiCostService {
  constructor(private readonly deps: AiCostServiceDeps) {}

  /** The user's month vs their allowance (profile.getAiUsage `aiBudget`). */
  userBudget(userId: string): Promise<UserAiBudgetStatus> {
    return this.deps.budget.userStatus(userId);
  }

  async adminSummary(): Promise<AiCostSummary> {
    const now = this.deps.now?.() ?? new Date();
    const monthStart = startOfUtcMonth(now);
    const [today, month, byWorkload, top] = await Promise.all([
      this.deps.usage.sumCostSince(startOfUtcDay(now)),
      this.deps.usage.sumCostSince(monthStart),
      this.deps.usage.costByWorkloadSince(monthStart),
      this.deps.usage.topUsersSince(monthStart, 10),
    ]);
    const users =
      top.length === 0
        ? []
        : await this.deps.users.findMany({
            where: { id: { in: top.map((t) => t.userId) } },
            take: top.length,
          });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      generatedAt: now,
      pricesCheckedOn: PRICES_CHECKED_ON,
      todayCostUsd: microToUsd(today),
      monthCostUsd: microToUsd(month),
      globalDailyLimitUsd: this.deps.globalDailyLimitUsd,
      enforce: this.deps.budget.enforce,
      byWorkload: byWorkload.map((w) => ({
        workload: w.workload,
        costUsd: microToUsd(w.costMicroUsd),
        calls: w.calls,
      })),
      topUsers: top.map((t) => {
        const user = byId.get(t.userId);
        return {
          userId: t.userId,
          email: user?.email ?? null,
          name: user?.name ?? null,
          planTier: user?.planTier ?? null,
          costUsd: microToUsd(t.costMicroUsd),
          calls: t.calls,
        };
      }),
    };
  }
}
