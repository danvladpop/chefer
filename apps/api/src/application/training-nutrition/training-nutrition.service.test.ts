import { describe, expect, it, vi } from 'vitest';
import { computeMacroTargets } from '../preferences/preferences.service.js';
import { TrainingNutritionService } from './training-nutrition.service.js';

// Audit P2-4: the gym facts the food side reads. Repositories are faked —
// no database.

function service(opts: {
  setupCompletedAt?: Date | null;
  latestWeightKg?: number | null;
  days?: { plannedWeekday: number | null; name: string }[];
  completed?: {
    localDate: string;
    name: string;
    routineDayId?: string | null;
    exercises?: { exerciseId: string; sets?: { caloriesKcal?: number | null }[] }[];
  }[];
  pauses?: { startDate: string; endDate: string }[];
  kinds?: Record<string, 'lift' | 'run' | 'long_run' | 'rest'>;
  /** The `trainingBumpFree` flag (D-2 / Q-3): off unless a test opts in. */
  widened?: boolean;
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
  // The real repo returns routineDayId + exercises on every row (WP-20 reads
  // them to tell a quick-logged activity from a workout); a bare fixture is a
  // plain strength session.
  const sessionRepo = {
    findCompleted: vi.fn().mockResolvedValue(
      (opts.completed ?? []).map((c) => ({
        routineDayId: null,
        exercises: [{ exerciseId: 'barbell-bench-press', sets: [] }],
        ...c,
      })),
    ),
  };
  const pauseRepo = { listForUser: vi.fn().mockResolvedValue(opts.pauses ?? []) };
  const kindsService = { getDayKinds: vi.fn().mockResolvedValue(opts.kinds ?? {}) };
  const svc = new TrainingNutritionService(
    gymProfileRepo,
    weightRepo,
    routineRepo,
    sessionRepo,
    pauseRepo,
    kindsService,
    () => Promise.resolve(opts.widened === true),
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
      kind: 'lift',
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

// ─── UX-06: kinds, the D-2 gate and the widened Q-3 gate ───────────────────────

describe('TrainingNutritionService.trainingDayFor — kinds', () => {
  it('a user-set run kind on a non-lift weekday makes a run day', async () => {
    const { svc } = service({
      days: [{ plannedWeekday: 0, name: 'A' }],
      kinds: { '5': 'long_run' },
    });
    expect(await svc.trainingDayFor('u1', '2026-10-03', 5)).toEqual({
      isTrainingDay: true,
      reason: 'SCHEDULED',
      workoutName: null,
      kind: 'long_run',
    });
  });

  it('a lift weekday stays a lift day even if a run kind was stored on it', async () => {
    const { svc } = service({ days: [{ plannedWeekday: 0, name: 'A' }], kinds: { '0': 'run' } });
    expect((await svc.trainingDayFor('u1', '2026-09-28', 0)).kind).toBe('lift');
  });
});

describe('TrainingNutritionService.targetsForDay — the bump gate (T-06.1, T-06.10)', () => {
  const RAW = {
    goal: 'GAIN_MUSCLE',
    biologicalSex: 'MALE',
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'MODERATELY_ACTIVE',
  };
  const profile = RAW as never;
  const lifter = { setupCompletedAt: new Date(), latestWeightKg: 80 };
  const days = [{ plannedWeekday: 0, name: 'Upper A' }];
  const monday = { localDate: '2026-09-28', weekday: 0 };

  it('free without the flag: the bump is previewed, not applied (today)', async () => {
    const { svc } = service({ ...lifter, days });
    const { training } = await svc.targetsForDay('u1', profile, monday, false);
    expect(training?.trainingDay.isTrainingDay).toBe(true);
    expect(training?.trainingDay.applied).toBe(false);
    expect(training?.adjustedTargets).toBeNull();
  });

  it('free with trainingBumpFree on: applied targets, kind lift', async () => {
    const { svc } = service({ ...lifter, days, widened: true });
    const { targets, training } = await svc.targetsForDay('u1', profile, monday, false);
    expect(training?.trainingDay.applied).toBe(true);
    expect(training?.trainingDay.kind).toBe('lift');
    expect(training?.adjustedTargets?.dailyCalorieTarget).toBeGreaterThan(
      targets.dailyCalorieTarget,
    );
  });

  it('premium: applied without the flag', async () => {
    const { svc } = service({ ...lifter, days });
    const { training } = await svc.targetsForDay('u1', profile, monday, true);
    expect(training?.trainingDay.applied).toBe(true);
  });

  it('Q-3 (owner, 2026-09-30): a long run never moves the targets, even with the flag on', async () => {
    const { svc } = service({ ...lifter, days, kinds: { '5': 'long_run' }, widened: true });
    const { targets, training } = await svc.targetsForDay(
      'u1',
      profile,
      { localDate: '2026-10-03', weekday: 5 },
      false,
    );
    expect(training?.trainingDay.isTrainingDay).toBe(false);
    expect(training?.adjustedTargets?.dailyCalorieTarget ?? targets.dailyCalorieTarget).toBe(
      targets.dailyCalorieTarget,
    );
  });

  it('run kinds do nothing while the widened gate is off (today)', async () => {
    const { svc } = service({ ...lifter, days, kinds: { '5': 'long_run' } });
    const { training } = await svc.targetsForDay(
      'u1',
      profile,
      { localDate: '2026-10-03', weekday: 5 },
      true,
    );
    expect(training?.trainingDay.isTrainingDay).toBe(false);
  });

  it('LOSE_WEIGHT never gets a run bump even widened (a cut is not eaten back)', async () => {
    const { svc } = service({ ...lifter, days, kinds: { '5': 'run' }, widened: true });
    const { training } = await svc.targetsForDay(
      'u1',
      { ...RAW, goal: 'LOSE_WEIGHT' } as never,
      { localDate: '2026-10-03', weekday: 5 },
      true,
    );
    expect(training).toBeNull();
  });

  it('Q-3: a runner with no gym profile gets no run bump, even with the flag on', async () => {
    const { svc } = service({ kinds: { '5': 'run' }, widened: true });
    const { training } = await svc.targetsForDay(
      'u1',
      { ...RAW, goal: 'PERFORMANCE' } as never,
      { localDate: '2026-10-03', weekday: 5 },
      false,
    );
    expect(training?.trainingDay.applied ?? false).toBe(false);
    expect(training?.trainingDay.kcalBonus ?? 0).toBe(0);
  });
});

describe('TrainingNutritionService.trainingWeek (T-06.2)', () => {
  const RAW = {
    goal: 'GAIN_MUSCLE',
    biologicalSex: 'MALE',
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'MODERATELY_ACTIVE',
  };
  const profile = RAW as never;
  const monday = new Date(2026, 8, 28); // Mon 28 Sep 2026, local midnight

  it('marks exactly the routine weekdays, with kinds and the bump for a premium lifter', async () => {
    const { svc } = service({
      setupCompletedAt: new Date(),
      latestWeightKg: 80,
      days: [
        { plannedWeekday: 0, name: 'Upper A' },
        { plannedWeekday: 2, name: 'Lower' },
        { plannedWeekday: 4, name: 'Upper B' },
      ],
      completed: [{ localDate: '2026-09-28', name: 'Upper A' }],
    });
    const { trainingDays, basis } = await svc.trainingWeek('u1', profile, monday, true);
    expect(trainingDays.map((d) => d.dayOfWeek)).toEqual([0, 2, 4]);
    expect(trainingDays.every((d) => d.kind === 'lift' && d.applied)).toBe(true);
    expect(trainingDays[0]?.done).toBe(true);
    expect(trainingDays[1]?.done).toBe(false);
    expect(trainingDays[0]?.workoutName).toBe('Upper A');
    expect(trainingDays[0]?.targetKcal).toBeGreaterThan(basis?.restKcal ?? 0);
    expect(basis?.proteinGPerKg).toBe(1.8);
  });

  it('a goal without the bump keeps the markers but shows no kcal (non-goal user)', async () => {
    const { svc } = service({
      setupCompletedAt: new Date(),
      latestWeightKg: 80,
      days: [{ plannedWeekday: 1, name: 'Full body' }],
    });
    const { trainingDays } = await svc.trainingWeek(
      'u1',
      { ...RAW, goal: 'MAINTAIN' } as never,
      monday,
      true,
    );
    expect(trainingDays).toHaveLength(1);
    expect(trainingDays[0]).toMatchObject({ kcalBonus: 0, proteinBonus: 0, applied: false });
  });

  it('a Saturday long run reports its kind and the Friday snack idea, no bonus (flag on)', async () => {
    const { svc } = service({ kinds: { '5': 'long_run' }, widened: true });
    const { trainingDays } = await svc.trainingWeek(
      'u1',
      { ...RAW, goal: 'PERFORMANCE' } as never,
      monday,
      false,
    );
    expect(trainingDays).toHaveLength(1);
    // Q-3: a marker only — no bonus.
    expect(trainingDays[0]).toMatchObject({ dayOfWeek: 5, kind: 'long_run', kcalBonus: 0 });
    expect(trainingDays[0]?.preRunSnack).toBeTruthy();
  });

  it('no schedule, no training days', async () => {
    const { svc } = service({});
    expect((await svc.trainingWeek('u1', profile, monday, true)).trainingDays).toEqual([]);
  });
});

describe('TrainingNutritionService.refuelSnacks (T-06.3, AC4)', () => {
  const none = { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] };
  const { svc } = service({});

  it('returns two snacks by default', () => {
    expect(svc.refuelSnacks(none)).toHaveLength(2);
  });

  it('a dairy allergy drops yogurt, cottage cheese and the shake', () => {
    const names = svc.refuelSnacks({ ...none, allergies: ['dairy'] }, 20).map((s) => s.id);
    expect(names).not.toContain('greek-yogurt');
    expect(names).not.toContain('cottage-cheese');
    expect(names).not.toContain('protein-shake');
    expect(names.length).toBeGreaterThan(0);
  });

  it('egg-free drops eggs; vegan keeps only plant snacks', () => {
    const eggFree = svc.refuelSnacks({ ...none, dietaryRestrictions: ['egg-free'] }, 20);
    expect(eggFree.map((s) => s.id)).not.toContain('boiled-eggs');
    const vegan = svc.refuelSnacks({ ...none, dietaryRestrictions: ['vegan'] }, 20);
    expect(vegan.length).toBeGreaterThan(0);
    for (const snack of vegan)
      expect(['edamame', 'hummus-pita', 'roasted-chickpeas']).toContain(snack.id);
  });

  it('a soy allergy drops edamame; a table can leave fewer than two', () => {
    const soy = svc.refuelSnacks({ ...none, allergies: ['soy'] }, 20).map((s) => s.id);
    expect(soy).not.toContain('edamame');
  });
});

// WP-20 (owner decision 2026-10-04): a quick-logged activity is RECORD ONLY — its
// kcal never raises the food target and the day is not a "training day".
describe('TrainingNutritionService — quick-logged activities are record only (WP-20)', () => {
  const RAW = {
    goal: 'GAIN_MUSCLE',
    biologicalSex: 'MALE',
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'MODERATELY_ACTIVE',
  };
  const profile = RAW as never;
  const lifter = { setupCompletedAt: new Date(), latestWeightKg: 80 };
  // Tuesday: no routine day is planned for it.
  const tuesday = { localDate: '2026-09-29', weekday: 1 };
  const days = [{ plannedWeekday: 0, name: 'Upper A' }];
  const activity = {
    localDate: '2026-09-29',
    name: 'Cycling class',
    routineDayId: null,
    exercises: [{ exerciseId: 'spin-class', sets: [{ caloriesKcal: 900 }] }],
  };

  it('an activity on a rest day does not make it a training day', async () => {
    const { svc } = service({ days, completed: [activity] });
    expect(await svc.trainingDayFor('u1', '2026-09-29', 1)).toEqual({
      isTrainingDay: false,
      reason: null,
      workoutName: null,
      kind: null,
    });
  });

  it('the targets are identical with or without the activity, however many kcal it carries', async () => {
    const without = service({ ...lifter, days, widened: true });
    const withActivity = service({ ...lifter, days, widened: true, completed: [activity] });
    const a = await without.svc.targetsForDay('u1', profile, tuesday, true);
    const b = await withActivity.svc.targetsForDay('u1', profile, tuesday, true);
    expect(b).toEqual(a);
    expect(b.training?.adjustedTargets ?? null).toBeNull();
    expect(b.training?.trainingDay.isTrainingDay ?? false).toBe(false);
  });

  it('a planned lift day stays a lift day, and a real workout the same day still counts', async () => {
    const planned = service({ days, completed: [{ ...activity, localDate: '2026-09-28' }] });
    expect((await planned.svc.trainingDayFor('u1', '2026-09-28', 0)).reason).toBe('SCHEDULED');
    const workout = service({
      days,
      completed: [activity, { localDate: '2026-09-29', name: 'Freestyle' }],
    });
    expect((await workout.svc.trainingDayFor('u1', '2026-09-29', 1)).reason).toBe('COMPLETED');
  });

  it('the plan week does not mark an activity day as a training day', async () => {
    const { svc } = service({ ...lifter, days, completed: [activity], widened: true });
    const { trainingDays } = await svc.trainingWeek('u1', profile, new Date(2026, 8, 28), true);
    expect(trainingDays.map((d) => d.dayOfWeek)).toEqual([0]);
  });
});
