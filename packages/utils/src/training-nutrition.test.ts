import { describe, expect, it } from 'vitest';
import {
  applyTrainingDayBonus,
  buildTrainingDayNutrition,
  hasTrainingDayBump,
  isLifter,
  lifterProteinGPerKg,
  postWorkoutProteinG,
  resolveTrainingDay,
  trainingDayBonus,
  trainingDayLine,
  trainingWeekdays,
  withLifterProtein,
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
    ).toEqual({ isTrainingDay: true, reason: 'SCHEDULED', workoutName: 'Full Body A' });
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
    ).toEqual({ isTrainingDay: true, reason: 'COMPLETED', workoutName: 'Freestyle' });
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
    ).toEqual({ isTrainingDay: false, reason: null, workoutName: null });
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
