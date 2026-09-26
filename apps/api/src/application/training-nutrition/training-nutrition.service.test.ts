import { describe, expect, it, vi } from 'vitest';
import { computeMacroTargets } from '../preferences/preferences.service.js';
import { TrainingNutritionService } from './training-nutrition.service.js';

// Audit P2-4: the gym facts the food side reads. Repositories are faked —
// no database.

function service(opts: {
  setupCompletedAt?: Date | null;
  latestWeightKg?: number | null;
  days?: { plannedWeekday: number | null; name: string }[];
  completed?: { localDate: string; name: string }[];
  pauses?: { startDate: string; endDate: string }[];
}) {
  const gymProfileRepo = {
    findByUserId: vi
      .fn()
      .mockResolvedValue(
        opts.setupCompletedAt === undefined ? null : { setupCompletedAt: opts.setupCompletedAt },
      ),
  };
  const weightRepo = {
    findLatest: vi
      .fn()
      .mockResolvedValue(opts.latestWeightKg == null ? null : { weightKg: opts.latestWeightKg }),
  };
  const routineRepo = {
    findActive: vi.fn().mockResolvedValue(opts.days ? { days: opts.days } : null),
  };
  const sessionRepo = { findCompleted: vi.fn().mockResolvedValue(opts.completed ?? []) };
  const pauseRepo = { listForUser: vi.fn().mockResolvedValue(opts.pauses ?? []) };
  const svc = new TrainingNutritionService(
    gymProfileRepo,
    weightRepo,
    routineRepo,
    sessionRepo,
    pauseRepo,
  );
  return { svc, gymProfileRepo, sessionRepo };
}

describe('TrainingNutritionService.loadLifter', () => {
  it('a set-up lifter with GAIN_MUSCLE gets the latest logged bodyweight', async () => {
    const { svc } = service({ setupCompletedAt: new Date(), latestWeightKg: 82.5 });
    expect(await svc.loadLifter('u1', { goal: 'GAIN_MUSCLE', weightKg: 80 })).toEqual({
      lifterBodyweightKg: 82.5,
    });
  });

  it('falls back to the profile weight when nothing is logged', async () => {
    const { svc } = service({ setupCompletedAt: new Date(), latestWeightKg: null });
    expect(await svc.loadLifter('u1', { goal: 'GAIN_MUSCLE', weightKg: 80 })).toEqual({
      lifterBodyweightKg: 80,
    });
  });

  it('every goal with a g/kg rule counts (LOSE_WEIGHT, MAINTAIN too)', async () => {
    const { svc } = service({ setupCompletedAt: new Date(), latestWeightKg: 80 });
    expect(await svc.loadLifter('u1', { goal: 'MAINTAIN', weightKg: 80 })).toEqual({
      lifterBodyweightKg: 80,
    });
    expect(await svc.loadLifter('u1', { goal: 'LOSE_WEIGHT', weightKg: 80 })).toEqual({
      lifterBodyweightKg: 80,
    });
  });

  it('no goal skips the reads entirely', async () => {
    const { svc, gymProfileRepo } = service({ setupCompletedAt: new Date(), latestWeightKg: 80 });
    expect(await svc.loadLifter('u1', { goal: null, weightKg: 80 })).toEqual({
      lifterBodyweightKg: null,
    });
    expect(gymProfileRepo.findByUserId).not.toHaveBeenCalled();
  });

  it('no gym setup (or unfinished setup) → not a lifter', async () => {
    expect(
      await service({ latestWeightKg: 80 }).svc.loadLifter('u1', {
        goal: 'GAIN_MUSCLE',
        weightKg: 80,
      }),
    ).toEqual({ lifterBodyweightKg: null });
    expect(
      await service({ setupCompletedAt: null, latestWeightKg: 80 }).svc.loadLifter('u1', {
        goal: 'GAIN_MUSCLE',
        weightKg: 80,
      }),
    ).toEqual({ lifterBodyweightKg: null });
  });
});

describe('TrainingNutritionService.previewTargets', () => {
  const metrics = {
    goal: 'GAIN_MUSCLE',
    biologicalSex: 'MALE',
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'MODERATELY_ACTIVE',
  };
  const split = computeMacroTargets(80, 180, 30, 'MODERATELY_ACTIVE', 'MALE', 'GAIN_MUSCLE');

  it('a non-lifter sees the goal split, lifter null', async () => {
    const { svc } = service({ latestWeightKg: 80 });
    expect(await svc.previewTargets('u1', metrics)).toEqual({ ...split, lifter: null });
  });

  it('a lifter sees 1.8 g/kg protein on GAIN_MUSCLE, calories unchanged', async () => {
    const { svc } = service({ setupCompletedAt: new Date(), latestWeightKg: null });
    const t = await svc.previewTargets('u1', metrics);
    expect(t.dailyCalorieTarget).toBe(split.dailyCalorieTarget);
    expect(t.proteinG).toBe(144);
    expect(t.carbsG).toBe(split.carbsG + (split.proteinG - 144));
    expect(t.fatG).toBe(split.fatG);
    expect(t.proteinPct).toBe(Math.round(((144 * 4) / t.dailyCalorieTarget) * 100));
    expect(t.lifter).toEqual({ bodyweightKg: 80, proteinGPerKg: 1.8 });
  });

  it('uses the latest logged bodyweight and the goal rule (LOSE_WEIGHT 2.0)', async () => {
    const { svc } = service({ setupCompletedAt: new Date(), latestWeightKg: 85 });
    const t = await svc.previewTargets('u1', { ...metrics, goal: 'LOSE_WEIGHT' });
    expect(t.proteinG).toBe(170);
    expect(t.lifter).toEqual({ bodyweightKg: 85, proteinGPerKg: 2 });
  });
});

describe('TrainingNutritionService.trainingDayFor', () => {
  const days = [
    { plannedWeekday: 0, name: 'Full Body A' },
    { plannedWeekday: 3, name: 'Full Body B' },
  ];

  it('reads the schedule for the weekday', async () => {
    const { svc, sessionRepo } = service({ days });
    expect(await svc.trainingDayFor('u1', '2026-09-28', 0)).toEqual({
      isTrainingDay: true,
      reason: 'SCHEDULED',
      workoutName: 'Full Body A',
    });
    expect(sessionRepo.findCompleted).toHaveBeenCalledWith('u1', {
      fromLocalDate: '2026-09-28',
      toLocalDate: '2026-09-28',
    });
  });

  it('a completed workout on the day counts', async () => {
    const { svc } = service({ days, completed: [{ localDate: '2026-09-29', name: 'Freestyle' }] });
    expect((await svc.trainingDayFor('u1', '2026-09-29', 1)).reason).toBe('COMPLETED');
  });

  it('a training pause covering the day cancels the schedule', async () => {
    const { svc } = service({ days, pauses: [{ startDate: '2026-09-27', endDate: '2026-10-03' }] });
    expect((await svc.trainingDayFor('u1', '2026-09-28', 0)).isTrainingDay).toBe(false);
  });
});
