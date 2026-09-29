import { describe, expect, it } from 'vitest';
import {
  adjustedProteinWeightKg,
  applyTrainingDayBonus,
  buildTrainingDayNutrition,
  goalWording,
  hasTrainingDayBump,
  isLifter,
  lifterProteinGPerKg,
  lifterProteinNote,
  postWorkoutProteinG,
  resolveTrainingDay,
  trainingDayBonus,
  trainingDayLine,
  trainingWeekdays,
  withLifterProtein,
  withLifterProteinDetailed,
} from './training-nutrition';

// Audit P2-4: training-aware nutrition, deterministic.

const BASE = { dailyCalorieTarget: 2980, proteinG: 176, carbsG: 346, fatG: 83 };

describe('isLifter', () => {
  it('needs a gym profile, a goal with a g/kg rule and a bodyweight', () => {
    expect(isLifter({ goal: 'GAIN_MUSCLE', hasGymProfile: true, bodyweightKg: 80 })).toBe(true);
    expect(isLifter({ goal: 'LOSE_WEIGHT', hasGymProfile: true, bodyweightKg: 80 })).toBe(true);
    expect(isLifter({ goal: 'MAINTAIN', hasGymProfile: true, bodyweightKg: 80 })).toBe(true);
    expect(isLifter({ goal: 'EAT_HEALTHIER', hasGymProfile: true, bodyweightKg: 80 })).toBe(true);
    expect(isLifter({ goal: null, hasGymProfile: true, bodyweightKg: 80 })).toBe(false);
    expect(isLifter({ goal: 'SOMETHING_ELSE', hasGymProfile: true, bodyweightKg: 80 })).toBe(false);
    expect(isLifter({ goal: 'GAIN_MUSCLE', hasGymProfile: false, bodyweightKg: 80 })).toBe(false);
    expect(isLifter({ goal: 'GAIN_MUSCLE', hasGymProfile: true, bodyweightKg: null })).toBe(false);
    expect(isLifter({ goal: 'GAIN_MUSCLE', hasGymProfile: true, bodyweightKg: 0 })).toBe(false);
  });
});

describe('withLifterProtein', () => {
  it('sets protein to 1.8 g/kg and moves the difference to carbs (kcal unchanged)', () => {
    const t = withLifterProtein(BASE, 80);
    expect(t.proteinG).toBe(144);
    expect(t.carbsG).toBe(346 + 32);
    expect(t.fatG).toBe(83);
    expect(t.dailyCalorieTarget).toBe(2980);
    expect(t.proteinG * 4 + t.carbsG * 4).toBe(BASE.proteinG * 4 + BASE.carbsG * 4);
  });

  it('raises protein when the split was below 1.8 g/kg, never pushing carbs negative', () => {
    const t = withLifterProtein(
      { dailyCalorieTarget: 1500, proteinG: 100, carbsG: 10, fatG: 40 },
      90,
    );
    expect(t.proteinG).toBe(162);
    expect(t.carbsG).toBe(0);
  });
});

describe('lifter protein by goal', () => {
  it('GAIN 1.8, LOSE 2.0, MAINTAIN / EAT_HEALTHIER 1.6 g/kg; unknown goals none', () => {
    expect(lifterProteinGPerKg('GAIN_MUSCLE')).toBe(1.8);
    expect(lifterProteinGPerKg('LOSE_WEIGHT')).toBe(2.0);
    expect(lifterProteinGPerKg('MAINTAIN')).toBe(1.6);
    expect(lifterProteinGPerKg('EAT_HEALTHIER')).toBe(1.6);
    expect(lifterProteinGPerKg(null)).toBeNull();
    expect(lifterProteinGPerKg('BULK')).toBeNull();
  });

  it('a cutting lifter gets 2.0 g/kg with calories unchanged (carbs absorb it)', () => {
    const cut = { dailyCalorieTarget: 2100, proteinG: 176, carbsG: 184, fatG: 70 };
    const t = withLifterProtein(cut, 80, 'LOSE_WEIGHT');
    expect(t.proteinG).toBe(160);
    expect(t.carbsG).toBe(184 + 16);
    expect(t.fatG).toBe(70);
    expect(t.dailyCalorieTarget).toBe(2100);
    expect(t.proteinG * 4 + t.carbsG * 4).toBe(cut.proteinG * 4 + cut.carbsG * 4);
  });

  it('a maintaining lifter gets 1.6 g/kg, taken from carbs', () => {
    const maintain = { dailyCalorieTarget: 2600, proteinG: 163, carbsG: 293, fatG: 87 };
    const t = withLifterProtein(maintain, 80, 'MAINTAIN');
    expect(t.proteinG).toBe(128);
    expect(t.carbsG).toBe(293 + 35);
    expect(t.proteinG * 4 + t.carbsG * 4).toBe(maintain.proteinG * 4 + maintain.carbsG * 4);
  });

  it('only GAIN_MUSCLE lifters get the training-day bump', () => {
    expect(hasTrainingDayBump('GAIN_MUSCLE')).toBe(true);
    expect(hasTrainingDayBump('LOSE_WEIGHT')).toBe(false);
    expect(hasTrainingDayBump('MAINTAIN')).toBe(false);
    expect(hasTrainingDayBump(null)).toBe(false);
  });

  // T-35.2 (rev 2): RECOMP and PERFORMANCE join the lifter g/kg table.
  it('RECOMP gets 2.0 g/kg (like a cut), PERFORMANCE gets 1.8 g/kg (like a gain)', () => {
    expect(lifterProteinGPerKg('RECOMP')).toBe(2.0);
    expect(lifterProteinGPerKg('PERFORMANCE')).toBe(1.8);
  });

  it('neither RECOMP nor PERFORMANCE gets the GAIN_MUSCLE-only training-day bump', () => {
    expect(hasTrainingDayBump('RECOMP')).toBe(false);
    expect(hasTrainingDayBump('PERFORMANCE')).toBe(false);
  });
});

describe('adjustedProteinWeightKg (§2.11, T-11.4 — BMI >= 30 adjusted weight)', () => {
  it('uses the actual weight unchanged below a BMI of 30', () => {
    // 80kg @ 180cm -> BMI ~24.7
    expect(adjustedProteinWeightKg(80, 180)).toEqual({ weightKg: 80, adjusted: false });
  });

  it('caps the weight at a BMI-30 equivalent at or above the threshold', () => {
    // 120kg @ 170cm -> BMI ~41.5, well above 30. Cap = 30 * 1.7^2 = 86.7kg
    const result = adjustedProteinWeightKg(120, 170);
    expect(result.adjusted).toBe(true);
    expect(result.weightKg).toBeCloseTo(86.7, 1);
    expect(result.weightKg).toBeLessThan(120);
  });

  it('is a no-op when height is unknown', () => {
    expect(adjustedProteinWeightKg(120, null)).toEqual({ weightKg: 120, adjusted: false });
  });
});

describe('withLifterProteinDetailed', () => {
  it('reports usedAdjustedWeight and uses the capped weight for the protein math', () => {
    const cut = { dailyCalorieTarget: 2100, proteinG: 176, carbsG: 184, fatG: 70 };
    const { targets, usedAdjustedWeight } = withLifterProteinDetailed(cut, 120, 'LOSE_WEIGHT', 170);
    expect(usedAdjustedWeight).toBe(true);
    // 2.0 g/kg * 86.7kg (rounded from adjustedProteinWeightKg) ~= 173g, not 240g (2.0*120)
    expect(targets.proteinG).toBeLessThan(180);
    expect(targets.proteinG).toBeGreaterThan(160);
  });

  it('matches withLifterProtein when no height is given (backward compatible)', () => {
    const t = withLifterProtein(BASE, 80);
    const detailed = withLifterProteinDetailed(BASE, 80);
    expect(detailed.targets).toEqual(t);
    expect(detailed.usedAdjustedWeight).toBe(false);
  });
});

describe('goalWording', () => {
  it('gives a sentence fragment for every goal, including RECOMP/PERFORMANCE', () => {
    expect(goalWording('LOSE_WEIGHT')).toBe('losing weight');
    expect(goalWording('RECOMP')).toContain('recomposition');
    expect(goalWording('PERFORMANCE')).toBe('training performance');
  });

  it('falls back to a neutral phrase for an unknown or missing goal', () => {
    expect(goalWording(null)).toBe('your nutrition goal');
    expect(goalWording('SOMETHING_ELSE')).toBe('your nutrition goal');
  });
});

describe('trainingDayBonus', () => {
  it('adds 10% kcal (rounded to 10) and 0.4 g/kg protein; the rest goes to carbs', () => {
    expect(trainingDayBonus(2500, 80)).toEqual({
      kcalBonus: 250,
      proteinBonus: 32,
      carbsBonus: 31,
    });
  });

  it('keeps the kcal bump within 150–300', () => {
    expect(trainingDayBonus(1200, 55).kcalBonus).toBe(150);
    expect(trainingDayBonus(3600, 100).kcalBonus).toBe(300);
  });

  it('never gives negative carbs when protein covers the whole bump', () => {
    expect(trainingDayBonus(1200, 140).carbsBonus).toBe(0);
  });

  it('applies on top of the base, fat untouched', () => {
    const base = { dailyCalorieTarget: 2500, proteinG: 144, carbsG: 300, fatG: 70 };
    expect(applyTrainingDayBonus(base, trainingDayBonus(2500, 80))).toEqual({
      dailyCalorieTarget: 2750,
      proteinG: 176,
      carbsG: 331,
      fatG: 70,
    });
  });
});

describe('resolveTrainingDay', () => {
  const scheduled = [
    { plannedWeekday: 0, name: 'Full Body A' },
    { plannedWeekday: 2, name: 'Full Body B' },
  ];

  it('a scheduled weekday is a training day', () => {
    expect(
      resolveTrainingDay({
        localDate: '2026-09-28',
        weekday: 0,
        scheduled,
        completed: [],
        paused: false,
      }),
    ).toEqual({
      isTrainingDay: true,
      reason: 'SCHEDULED',
      workoutName: 'Full Body A',
      kind: 'lift',
    });
  });

  it('a completed workout wins, even off-schedule', () => {
    expect(
      resolveTrainingDay({
        localDate: '2026-09-29',
        weekday: 1,
        scheduled,
        completed: [{ localDate: '2026-09-29', name: 'Freestyle' }],
        paused: false,
      }),
    ).toEqual({ isTrainingDay: true, reason: 'COMPLETED', workoutName: 'Freestyle', kind: 'lift' });
  });

  it('a pause cancels the schedule but not a completed workout', () => {
    expect(
      resolveTrainingDay({
        localDate: '2026-09-28',
        weekday: 0,
        scheduled,
        completed: [],
        paused: true,
      }).isTrainingDay,
    ).toBe(false);
    expect(
      resolveTrainingDay({
        localDate: '2026-09-28',
        weekday: 0,
        scheduled,
        completed: [{ localDate: '2026-09-28', name: 'Full Body A' }],
        paused: true,
      }).reason,
    ).toBe('COMPLETED');
  });

  it('a rest day is not a training day', () => {
    expect(
      resolveTrainingDay({
        localDate: '2026-09-30',
        weekday: 3,
        scheduled,
        completed: [],
        paused: false,
      }),
    ).toEqual({ isTrainingDay: false, reason: null, workoutName: null, kind: null });
  });
});

describe('buildTrainingDayNutrition', () => {
  const base = { dailyCalorieTarget: 2500, proteinG: 144, carbsG: 300, fatG: 70 };
  const day = { isTrainingDay: true, reason: 'SCHEDULED' as const, workoutName: 'Full Body A' };

  it('premium: applied, with adjusted targets', () => {
    const r = buildTrainingDayNutrition({ base, bodyweightKg: 80, day, premium: true });
    expect(r.trainingDay).toMatchObject({ applied: true, kcalBonus: 250, proteinBonus: 32 });
    expect(r.adjustedTargets?.dailyCalorieTarget).toBe(2750);
  });

  it('free: the same numbers as a locked preview, targets unchanged', () => {
    const r = buildTrainingDayNutrition({ base, bodyweightKg: 80, day, premium: false });
    expect(r.trainingDay).toMatchObject({ applied: false, kcalBonus: 250, proteinBonus: 32 });
    expect(r.adjustedTargets).toBeNull();
  });

  it('rest day: zero bonuses, nothing applied', () => {
    const r = buildTrainingDayNutrition({
      base,
      bodyweightKg: 80,
      day: { isTrainingDay: false, reason: null, workoutName: null },
      premium: true,
    });
    expect(r.trainingDay).toMatchObject({ applied: false, kcalBonus: 0, proteinBonus: 0 });
    expect(r.adjustedTargets).toBeNull();
  });

  it('carries the g/kg basis for the "why" copy', () => {
    const r = buildTrainingDayNutrition({ base, bodyweightKg: 80.26, day, premium: true });
    expect(r.trainingDay.basis).toEqual({
      bodyweightKg: 80.3,
      proteinGPerKg: 1.8,
      trainingDayProteinGPerKg: 2.2,
    });
  });
});

describe('copy + nudges', () => {
  it('formats the training-day line', () => {
    expect(trainingDayLine({ kcalBonus: 250, proteinBonus: 30 })).toBe(
      'Training day · +250 kcal, +30 g protein',
    );
  });

  it('explains lifter protein under the preferences preview', () => {
    expect(lifterProteinNote(1.8)).toBe(
      'Protein set from your bodyweight (1.8 g/kg) because you train.',
    );
    expect(lifterProteinNote(2)).toBe(
      'Protein set from your bodyweight (2.0 g/kg) because you train.',
    );
  });

  it('post-workout protein is ~0.4 g/kg, rounded to 5, within 20–45 g', () => {
    expect(postWorkoutProteinG(80)).toBe(30);
    expect(postWorkoutProteinG(90)).toBe(35);
    expect(postWorkoutProteinG(45)).toBe(20);
    expect(postWorkoutProteinG(150)).toBe(45);
    expect(postWorkoutProteinG(null)).toBe(30);
  });

  it('lists training weekdays once each, in week order', () => {
    expect(
      trainingWeekdays([
        { plannedWeekday: 4, name: 'B' },
        { plannedWeekday: 0, name: 'A' },
        { plannedWeekday: null, name: 'C' },
        { plannedWeekday: 0, name: 'A2' },
      ]),
    ).toEqual([
      { dayOfWeek: 0, label: 'Mon', workoutName: 'A' },
      { dayOfWeek: 4, label: 'Fri', workoutName: 'B' },
    ]);
  });
});

// ─── UX-06: weekday kinds (T-06.10) ─────────────────────────────────────────────

describe('hasTrainingDayBump — kinds and the widened gate (Q-3)', () => {
  it('unwidened (default): GAIN_MUSCLE lift days only — today', () => {
    expect(hasTrainingDayBump('GAIN_MUSCLE')).toBe(true);
    expect(hasTrainingDayBump('GAIN_MUSCLE', 'lift', false)).toBe(true);
    expect(hasTrainingDayBump('RECOMP', 'lift', false)).toBe(false);
    expect(hasTrainingDayBump('PERFORMANCE', 'lift', false)).toBe(false);
    expect(hasTrainingDayBump('GAIN_MUSCLE', 'run', false)).toBe(false);
    expect(hasTrainingDayBump('PERFORMANCE', 'long_run', false)).toBe(false);
  });

  it('widened: lift for GAIN_MUSCLE / RECOMP / PERFORMANCE, runs for every goal but LOSE_WEIGHT', () => {
    for (const goal of ['GAIN_MUSCLE', 'RECOMP', 'PERFORMANCE']) {
      expect(hasTrainingDayBump(goal, 'lift', true)).toBe(true);
    }
    expect(hasTrainingDayBump('MAINTAIN', 'lift', true)).toBe(false);
    expect(hasTrainingDayBump('LOSE_WEIGHT', 'lift', true)).toBe(false);
    for (const goal of ['GAIN_MUSCLE', 'MAINTAIN', 'EAT_HEALTHIER', 'RECOMP', 'PERFORMANCE']) {
      expect(hasTrainingDayBump(goal, 'run', true)).toBe(true);
      expect(hasTrainingDayBump(goal, 'long_run', true)).toBe(true);
    }
    expect(hasTrainingDayBump('LOSE_WEIGHT', 'run', true)).toBe(false);
    expect(hasTrainingDayBump('LOSE_WEIGHT', 'long_run', true)).toBe(false);
  });

  it('rest and no goal never bump', () => {
    expect(hasTrainingDayBump('GAIN_MUSCLE', 'rest', true)).toBe(false);
    expect(hasTrainingDayBump(null, 'run', true)).toBe(false);
  });
});

describe('trainingDayBonus by kind', () => {
  it('lift is unchanged (protein-led)', () => {
    expect(trainingDayBonus(2980, 80)).toEqual(trainingDayBonus(2980, 80, 'lift'));
    expect(trainingDayBonus(2980, 80, 'lift').proteinBonus).toBe(32);
  });

  it('run and long run are carb-led: kcal only, no protein, all to carbs', () => {
    const run = trainingDayBonus(2500, 70, 'run');
    const long = trainingDayBonus(2500, 70, 'long_run');
    expect(run.proteinBonus).toBe(0);
    expect(long.proteinBonus).toBe(0);
    expect(run.carbsBonus).toBe(Math.round(run.kcalBonus / 4));
    expect(long.kcalBonus).toBeGreaterThan(run.kcalBonus);
  });

  it('clamps: a tiny base still gets the minimum, a huge one the cap', () => {
    expect(trainingDayBonus(1200, 60, 'long_run').kcalBonus).toBe(200);
    expect(trainingDayBonus(6000, 60, 'long_run').kcalBonus).toBe(450);
    expect(trainingDayBonus(1200, 60, 'run').kcalBonus).toBe(100);
    expect(trainingDayBonus(6000, 60, 'run').kcalBonus).toBe(250);
  });

  it('rest is zero', () => {
    expect(trainingDayBonus(2500, 70, 'rest')).toEqual({
      kcalBonus: 0,
      proteinBonus: 0,
      carbsBonus: 0,
    });
  });
});

describe('resolveTrainingDay — kinds', () => {
  const input = {
    localDate: '2026-10-03',
    weekday: 5,
    scheduled: [{ plannedWeekday: 0, name: 'Upper A' }],
    completed: [],
    paused: false,
  };

  it('a stored long run on a non-lift weekday is a run day', () => {
    expect(resolveTrainingDay({ ...input, kinds: { '5': 'long_run' } })).toEqual({
      isTrainingDay: true,
      reason: 'SCHEDULED',
      workoutName: null,
      kind: 'long_run',
    });
  });

  it('a pause cancels run kinds too; rest kinds and unset weekdays stay rest', () => {
    expect(
      resolveTrainingDay({ ...input, paused: true, kinds: { '5': 'run' } }).isTrainingDay,
    ).toBe(false);
    expect(resolveTrainingDay({ ...input, kinds: { '5': 'rest' } }).isTrainingDay).toBe(false);
    expect(resolveTrainingDay(input).kind).toBeNull();
  });

  it('a completed workout is a lift even on a run weekday', () => {
    const r = resolveTrainingDay({
      ...input,
      completed: [{ localDate: '2026-10-03', name: 'Freestyle' }],
      kinds: { '5': 'long_run' },
    });
    expect(r).toMatchObject({ reason: 'COMPLETED', kind: 'lift' });
  });
});

describe('trainingDayLine — kinds', () => {
  it('lift keeps the protein-led line; runs read "mostly carbs"', () => {
    expect(trainingDayLine({ kcalBonus: 300, proteinBonus: 32 })).toBe(
      'Training day · +300 kcal, +32 g protein',
    );
    expect(trainingDayLine({ kcalBonus: 350, proteinBonus: 0, kind: 'long_run' })).toBe(
      'Long run day · +350 kcal, mostly carbs',
    );
    expect(trainingDayLine({ kcalBonus: 150, proteinBonus: 0, kind: 'run' })).toBe(
      'Run day · +150 kcal, mostly carbs',
    );
  });
});
