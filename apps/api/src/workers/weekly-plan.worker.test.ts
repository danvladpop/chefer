import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mealPlanRepository, prisma } from '@chefer/database';
import { coachService } from '../application/coach/coach.service.js';
import { mealPlanService } from '../application/meal-plan/meal-plan.service.js';
import { WeeklyPlanWorker } from './weekly-plan.worker.js';

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      user: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    },
    mealPlanRepository: {
      findByWeekStart: vi.fn().mockResolvedValue(null),
      findFollowedTemplate: vi.fn().mockResolvedValue(null),
      hasShoppingProgress: vi.fn().mockResolvedValue(false),
    },
  };
});

vi.mock('../application/meal-plan/meal-plan.service.js', () => ({
  mealPlanService: {
    generate: vi.fn().mockResolvedValue({ planId: 'p1' }),
    applyTemplateToWeek: vi.fn().mockResolvedValue({ id: 'p1' }),
  },
}));

vi.mock('../application/coach/coach.service.js', () => ({
  coachService: { runReviewSweep: vi.fn().mockResolvedValue({ reviewed: 0 }) },
}));

// A Sunday afternoon (UTC) — inside the generation window.
const SUNDAY = new Date('2026-08-23T12:00:00Z');
// A Wednesday — outside it.
const WEDNESDAY = new Date('2026-08-19T12:00:00Z');

describe('WeeklyPlanWorker', () => {
  const worker = new WeeklyPlanWorker();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue(null);
    vi.mocked(mealPlanRepository.findFollowedTemplate).mockResolvedValue(null);
    vi.mocked(mealPlanRepository.hasShoppingProgress).mockResolvedValue(false);
    // Keep the per-user politeness delay out of test time.
    vi.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    });
  });

  it('does nothing outside the Sunday window', async () => {
    await worker.tick(WEDNESDAY);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(coachService.runReviewSweep).not.toHaveBeenCalled();
  });

  it('runs the chef-review sweep BEFORE plan generation (F1 ordering)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: 'u1' }] as never);

    await worker.tick(SUNDAY);

    expect(coachService.runReviewSweep).toHaveBeenCalledWith(SUNDAY);
    const sweepOrder = vi.mocked(coachService.runReviewSweep).mock.invocationCallOrder[0]!;
    const generateOrder = vi.mocked(mealPlanService.generate).mock.invocationCallOrder[0]!;
    expect(sweepOrder).toBeLessThan(generateOrder);
  });

  it('a review-sweep failure never blocks plan generation', async () => {
    vi.mocked(coachService.runReviewSweep).mockRejectedValueOnce(new Error('review down'));
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: 'u1' }] as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).toHaveBeenCalledWith('u1', 1, true, { origin: 'WEEKLY_AUTO' });
  });

  it('only targets PREMIUM subscribers with a complete profile', async () => {
    await worker.tick(SUNDAY);
    const where = vi.mocked(prisma.user.findMany).mock.calls[0]![0]!.where!;
    expect(where.planTier).toBe('PREMIUM');
    expect(where.chefProfile).toMatchObject({
      age: { not: null },
      weightKg: { not: null },
      autoPlanWeekly: true, // the opt-out toggle (F-PLAN-4-3)
    });
  });

  it("generates NEXT week's plan (premium path) for users without one", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: 'u1' }] as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).toHaveBeenCalledWith('u1', 1, true, { origin: 'WEEKLY_AUTO' });
  });

  it('is idempotent — a user who already has next week planned is skipped', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: 'u1' }] as never);
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue({
      id: 'existing',
      origin: 'USER',
    } as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).not.toHaveBeenCalled();
  });

  it('repeats a followed template instead of generating over it (F-PLAN-4-1)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: 'u1' }] as never);
    const template = { id: 't1', days: [] };
    vi.mocked(mealPlanRepository.findFollowedTemplate).mockResolvedValue(template as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).not.toHaveBeenCalled();
    expect(mealPlanService.applyTemplateToWeek).toHaveBeenCalledWith(
      'u1',
      template,
      expect.any(Date),
    );
  });

  it('replaces an untouched carry-forward copy with a fresh week (F-PLAN-4-2)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: 'u1' }] as never);
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue({
      id: 'copy',
      origin: 'CARRY_FORWARD',
    } as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).toHaveBeenCalledWith('u1', 1, true, { origin: 'WEEKLY_AUTO' });
  });

  it('keeps a carry-forward copy the user already shopped against', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: 'u1' }] as never);
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue({
      id: 'copy',
      origin: 'CARRY_FORWARD',
    } as never);
    vi.mocked(mealPlanRepository.hasShoppingProgress).mockResolvedValue(true);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).not.toHaveBeenCalled();
    expect(mealPlanService.applyTemplateToWeek).not.toHaveBeenCalled();
  });

  it("one user's failure does not starve the rest of the sweep", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }] as never);
    vi.mocked(mealPlanService.generate)
      .mockRejectedValueOnce(new Error('AI down'))
      .mockResolvedValueOnce({ planId: 'p2' } as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mealPlanService.generate).mock.calls[1]![0]).toBe('u2');
  });

  it('stops premium AI generations for this tick once the AI is out of capacity; free weeks go on', async () => {
    const { TRPCError } = await import('@trpc/server');
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] as never)
      .mockResolvedValueOnce([{ id: 'free1' }] as never);
    vi.mocked(mealPlanService.generate).mockRejectedValueOnce(
      new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'over capacity' }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await worker.tick(SUNDAY);

    const users = vi.mocked(mealPlanService.generate).mock.calls.map((c) => c[0]);
    expect(users).toEqual(['p1', 'free1']); // p2/p3 wait for the next hourly tick
  });

  it('also targets FREE accounts with a live session and the toggle on (P2-5)', async () => {
    await worker.tick(SUNDAY);
    const where = vi.mocked(prisma.user.findMany).mock.calls[1]![0]!.where!;
    expect(where.planTier).toBe('FREE');
    expect(where.OR).toEqual([{ chefProfile: null }, { chefProfile: { autoPlanWeekly: true } }]);
    expect(where.sessions).toEqual({ some: { expires: { gt: SUNDAY } } });
  });

  it('gives free users a curated week (premium=false), tagged WEEKLY_AUTO', async () => {
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 'free1' }] as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).toHaveBeenCalledWith('free1', 1, false, {
      origin: 'WEEKLY_AUTO',
    });
  });

  it('never overwrites a week a free user already planned', async () => {
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 'free1' }] as never);
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue({
      id: 'mine',
      origin: 'USER',
    } as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).not.toHaveBeenCalled();
  });

  // ─── AI data consent (App Store 5.1.2(i)) ───────────────────────────────────

  it('premium AI generation only targets users with AI data consent', async () => {
    await worker.tick(SUNDAY);
    const where = vi.mocked(prisma.user.findMany).mock.calls[0]![0]!.where!;
    expect(where.planTier).toBe('PREMIUM');
    expect(where.aiDataConsentAt).toEqual({ not: null });
  });

  it('counts and logs the premium users skipped for missing consent', async () => {
    vi.mocked(prisma.user.count).mockResolvedValueOnce(3);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await worker.tick(SUNDAY);

    const countWhere = vi.mocked(prisma.user.count).mock.calls[0]![0]!.where!;
    expect(countWhere).toMatchObject({ planTier: 'PREMIUM', aiDataConsentAt: null });
    expect(log).toHaveBeenCalledWith(
      '[WeeklyPlanWorker] skipped 3 premium user(s) without AI data consent',
    );
    log.mockRestore();
  });

  it('free curated weeks involve no AI and are not consent-gated', async () => {
    await worker.tick(SUNDAY);
    const freeWhere = vi.mocked(prisma.user.findMany).mock.calls[1]![0]!.where!;
    expect(freeWhere.planTier).toBe('FREE');
    expect(freeWhere).not.toHaveProperty('aiDataConsentAt');
  });
});
