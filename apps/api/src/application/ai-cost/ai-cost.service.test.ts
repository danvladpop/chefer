import { describe, expect, it, vi } from 'vitest';
import type { User } from '@chefer/database';
import { AiCostService } from './ai-cost.service.js';

describe('AiCostService.adminSummary', () => {
  it("returns today's and the month's cost, per workload and the top users", async () => {
    const usage = {
      sumCostSince: vi.fn((since: Date) =>
        Promise.resolve(since.getUTCDate() === 1 ? 12_345_678 : 1_500_000),
      ),
      costByWorkloadSince: vi.fn().mockResolvedValue([
        { workload: 'mealPlan', costMicroUsd: 9_000_000, calls: 300 },
        { workload: 'chat', costMicroUsd: 3_345_678, calls: 900 },
      ]),
      topUsersSince: vi.fn().mockResolvedValue([
        { userId: 'u1', costMicroUsd: 5_000_000, calls: 100 },
        { userId: 'gone', costMicroUsd: 1_000_000, calls: 10 },
      ]),
    };
    const users = {
      findMany: vi.fn(
        (): Promise<User[]> =>
          Promise.resolve([
            { id: 'u1', email: 'a@x.dev', name: 'Ann', planTier: 'PREMIUM' } as unknown as User,
          ]),
      ),
    };
    const service = new AiCostService({
      usage,
      users,
      budget: { userStatus: vi.fn(), enforce: 'on' },
      globalDailyLimitUsd: 25,
      now: () => new Date('2026-10-11T12:00:00Z'),
    });

    const summary = await service.adminSummary();

    expect(usage.sumCostSince).toHaveBeenCalledWith(new Date('2026-10-11T00:00:00Z'));
    expect(usage.sumCostSince).toHaveBeenCalledWith(new Date('2026-10-01T00:00:00Z'));
    expect(usage.topUsersSince).toHaveBeenCalledWith(new Date('2026-10-01T00:00:00Z'), 10);
    expect(summary).toMatchObject({
      todayCostUsd: 1.5,
      monthCostUsd: 12.345678,
      globalDailyLimitUsd: 25,
      enforce: 'on',
      byWorkload: [
        { workload: 'mealPlan', costUsd: 9, calls: 300 },
        { workload: 'chat', costUsd: 3.345678, calls: 900 },
      ],
      topUsers: [
        {
          userId: 'u1',
          email: 'a@x.dev',
          name: 'Ann',
          planTier: 'PREMIUM',
          costUsd: 5,
          calls: 100,
        },
        { userId: 'gone', email: null, name: null, planTier: null, costUsd: 1, calls: 10 },
      ],
    });
  });

  it('skips the user lookup when nobody spent anything', async () => {
    const users = { findMany: vi.fn() };
    const service = new AiCostService({
      usage: {
        sumCostSince: vi.fn().mockResolvedValue(0),
        costByWorkloadSince: vi.fn().mockResolvedValue([]),
        topUsersSince: vi.fn().mockResolvedValue([]),
      },
      users,
      budget: { userStatus: vi.fn(), enforce: 'warn' },
      globalDailyLimitUsd: 25,
    });
    const summary = await service.adminSummary();
    expect(summary.topUsers).toEqual([]);
    expect(users.findMany).not.toHaveBeenCalled();
  });
});
