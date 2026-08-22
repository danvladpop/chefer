import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mealPlanRepository, prisma } from '@chefer/database';
import { mealPlanService } from '../application/meal-plan/meal-plan.service.js';
import { WeeklyPlanWorker } from './weekly-plan.worker.js';

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: { user: { findMany: vi.fn().mockResolvedValue([]) } },
    mealPlanRepository: { findByWeekStart: vi.fn().mockResolvedValue(null) },
  };
});

vi.mock('../application/meal-plan/meal-plan.service.js', () => ({
  mealPlanService: { generate: vi.fn().mockResolvedValue({ planId: 'p1' }) },
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
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue(null);
    // Keep the per-user politeness delay out of test time.
    vi.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    });
  });

  it('does nothing outside the Sunday window', async () => {
    await worker.tick(WEDNESDAY);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('only targets PREMIUM subscribers with a complete profile', async () => {
    await worker.tick(SUNDAY);
    const where = vi.mocked(prisma.user.findMany).mock.calls[0]![0]!.where!;
    expect(where.planTier).toBe('PREMIUM');
    expect(where.chefProfile).toMatchObject({
      age: { not: null },
      weightKg: { not: null },
    });
  });

  it("generates NEXT week's plan (premium path) for users without one", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }] as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).toHaveBeenCalledWith('u1', 1, true);
  });

  it('is idempotent — a user who already has next week planned is skipped', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }] as never);
    vi.mocked(mealPlanRepository.findByWeekStart).mockResolvedValue({ id: 'existing' } as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).not.toHaveBeenCalled();
  });

  it("one user's failure does not starve the rest of the sweep", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }, { id: 'u2' }] as never);
    vi.mocked(mealPlanService.generate)
      .mockRejectedValueOnce(new Error('AI down'))
      .mockResolvedValueOnce({ planId: 'p2' } as never);

    await worker.tick(SUNDAY);

    expect(mealPlanService.generate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mealPlanService.generate).mock.calls[1]![0]).toBe('u2');
  });
});
