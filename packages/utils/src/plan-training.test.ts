import { describe, expect, it } from 'vitest';
import {
  buildPlanTrainingDays,
  buildPremiumChanges,
  buildWeekGlance,
  joinDayNames,
  preRunNote,
  trainingChipA11y,
  trainingDayHeaderCopy,
  trainingDaysChip,
  trainingExplainCopy,
  trainingGlyph,
} from './plan-training';
import type { ResolvedTrainingDay } from './training-nutrition';

const BASE = { dailyCalorieTarget: 2500, proteinG: 144, carbsG: 300, fatG: 80 };
const rest: ResolvedTrainingDay = {
  isTrainingDay: false,
  reason: null,
  workoutName: null,
  kind: null,
};
const lift = (name = 'Upper A'): ResolvedTrainingDay => ({
  isTrainingDay: true,
  reason: 'SCHEDULED',
  workoutName: name,
  kind: 'lift',
});
const longRun: ResolvedTrainingDay = {
  isTrainingDay: true,
  reason: 'SCHEDULED',
  workoutName: null,
  kind: 'long_run',
};
const week = (over: Record<number, ResolvedTrainingDay>) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, resolved: over[dayOfWeek] ?? rest }));

const input = {
  base: BASE,
  bodyweightKg: 80,
  goal: 'GAIN_MUSCLE',
  widened: false,
  lifter: true,
  access: true,
};

describe('buildPlanTrainingDays', () => {
  it('marks exactly the training weekdays (AC1: Mon/Wed/Fri)', () => {
    const days = buildPlanTrainingDays({
      ...input,
      days: week({ 0: lift(), 2: lift(), 4: lift() }),
    });
    expect(days.map((d) => d.dayOfWeek)).toEqual([0, 2, 4]);
    expect(days.every((d) => d.kind === 'lift' && d.applied)).toBe(true);
    expect(days[0]?.dayName).toBe('Monday');
    expect(days[0]?.targetKcal).toBe(2500 + (days[0]?.kcalBonus ?? 0));
    expect(days[0]?.targetProteinG).toBe(144 + (days[0]?.proteinBonus ?? 0));
  });

  it('free without the flag: numbers are a preview and the target does not move', () => {
    const [d] = buildPlanTrainingDays({ ...input, access: false, days: week({ 0: lift() }) });
    expect(d).toMatchObject({ applied: false });
    expect(d?.kcalBonus).toBeGreaterThan(0);
    expect(d?.targetKcal).toBeUndefined();
  });

  it('a goal without the bump keeps the marker with zero kcal (non-goal user)', () => {
    const [d] = buildPlanTrainingDays({ ...input, goal: 'MAINTAIN', days: week({ 1: lift() }) });
    expect(d).toMatchObject({ kcalBonus: 0, proteinBonus: 0, applied: false });
  });

  it('AC0: a Saturday long run is a marker with the Friday snack idea — no target change (Q-3)', () => {
    const [d] = buildPlanTrainingDays({
      ...input,
      goal: 'PERFORMANCE',
      widened: true,
      lifter: false,
      days: week({ 5: longRun }),
    });
    expect(d).toMatchObject({ dayOfWeek: 5, kind: 'long_run', kcalBonus: 0, proteinBonus: 0 });
    expect(d?.preRunSnack).toBeTruthy();
  });

  it('a completed workout is done', () => {
    const [d] = buildPlanTrainingDays({
      ...input,
      days: week({ 0: { ...lift(), reason: 'COMPLETED' } }),
    });
    expect(d?.done).toBe(true);
  });
});

describe('buildWeekGlance (AC5: always seven days)', () => {
  it('seven columns with meals and the session status', () => {
    const training = buildPlanTrainingDays({
      ...input,
      days: week({ 0: { ...lift(), reason: 'COMPLETED' }, 2: lift('Lower') }),
    });
    const glance = buildWeekGlance({
      mealsByDay: new Map([
        [0, 3],
        [1, 4],
      ]),
      training,
    });
    expect(glance).toHaveLength(7);
    expect(glance[0]).toMatchObject({ dayOfWeek: 0, meals: 3, training: { status: 'done' } });
    expect(glance[1]).toEqual({ dayOfWeek: 1, meals: 4 });
    expect(glance[2]?.training).toMatchObject({ status: 'planned', workoutName: 'Lower' });
    expect(glance[6]).toEqual({ dayOfWeek: 6, meals: 0 });
  });
});

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('expected a training day');
  return v;
}

describe('copy', () => {
  const [lifted] = buildPlanTrainingDays({ ...input, days: week({ 2: lift('Upper A') }) });
  const [noNumbers] = buildPlanTrainingDays({
    ...input,
    goal: 'MAINTAIN',
    days: week({ 2: lift('Upper A') }),
  });
  const [runDay] = buildPlanTrainingDays({
    ...input,
    goal: 'PERFORMANCE',
    widened: true,
    days: week({ 5: longRun }),
  });

  it('the lift header shows title, target and bonus (spec wireframe)', () => {
    const h = trainingDayHeaderCopy(must(lifted));
    expect(h.title).toBe('Training day · Upper A');
    expect(h.targetLine).toMatch(/^Target today [\d,]+ kcal · \d+ g protein$/);
    expect(h.bonusLine).toMatch(/^\(\+\d+ kcal, \+\d+ g protein for training\)$/);
    expect(h.a11yLabel).toContain('Explains why.');
  });

  it('AC0: the long-run header names the day and never quotes kcal (Q-3)', () => {
    const h = trainingDayHeaderCopy(must(runDay));
    expect(h.title).toBe('Long run day · Saturday');
    expect(h.bonusLine).toBeNull();
    expect(JSON.stringify(h)).not.toMatch(/kcal/);
  });

  it('a non-goal user sees the title only — no kcal (T-06.4)', () => {
    const h = trainingDayHeaderCopy(must(noNumbers));
    expect(h.title).toBe('Training day · Upper A');
    expect(h.targetLine).toBeNull();
    expect(h.bonusLine).toBeNull();
    expect(JSON.stringify(h)).not.toMatch(/kcal/);
  });

  it('chip a11y and glyphs', () => {
    expect(trainingChipA11y('Wednesday', 'lift')).toBe('Wednesday, training day');
    expect(trainingChipA11y('Saturday', 'long_run')).toBe('Saturday, long run day');
    expect(trainingGlyph('lift')).toBe('barbell-outline');
    expect(trainingGlyph('run')).toBe('walk-outline');
    expect(trainingGlyph('long_run')).toBe('walk-outline');
  });

  it('week chip, day lists and the pre-run note', () => {
    expect(trainingDaysChip(3)).toBe('3 training days');
    expect(trainingDaysChip(1)).toBe('1 training day');
    expect(trainingDaysChip(0)).toBeNull();
    expect(joinDayNames(['Mon', 'Wed', 'Fri'])).toBe('Mon, Wed and Fri');
    expect(joinDayNames(['Mon', 'Fri'])).toBe('Mon and Fri');
    expect(preRunNote()).toMatch(/Long run tomorrow/);
  });

  it('the explain sheet quotes days, bonus, rest-day target and protein basis', () => {
    const days = buildPlanTrainingDays({
      ...input,
      days: week({ 0: lift(), 2: lift(), 4: lift() }),
    });
    const e = trainingExplainCopy({
      days,
      basis: { restKcal: 2500, restProteinG: 144, proteinGPerKg: 1.8, bodyweightKg: 80 },
    });
    expect(e.eyebrow).toBe('Why this target');
    expect(e.title).toBe('More food on training days');
    expect(e.sentence).toMatch(/^You train on Mon, Wed and Fri\. On those days Chefer adds about/);
    expect(e.rows.map((r) => r.label)).toEqual([
      'Rest-day target',
      'Training-day target',
      'Training bonus',
      'Protein basis (1.8 g per kg, because you train)',
    ]);
    expect(e.footnote).toBe('Change your training days in Gym settings.');
    expect(e.actionLabel).toBe('Change training days');
  });

  it('UX-FOOD-19: quotes the training-day target next to the rest-day one, only when applied', () => {
    const basis = { restKcal: 2500, restProteinG: 144, proteinGPerKg: 1.8, bodyweightKg: 80 };
    const applied = buildPlanTrainingDays({ ...input, days: week({ 0: lift() }) });
    const row = trainingExplainCopy({ days: applied, basis }).rows.find(
      (r) => r.label === 'Training-day target',
    );
    expect(row?.value).toMatch(/^2,\d{3} kcal · \d+ g protein$/);
    const preview = buildPlanTrainingDays({ ...input, access: false, days: week({ 0: lift() }) });
    expect(trainingExplainCopy({ days: preview, basis }).rows.map((r) => r.label)).not.toContain(
      'Training-day target',
    );
  });

  it('a free user without the flag is told what Premium adds, not that it was added', () => {
    const days = buildPlanTrainingDays({ ...input, access: false, days: week({ 0: lift() }) });
    const e = trainingExplainCopy({ days, basis: null });
    expect(e.sentence).toContain('Premium adds about');
    expect(e.sentence).not.toContain('Chefer adds');
  });

  it('run-only weeks never promise more food (Q-3)', () => {
    const days = buildPlanTrainingDays({
      ...input,
      goal: 'PERFORMANCE',
      widened: true,
      days: week({ 1: { ...longRun, kind: 'run' } }),
    });
    expect(trainingExplainCopy({ days, basis: null }).title).toBe('Your training days');
  });
});

describe('buildPremiumChanges (T-10.7)', () => {
  const trainingDays = buildPlanTrainingDays({
    ...input,
    goal: 'PERFORMANCE',
    widened: true,
    days: week({ 1: lift(), 5: longRun }),
  });
  const days = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, kcal: 2500 }));

  it('is kind-aware and states the target check honestly', () => {
    const r = buildPremiumChanges({
      days: days.map((d) => (d.dayOfWeek === 1 ? { ...d, kcal: 2000 } : d)),
      targetFor: (dow) => trainingDays.find((t) => t.dayOfWeek === dow)?.targetKcal ?? 2500,
      baseKcal: 2500,
      trainingDays,
      fitLift: true,
      leftovers: false,
      pinCount: 2,
      tolerance: 0.15,
    });
    expect(r.lines[0]).toBe('Built around your lift day (Tue)');
    // Q-3: run days never raise targets, so there is no run line.
    expect(r.lines.some((l) => l.includes('long run'))).toBe(false);
    expect(r.lines).toContain('2 of your favourites made it into the week');
    expect(r.lines[r.lines.length - 1]).toMatch(/^Meets your 2,500 kcal target on \d of 7 days$/);
    expect(r.targetHits + r.missDays).toBe(7);
    expect(r.misses.some((m) => m.dayOfWeek === 1 && m.deltaKcal < 0)).toBe(true);
  });

  it('without fit or run bumps only the check remains', () => {
    const r = buildPremiumChanges({
      days,
      targetFor: () => 2500,
      baseKcal: 2500,
      trainingDays: [],
      fitLift: false,
      leftovers: false,
      pinCount: 0,
      tolerance: 0.15,
    });
    expect(r.lines).toEqual(['Meets your 2,500 kcal target on 7 of 7 days']);
    expect(r.missDays).toBe(0);
  });
});
