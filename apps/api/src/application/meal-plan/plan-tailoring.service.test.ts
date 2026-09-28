import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  stableSlotsJson,
  type IMealPlanRepository,
  type IMealPlanTailoringRepository,
  type MealPlanTailoring,
  type PlanMealSlotJson,
  type TailoringProgressPatch,
} from '@chefer/database';
import { TailoringTimeoutError } from './plan-tailoring.js';
import { PlanTailoringService } from './plan-tailoring.service.js';

// The service module's default wiring imports the real singletons; the
// tests inject fakes, so only keep the module graph light.
vi.mock('./meal-plan.service.js', () => ({ mealPlanService: { tailorDay: vi.fn() } }));

// ─── In-memory world: one plan, one job ───────────────────────────────────────

const NOW = new Date(2026, 8, 30, 12, 0, 0).getTime(); // Wednesday 30 Sep 2026
const MONDAY = new Date(2026, 8, 28);

type Days = { dayOfWeek: number; meals: PlanMealSlotJson[] }[];

function curatedWeek(): Days {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    dayOfWeek: d,
    meals: [
      { type: 'breakfast', recipeId: `cur-b${d}` },
      { type: 'dinner', recipeId: `cur-d${d}` },
    ],
  }));
}

function makeWorld(opts: { queued?: number[]; status?: string } = {}) {
  const days = curatedWeek();
  const queued = opts.queued ?? [2, 3, 4, 5, 6];
  const plan = {
    id: 'plan1',
    userId: 'u1',
    status: opts.status ?? 'ACTIVE',
    isTemplate: false,
    weekStartDate: MONDAY,
    days,
  };
  let job: MealPlanTailoring = {
    id: 'job1',
    planId: 'plan1',
    userId: 'u1',
    status: 'RUNNING',
    totalDays: queued.length,
    queuedDays: [...queued],
    tailoredDays: [],
    keptDays: [],
    failedDays: [],
    currentDay: queued[0] ?? null,
    snapshots: Object.fromEntries(queued.map((d) => [String(d), structuredClone(days[d]!.meals)])),
    baselineCheckedKeys: ['old-tick'],
    slotTypes: ['breakfast', 'lunch', 'dinner'],
    leftovers: false,
    strikes: 0,
    resumes: 0,
    nextRunAt: new Date(NOW),
    leaseUntil: null,
    lastError: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    finishedAt: null,
  };
  const checkedKeys: string[] = ['old-tick'];
  const logged: Record<string, string[]> = {};
  const gate = { planTier: 'PREMIUM', role: 'USER', aiDataConsentAt: new Date(NOW) as Date | null };

  const repo: IMealPlanTailoringRepository = {
    create: vi.fn(),
    findByPlanId: vi.fn(async () => job),
    cancelRunningForWeek: vi.fn(),
    claimNextDue: vi.fn(async (now: Date) =>
      job.status === 'RUNNING' && job.nextRunAt.getTime() <= now.getTime() ? job : null,
    ),
    saveProgress: vi.fn(async (_id: string, patch: TailoringProgressPatch) => {
      job = { ...job, ...patch };
      return job;
    }),
    nextDueAt: vi.fn(async () => job.nextRunAt),
    replaceDayIfUnchanged: vi.fn(
      async (
        _planId: string,
        d: number,
        expected: PlanMealSlotJson[],
        meals: PlanMealSlotJson[],
      ) => {
        if (plan.status !== 'ACTIVE') return false;
        const target = days.find((x) => x.dayOfWeek === d)!;
        if (stableSlotsJson(target.meals) !== stableSlotsJson(expected)) return false;
        target.meals = meals;
        return true;
      },
    ),
    findCheckedKeys: vi.fn(async () => [...checkedKeys]),
    findLoggedRecipeIds: vi.fn(async (_u: string, date: Date) => logged[date.toISOString()] ?? []),
    findUserGate: vi.fn(async () => gate),
  };
  const planRepo = {
    findByIdForUser: vi.fn(async () => structuredClone(plan)),
  } as unknown as IMealPlanRepository;

  const aiDay = (d: number): { meals: PlanMealSlotJson[] } => ({
    meals: [
      { type: 'breakfast', recipeId: `ai-b${d}` },
      { type: 'dinner', recipeId: `ai-d${d}` },
    ],
  });
  const tailor = { tailorDay: vi.fn(async (args: { dayOfWeek: number }) => aiDay(args.dayOfWeek)) };
  let clock = NOW;
  const service = new PlanTailoringService(repo, planRepo, tailor, () => clock);

  return {
    service,
    repo,
    tailor,
    plan,
    days,
    checkedKeys,
    logged,
    gate,
    job: () => job,
    advance: (ms: number) => {
      clock += ms;
    },
    /** Runs steps until nothing is due at the current clock. */
    drain: async () => {
      let guard = 0;
      while ((await service.runNext()) && guard++ < 50);
    },
  };
}

const capacityError = () => Object.assign(new Error('429 capacity exceeded'), { status: 429 });

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('PlanTailoringService — day by day', () => {
  it('replaces each queued day in order (today first) and finishes DONE', async () => {
    const w = makeWorld();
    await w.drain();

    expect(w.tailor.tailorDay.mock.calls.map((c) => c[0].dayOfWeek)).toEqual([2, 3, 4, 5, 6]);
    expect(w.job()).toMatchObject({
      status: 'DONE',
      tailoredDays: [2, 3, 4, 5, 6],
      queuedDays: [],
      currentDay: null,
    });
    // Past days (Mon/Tue) keep their curated meals.
    expect(w.days[0]!.meals[0]!.recipeId).toBe('cur-b0');
    expect(w.days[2]!.meals.map((m) => m.recipeId)).toEqual(['ai-b2', 'ai-d2']);
  });

  it('persists progress after every day (visible to polling clients)', async () => {
    const w = makeWorld();
    await w.service.runNext();
    expect(w.job()).toMatchObject({ status: 'RUNNING', tailoredDays: [2], currentDay: 3 });
    expect(w.job().queuedDays).toEqual([3, 4, 5, 6]);
  });

  it('never overwrites a day the user changed after generation — it is kept, no AI call', async () => {
    const w = makeWorld();
    w.plan.days[3]!.meals[1] = { type: 'dinner', recipeId: 'user-swap' };
    await w.drain();

    expect(w.tailor.tailorDay.mock.calls.map((c) => c[0].dayOfWeek)).toEqual([2, 4, 5, 6]);
    expect(w.days[3]!.meals[1]!.recipeId).toBe('user-swap');
    expect(w.job()).toMatchObject({ status: 'DONE', keptDays: [3] });
  });

  it('a change that lands while the AI is working wins (compare-and-set)', async () => {
    const w = makeWorld({ queued: [2] });
    w.tailor.tailorDay.mockImplementationOnce(async () => {
      w.days[2]!.meals[0] = { type: 'breakfast', recipeId: 'user-pick', pinned: true };
      return { meals: [{ type: 'breakfast', recipeId: 'ai-b2' }] };
    });
    await w.drain();
    expect(w.days[2]!.meals[0]!.recipeId).toBe('user-pick');
    expect(w.job()).toMatchObject({ status: 'DONE', keptDays: [2], tailoredDays: [] });
  });

  it('skips today when a meal of it is already logged', async () => {
    const w = makeWorld();
    w.logged[new Date(Date.UTC(2026, 8, 30)).toISOString()] = ['cur-d2'];
    await w.drain();
    expect(w.tailor.tailorDay.mock.calls.map((c) => c[0].dayOfWeek)).toEqual([3, 4, 5, 6]);
    expect(w.job().keptDays).toEqual([2]);
  });

  it('a day with nothing unlocked is kept without writing', async () => {
    const w = makeWorld({ queued: [2] });
    w.tailor.tailorDay.mockResolvedValueOnce({ skip: 'locked' } as never);
    await w.drain();
    expect(w.repo.replaceDayIfUnchanged).not.toHaveBeenCalled();
    expect(w.job()).toMatchObject({ status: 'DONE', keptDays: [2] });
  });
});

describe('PlanTailoringService — never worse than the curated week', () => {
  it('capacity errors keep the curated day, back off and retry the same day', async () => {
    const w = makeWorld();
    w.tailor.tailorDay.mockRejectedValueOnce(capacityError());
    await w.service.runNext();

    expect(w.job()).toMatchObject({ status: 'RUNNING', strikes: 1, queuedDays: [2, 3, 4, 5, 6] });
    expect(w.job().nextRunAt.getTime()).toBe(NOW + 30_000);
    expect(await w.service.runNext()).toBe(false); // not due yet

    w.advance(30_000);
    await w.drain();
    expect(w.job()).toMatchObject({ status: 'DONE', tailoredDays: [2, 3, 4, 5, 6], strikes: 0 });
  });

  it('repeated quota errors stop the job as PARTIAL; untailored days stay curated', async () => {
    const w = makeWorld();
    await w.service.runNext(); // day 2 tailored
    w.tailor.tailorDay.mockRejectedValue(capacityError());
    for (let i = 0; i < 3; i++) {
      w.advance(10 * 60_000);
      await w.service.runNext();
    }
    expect(w.job()).toMatchObject({
      status: 'PARTIAL',
      tailoredDays: [2],
      queuedDays: [3, 4, 5, 6],
      currentDay: null,
    });
    expect(w.days[3]!.meals[0]!.recipeId).toBe('cur-b3');
  });

  it('nothing tailored before giving up is FAILED', async () => {
    const w = makeWorld();
    w.tailor.tailorDay.mockRejectedValue(
      new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'over capacity' }),
    );
    for (let i = 0; i < 3; i++) {
      await w.service.runNext();
      w.advance(10 * 60_000);
    }
    expect(w.job().status).toBe('FAILED');
  });

  it('a bad or late day keeps its curated meals and the chef moves on', async () => {
    const w = makeWorld({ queued: [2, 3] });
    w.tailor.tailorDay.mockRejectedValueOnce(new TailoringTimeoutError(60_000));
    await w.drain();
    expect(w.job()).toMatchObject({
      status: 'PARTIAL',
      failedDays: [2],
      tailoredDays: [3],
    });
    expect(w.days[2]!.meals[0]!.recipeId).toBe('cur-b2');
  });

  it('a new shopping tick stops tailoring — the list being shopped stays true', async () => {
    const w = makeWorld();
    await w.service.runNext();
    w.checkedKeys.push('plan1-tomato|g');
    await w.drain();
    expect(w.job()).toMatchObject({
      status: 'PARTIAL',
      tailoredDays: [2],
      queuedDays: [3, 4, 5, 6],
    });
  });

  it('stops when AI consent is withdrawn mid-way', async () => {
    const w = makeWorld();
    await w.service.runNext();
    w.gate.aiDataConsentAt = null;
    await w.drain();
    expect(w.tailor.tailorDay).toHaveBeenCalledTimes(1);
    expect(w.job().status).toBe('PARTIAL');
  });
});

describe('PlanTailoringService — cancellation', () => {
  it('a newer generation (plan archived) cancels the job without writing', async () => {
    const w = makeWorld();
    await w.service.runNext();
    w.plan.status = 'ARCHIVED';
    await w.drain();
    expect(w.job().status).toBe('CANCELLED');
    expect(w.tailor.tailorDay).toHaveBeenCalledTimes(1);
  });

  it('an archive that lands while the AI is working never gets the day written', async () => {
    const w = makeWorld({ queued: [2] });
    w.tailor.tailorDay.mockImplementationOnce(async () => {
      w.plan.status = 'ARCHIVED';
      return { meals: [{ type: 'dinner', recipeId: 'late' }] };
    });
    await w.drain();
    expect(w.job().status).toBe('CANCELLED');
    expect(w.days[2]!.meals[1]!.recipeId).toBe('cur-d2');
  });

  it('a deleted plan cancels the job', async () => {
    const w = makeWorld();
    vi.mocked(w.repo.findByPlanId).mockResolvedValue(null);
    const planRepo = { findByIdForUser: vi.fn().mockResolvedValue(null) };
    const service = new PlanTailoringService(w.repo, planRepo as never, w.tailor, () => NOW);
    await service.runNext();
    expect(w.job().status).toBe('CANCELLED');
  });
});
