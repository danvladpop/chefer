import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { getTodayAiUsage, markLatestImportSaved } from '../application/profile/ai-usage.service.js';
import { mealPlanRouter } from './meal-plan.router.js';

// T-10.8 / delta rule 6: `profile.getAiUsage` must agree with what
// `meal-plan.router.ts` + `lib/quotas.ts` actually reserve. These tests drive
// the REAL router and the REAL quota code against an in-memory `aiCallLog`
// (no DB), then read the counters back through the same service the
// procedure uses.

type Row = { id: string; userId: string; callType: string; createdAt: Date; saved: boolean | null };

const store = vi.hoisted(() => ({ rows: [] as unknown[], seq: 0 }));
const rowsOf = () => store.rows as Row[];

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  const matches = (r: Row, where: Record<string, unknown>) =>
    (where['userId'] === undefined || r.userId === where['userId']) &&
    (where['callType'] === undefined || r.callType === where['callType']) &&
    (where['createdAt'] === undefined ||
      r.createdAt >= (where['createdAt'] as { gte: Date }).gte) &&
    (where['OR'] === undefined || r.saved !== true);
  const aiCallLog = {
    count: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rowsOf().filter((r) => matches(r, where)).length,
    ),
    create: vi.fn(async ({ data }: { data: { userId: string; callType: string } }) => {
      const row: Row = {
        id: `log${++store.seq}`,
        userId: data.userId,
        callType: data.callType,
        createdAt: new Date(),
        saved: null,
      };
      rowsOf().push(row);
      return row;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      store.rows = rowsOf().filter((r) => r.id !== where.id);
      return {};
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rowsOf().filter((r) => matches(r, where)),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rowsOf()
        .filter((r) => matches(r, where))
        .at(-1),
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { saved: boolean } }) => {
      const row = rowsOf().find((r) => r.id === where.id);
      if (row) row.saved = data.saved;
      return row;
    }),
  };
  return {
    ...mod,
    prisma: {
      aiCallLog,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ aiCallLog })),
    },
  };
});

const svc = vi.hoisted(() => ({
  generate: vi.fn().mockResolvedValue({ id: 'plan1' }),
  planDay: vi.fn().mockResolvedValue({ id: 'plan1' }),
  resumeTailoring: vi.fn().mockResolvedValue({ id: 'plan1' }),
}));
vi.mock('../application/meal-plan/meal-plan.service.js', () => ({ mealPlanService: svc }));
vi.mock('../application/meal-plan/plan-shape.service.js', () => ({ planShapeService: {} }));
vi.mock('../lib/env.js', () => ({ env: { AI_PLAN_TAILORING: true } }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const freeUser: UserProfile = {
  id: 'u1',
  email: 'u@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const callerFor = (user: UserProfile) =>
  mealPlanRouter.createCaller({
    user,
    requestId: 'test',
    ipAddress: '127.0.0.1',
    sessionToken: null,
    isMobileClient: true,
    clientApiLevel: 2,
    res: {} as Response,
  });

beforeEach(() => {
  store.rows = [];
  store.seq = 0;
  vi.clearAllMocks();
});

describe('getAiUsage counting rules (T-10.8, B-49)', () => {
  it('a free curated generate raises curatedPlans, not aiMealPlans or the AI total', async () => {
    await callerFor(freeUser).generate({ weekOffset: 0 });

    const usage = await getTodayAiUsage('u1');
    expect(usage.curatedPlans).toBe(1);
    expect(usage.aiMealPlans).toBe(0);
    expect(usage.today.MEAL_PLAN).toBe(0);
    expect(usage.geminiTotal).toBe(0);
  });

  it('a premium generate is ONE AI-plan reservation — its instant curated week is not a second count', async () => {
    const premium: UserProfile = { ...freeUser, planTier: 'PREMIUM' };
    await callerFor(premium).generate({ weekOffset: 0 });

    // The router asks the service for an instant curated week + live tailoring.
    expect(svc.generate).toHaveBeenCalledWith(
      'u1',
      0,
      true,
      expect.objectContaining({ instant: true, usageReserved: true }),
    );
    const usage = await getTodayAiUsage('u1');
    expect(usage.aiMealPlans).toBe(1);
    expect(usage.curatedPlans).toBe(0);
    expect(usage.geminiTotal).toBe(1);
  });

  it('resumeTailoring costs nothing: counters are unchanged', async () => {
    const premium: UserProfile = { ...freeUser, planTier: 'PREMIUM' };
    const caller = callerFor(premium);
    await caller.generate({ weekOffset: 0 });
    const before = await getTodayAiUsage('u1');

    await caller.resumeTailoring({ planId: 'plan1' });

    expect(svc.resumeTailoring).toHaveBeenCalledTimes(1);
    expect(await getTodayAiUsage('u1')).toEqual(before);
  });

  it('planDay is a curated reservation on every tier, never an AI plan', async () => {
    const premium: UserProfile = { ...freeUser, planTier: 'PREMIUM' };
    await callerFor(premium).planDay({ planId: 'plan1', dayOfWeek: 2 });

    const usage = await getTodayAiUsage('u1');
    expect(usage.curatedPlans).toBe(1);
    expect(usage.aiMealPlans).toBe(0);
  });

  it('a failed generation is refunded and leaves the counters untouched', async () => {
    svc.generate.mockRejectedValueOnce(new Error('pool exhausted'));
    await expect(callerFor(freeUser).generate({ weekOffset: 0 })).rejects.toThrow();

    const usage = await getTodayAiUsage('u1');
    expect(usage.curatedPlans).toBe(0);
    expect(usage.aiMealPlans).toBe(0);
  });

  it('the free curated cap (3/day) still applies, and only curated rows count towards it', async () => {
    const caller = callerFor(freeUser);
    await caller.generate({ weekOffset: 0 });
    await caller.generate({ weekOffset: 0 });
    await caller.generate({ weekOffset: 0 });
    await expect(caller.generate({ weekOffset: 0 })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect((await getTodayAiUsage('u1')).curatedPlans).toBe(3);
  });
});

describe('importsSaved (Q-19: the AI cost is the preview)', () => {
  it('counts previews that ended as a saved recipe; the preview itself stays the AI cost', async () => {
    const { prisma } = await import('@chefer/database');
    await prisma.aiCallLog.create({ data: { userId: 'u1', callType: 'RECIPE_IMPORT' } });
    await prisma.aiCallLog.create({ data: { userId: 'u1', callType: 'RECIPE_IMPORT' } });

    expect((await getTodayAiUsage('u1')).importsSaved).toBe(0);

    await markLatestImportSaved('u1');
    const usage = await getTodayAiUsage('u1');
    expect(usage.today.RECIPE_IMPORT).toBe(2);
    expect(usage.importsSaved).toBe(1);
    expect(usage.geminiTotal).toBe(2);
  });

  it('never throws when the counter update fails (a save must not fail on a counter)', async () => {
    const { prisma } = await import('@chefer/database');
    vi.mocked(prisma.aiCallLog.findFirst).mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(markLatestImportSaved('u1')).resolves.toBeUndefined();
  });
});
