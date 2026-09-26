import { describe, expect, it } from 'vitest';
import {
  buildTemplateReviewText,
  computeEwmaTrendKgPerWeek,
  computeReviewMetrics,
  decideAdjustmentKcal,
  type AdjustmentInput,
  type WeightPoint,
} from './review.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-08-03T08:00:00Z'); // a Monday morning

function points(weightsByDay: [dayOffset: number, weightKg: number][]): WeightPoint[] {
  return weightsByDay.map(([day, weightKg]) => ({
    recordedAt: new Date(T0.getTime() + day * DAY_MS),
    weightKg,
  }));
}

function dayLog(dayOffset: number, totalKcal: number, mealCount = 1) {
  return { date: new Date(T0.getTime() + dayOffset * DAY_MS), totalKcal, mealCount };
}

// ─── EWMA weight trend ────────────────────────────────────────────────────────

describe('computeEwmaTrendKgPerWeek', () => {
  it('returns null with fewer than 5 points', () => {
    expect(
      computeEwmaTrendKgPerWeek(
        points([
          [0, 80],
          [4, 79],
          [8, 78],
          [12, 77],
        ]),
      ),
    ).toBeNull();
  });

  it('returns null when 5+ points span fewer than 10 days', () => {
    expect(
      computeEwmaTrendKgPerWeek(
        points([
          [0, 80],
          [2, 80],
          [4, 80],
          [6, 80],
          [9, 80],
        ]),
      ),
    ).toBeNull();
  });

  it('ignores a typo weigh-in instead of letting it swing the trend (F-DASH-3-1)', () => {
    const clean = points([
      [0, 80],
      [3, 80],
      [6, 80],
      [9, 80],
      [12, 80],
    ]);
    const withTypo = [...clean, ...points([[7, 1000]]), ...points([[8, 8]])];
    expect(computeEwmaTrendKgPerWeek(withTypo)).toBe(0);
  });

  it('keeps real multi-day changes (3 kg over 4 days is plausible)', () => {
    const trend = computeEwmaTrendKgPerWeek(
      points([
        [0, 80],
        [4, 83],
        [8, 83],
        [10, 83],
        [12, 83],
      ]),
    );
    expect(trend).toBeGreaterThan(0);
  });

  it('reads a flat series as zero trend', () => {
    const trend = computeEwmaTrendKgPerWeek(
      points([
        [0, 80],
        [3, 80],
        [6, 80],
        [9, 80],
        [12, 80],
      ]),
    );
    expect(trend).toBe(0);
  });

  it('computes the smoothed weekly rate for a rising series (hand-checked)', () => {
    // α=0.25 over 80,81,82,83,84 → EWMA 81.949…; Δ=1.949… over 12 days.
    const trend = computeEwmaTrendKgPerWeek(
      points([
        [0, 80],
        [3, 81],
        [6, 82],
        [9, 83],
        [12, 84],
      ]),
    );
    expect(trend).toBeCloseTo(1.137, 3);
  });

  it('a steady decline reads negative and is damped by the smoothing', () => {
    const trend = computeEwmaTrendKgPerWeek(
      points([
        [0, 82],
        [3, 81.6],
        [6, 81.2],
        [9, 80.8],
        [12, 80.4],
      ]),
    );
    expect(trend).not.toBeNull();
    expect(trend!).toBeLessThan(0);
    expect(trend!).toBeGreaterThan(-0.94); // damped below the raw −0.93 kg/wk
  });

  it('sorts unsorted input before smoothing', () => {
    const unsorted = points([
      [12, 80],
      [0, 80],
      [6, 80],
      [3, 80],
      [9, 80],
    ]);
    expect(computeEwmaTrendKgPerWeek(unsorted)).toBe(0);
  });
});

// ─── Week metrics ─────────────────────────────────────────────────────────────

describe('computeReviewMetrics', () => {
  it('computes adherence as logged days over 7 and averages logged days only', () => {
    const metrics = computeReviewMetrics(
      [dayLog(0, 2000), dayLog(1, 2200), dayLog(2, 1800), dayLog(3, 0, 0), dayLog(4, 2000)],
      [],
    );
    // Day 3 has zero meals — 4 real logged days.
    expect(metrics.adherencePct).toBe(Math.round((4 / 7) * 100));
    expect(metrics.avgDailyKcal).toBe(2000);
    expect(metrics.weightTrendKg).toBeNull();
  });

  it('handles an empty week', () => {
    const metrics = computeReviewMetrics([], []);
    expect(metrics.adherencePct).toBe(0);
    expect(metrics.avgDailyKcal).toBe(0);
  });
});

// ─── Adjustment policy (table-driven) ─────────────────────────────────────────

describe('decideAdjustmentKcal', () => {
  const base: AdjustmentInput = {
    goal: 'LOSE_WEIGHT',
    adherencePct: 71,
    trendKgPerWeek: 0,
    prevTrendKgPerWeek: 0,
    currentTargetKcal: 2100,
    bmr: 1700,
    tdee: 2600,
  };

  const cases: { name: string; input: Partial<AdjustmentInput>; expected: number }[] = [
    {
      name: 'LOSE plateau for 2 consecutive reviews → −100',
      input: { trendKgPerWeek: -0.02, prevTrendKgPerWeek: 0.01 },
      expected: -100,
    },
    {
      name: 'LOSE plateau boundary (trend exactly −0.1 counts as plateau) → −100',
      input: { trendKgPerWeek: -0.1, prevTrendKgPerWeek: -0.1 },
      expected: -100,
    },
    {
      name: 'LOSE plateau this week only (no previous review) → wait, no change',
      input: { trendKgPerWeek: 0, prevTrendKgPerWeek: null },
      expected: 0,
    },
    {
      name: 'LOSE plateau this week but losing fine last review → no change',
      input: { trendKgPerWeek: 0, prevTrendKgPerWeek: -0.4 },
      expected: 0,
    },
    {
      name: 'LOSE losing at a healthy rate → no change',
      input: { trendKgPerWeek: -0.5, prevTrendKgPerWeek: -0.5 },
      expected: 0,
    },
    {
      name: 'LOSE floor clamps a partial step (only 70 kcal above BMR×1.1)',
      // floor = 1700×1.1 = 1870; target 1940 → headroom 70.
      input: { trendKgPerWeek: 0, prevTrendKgPerWeek: 0, currentTargetKcal: 1940 },
      expected: -70,
    },
    {
      name: 'LOSE already at the floor → no change even on a plateau',
      input: { trendKgPerWeek: 0, prevTrendKgPerWeek: 0, currentTargetKcal: 1870 },
      expected: 0,
    },
    {
      name: 'GAIN stalled (flat trend) → +100',
      input: { goal: 'GAIN_MUSCLE', trendKgPerWeek: 0, prevTrendKgPerWeek: null },
      expected: 100,
    },
    {
      name: 'GAIN stall boundary (trend exactly +0.05 counts as stalled) → +100',
      input: { goal: 'GAIN_MUSCLE', trendKgPerWeek: 0.05 },
      expected: 100,
    },
    {
      name: 'GAIN gaining fine → no change',
      input: { goal: 'GAIN_MUSCLE', trendKgPerWeek: 0.3 },
      expected: 0,
    },
    {
      name: 'GAIN ceiling clamps a partial step (50 kcal below TDEE+500)',
      // ceiling = 2600+500 = 3100; target 3050 → headroom 50.
      input: { goal: 'GAIN_MUSCLE', trendKgPerWeek: 0, currentTargetKcal: 3050 },
      expected: 50,
    },
    {
      name: 'GAIN already at the ceiling → no change',
      input: { goal: 'GAIN_MUSCLE', trendKgPerWeek: 0, currentTargetKcal: 3100 },
      expected: 0,
    },
    {
      name: 'low adherence (<50%) → coach the habit, never the numbers',
      input: { adherencePct: 43, trendKgPerWeek: 0, prevTrendKgPerWeek: 0 },
      expected: 0,
    },
    {
      name: 'no weight trend → no change',
      input: { trendKgPerWeek: null, prevTrendKgPerWeek: 0 },
      expected: 0,
    },
    {
      name: 'incomplete body metrics (no BMR/TDEE bounds) → no change',
      input: { trendKgPerWeek: 0, prevTrendKgPerWeek: 0, bmr: null, tdee: null },
      expected: 0,
    },
    {
      name: 'MAINTAIN goal → the dial never moves',
      input: { goal: 'MAINTAIN', trendKgPerWeek: 0, prevTrendKgPerWeek: 0 },
      expected: 0,
    },
    {
      name: 'EAT_HEALTHIER goal → the dial never moves',
      input: { goal: 'EAT_HEALTHIER', trendKgPerWeek: 0, prevTrendKgPerWeek: 0 },
      expected: 0,
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(decideAdjustmentKcal({ ...base, ...input })).toBe(expected);
  });
});

// ─── Template review text ─────────────────────────────────────────────────────

describe('buildTemplateReviewText', () => {
  const base = {
    adherencePct: 71,
    loggedDays: 5,
    avgDailyKcal: 2100,
    targetKcal: 2000,
    weightTrendKg: -0.3,
    adjustmentKcal: 0,
    goal: 'LOSE_WEIGHT',
    dishNames: [],
  };

  it('opens with a standalone summary line (the free-tier teaser)', () => {
    const first = buildTemplateReviewText(base).split('\n')[0]!;
    expect(first).toContain('5 of 7');
  });

  it('mentions the adjustment when the dial moved', () => {
    expect(buildTemplateReviewText({ ...base, adjustmentKcal: -100 })).toContain('-100 kcal');
  });

  it('coaches the habit instead of numbers at low adherence', () => {
    const text = buildTemplateReviewText({ ...base, adherencePct: 29, loggedDays: 2 });
    expect(text).toMatch(/logging habit/i);
  });

  it('never mentions BMR or algorithms (non-medical tone rule)', () => {
    const text = buildTemplateReviewText({ ...base, adjustmentKcal: 100, weightTrendKg: null });
    expect(text).not.toMatch(/BMR|TDEE|EWMA|algorithm/i);
  });
});
