import { describe, expect, it } from 'vitest';
import { containsForbiddenPhrase } from '@chefer/eslint-config/rules/no-forbidden-copy';
import {
  summarizeWeightTrend,
  TREND_DAILY_ALPHA,
  TREND_WEIGHT_EXPLAINER,
  trendChangeText,
  weightTrendSeries,
  type WeighIn,
} from './weight-trend';

const T0 = Date.UTC(2026, 7, 3, 8); // Mon 3 Aug 2026, 08:00 UTC
const DAY_MS = 86_400_000;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

function weighIns(byDay: [dayOffset: number, weightKg: number][]): WeighIn[] {
  return byDay.map(([day, weightKg]) => ({
    recordedAt: new Date(T0 + day * DAY_MS),
    weightKg,
  }));
}

function trendAt(points: readonly { trendKg: number }[], i: number): number {
  const point = points[i];
  if (!point) throw new Error(`no point ${i}`);
  return point.trendKg;
}

const series = (byDay: [number, number][]) =>
  weightTrendSeries(weighIns(byDay), { dayKey: utcDay });

describe('weightTrendSeries', () => {
  it('is empty without weigh-ins', () => {
    expect(weightTrendSeries([])).toEqual([]);
  });

  it('starts the trend at the first reading', () => {
    const [first] = series([[0, 80]]);
    expect(first).toMatchObject({ date: '2026-08-03', weightKg: 80, trendKg: 80, outlier: false });
  });

  it('moves the trend by α of the gap for a next-day weigh-in', () => {
    const points = series([
      [0, 80],
      [1, 81],
    ]);
    expect(points[1]?.trendKg).toBeCloseTo(80 + TREND_DAILY_ALPHA * 1, 3);
  });

  it('a weigh-in after a long gap pulls the trend most of the way (the old trend is stale)', () => {
    const daily = series([
      [0, 80],
      [1, 78],
    ]);
    const afterGap = series([
      [0, 80],
      [14, 78],
    ]);
    // 1 − 0.9^14 ≈ 0.77 of the way there, against 0.1 the next morning.
    expect(afterGap[1]?.trendKg).toBeCloseTo(80 - 2 * (1 - 0.9 ** 14), 3);
    expect(trendAt(afterGap, 1)).toBeLessThan(trendAt(daily, 1));
  });

  it('a gap of n days equals n daily steps at the same reading', () => {
    const gap = series([
      [0, 80],
      [3, 77],
    ]);
    const daily = series([
      [0, 80],
      [1, 77],
      [2, 77],
      [3, 77],
    ]);
    expect(gap[1]?.trendKg).toBeCloseTo(trendAt(daily, 3), 3);
  });

  it('averages several weigh-ins on one day into one point', () => {
    const points = weightTrendSeries(
      [
        { recordedAt: new Date(T0), weightKg: 80 },
        { recordedAt: new Date(T0 + 3_600_000), weightKg: 81 },
      ],
      { dayKey: utcDay },
    );
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ weightKg: 80.5, trendKg: 80.5 });
    expect(points[0]?.recordedAt.getTime()).toBe(T0);
  });

  it('sorts unsorted input', () => {
    const points = series([
      [6, 80],
      [0, 82],
      [3, 81],
    ]);
    expect(points.map((p) => p.date)).toEqual(['2026-08-03', '2026-08-06', '2026-08-09']);
  });

  it('marks a typo as an outlier and carries the trend past it (F-DASH-3-1)', () => {
    const points = series([
      [0, 80],
      [1, 80],
      [2, 180],
      [3, 80],
    ]);
    expect(points[2]).toMatchObject({ weightKg: 180, outlier: true, trendKg: 80 });
    expect(points[3]).toMatchObject({ outlier: false, trendKg: 80 });
  });

  it('keeps real multi-day change (3 kg over 4 days is plausible)', () => {
    const points = series([
      [0, 80],
      [4, 83],
    ]);
    expect(points[1]?.outlier).toBe(false);
    expect(trendAt(points, 1)).toBeGreaterThan(80);
  });

  it('a single salty-day spike barely moves the trend', () => {
    const points = series([
      [0, 80],
      [1, 80],
      [2, 81.5],
      [3, 80],
    ]);
    expect(trendAt(points, 2) - 80).toBeLessThan(0.2);
  });
});

describe('summarizeWeightTrend', () => {
  const flat = series([
    [0, 80],
    [3, 80],
    [6, 80],
    [9, 80],
    [12, 80],
  ]);

  it('reads a flat series as zero change', () => {
    expect(summarizeWeightTrend(flat, { windowDays: 28 })).toMatchObject({
      fromDate: '2026-08-03',
      toDate: '2026-08-15',
      changeKg: 0,
      kgPerWeek: 0,
      spanDays: 12,
      weighIns: 5,
    });
  });

  it('is null under the minimum weigh-ins or span', () => {
    expect(summarizeWeightTrend(flat, { windowDays: 28, minWeighIns: 6 })).toBeNull();
    expect(summarizeWeightTrend(flat, { windowDays: 28, minSpanDays: 13 })).toBeNull();
    expect(summarizeWeightTrend([], { windowDays: 28 })).toBeNull();
    expect(summarizeWeightTrend(series([[0, 80]]), { windowDays: 28 })).toBeNull();
  });

  it('a steady loss reads negative, with the rate from the trend ends', () => {
    // 0.1 kg a day for 8 weeks of daily weigh-ins: −0.7 kg a week raw.
    const losing = series(Array.from({ length: 57 }, (_, d) => [d, 85 - 0.1 * d]));
    const summary = summarizeWeightTrend(losing, { windowDays: 14 });
    if (!summary) throw new Error('expected a summary');
    expect(summary.fromDate).toBe('2026-09-14');
    expect(summary.changeKg).toBeCloseTo(summary.toTrendKg - summary.fromTrendKg, 3);
    // Points before the window warmed the trend up, so the window reads the
    // real rate instead of a lag-damped one.
    expect(summary.kgPerWeek).toBeCloseTo(-0.7, 1);
  });

  it('anchors the window on asOf and ignores later weigh-ins', () => {
    const points = series([
      [0, 80],
      [5, 80],
      [10, 79],
      [30, 70],
    ]);
    const summary = summarizeWeightTrend(points, { windowDays: 14, asOf: '2026-08-14' });
    expect(summary).toMatchObject({ fromDate: '2026-08-03', toDate: '2026-08-13', weighIns: 3 });
  });

  it('leaves outliers out of the count and the end points', () => {
    const points = series([
      [0, 80],
      [3, 80],
      [6, 200],
    ]);
    expect(summarizeWeightTrend(points, { windowDays: 28 })).toMatchObject({
      toDate: '2026-08-06',
      weighIns: 2,
    });
  });
});

describe('trendChangeText', () => {
  const summary = (changeKg: number) => ({
    fromDate: '2026-08-03',
    toDate: '2026-08-31',
    fromTrendKg: 80,
    toTrendKg: 80 + changeKg,
    changeKg,
    spanDays: 28,
    weighIns: 10,
    kgPerWeek: (changeKg / 28) * 7,
  });

  it('says the direction with a real minus sign, in the user’s unit', () => {
    expect(trendChangeText(summary(-0.62), 'METRIC', '1 month')).toBe('Trend −0.6 kg over 1 month');
    expect(trendChangeText(summary(1), 'IMPERIAL', '1 week')).toBe('Trend +2.2 lb over 1 week');
  });

  it('reads tiny moves as steady and no summary as nothing', () => {
    expect(trendChangeText(summary(0.04), 'METRIC', '1 month')).toBe('Trend steady over 1 month');
    expect(trendChangeText(null, 'METRIC', '1 month')).toBeNull();
  });

  it('the copy is clean of forbidden phrases', () => {
    expect(containsForbiddenPhrase(TREND_WEIGHT_EXPLAINER)).toBeNull();
    expect(
      containsForbiddenPhrase(trendChangeText(summary(-1), 'METRIC', '1 month') ?? ''),
    ).toBeNull();
  });
});
