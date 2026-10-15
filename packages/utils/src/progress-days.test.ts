import { describe, expect, it } from 'vitest';
import {
  bucketDays,
  evenLabelIndices,
  isLoggedDay,
  STATS_RANGES,
  statsBucketDays,
} from './progress-days';

describe('isLoggedDay (UX-FOOD-20)', () => {
  it('needs a log with something in it', () => {
    expect(isLoggedDay({ hasLog: true, totalKcal: 1800 })).toBe(true);
    expect(isLoggedDay({ hasLog: false, totalKcal: 0 })).toBe(false);
    // An emptied day keeps its log row.
    expect(isLoggedDay({ hasLog: true, totalKcal: 0 })).toBe(false);
  });
});

describe('evenLabelIndices', () => {
  it('spaces labels evenly and keeps both ends', () => {
    expect(evenLabelIndices(28)).toEqual([0, 7, 14, 20, 27]);
    expect(evenLabelIndices(7, 4)).toEqual([0, 2, 4, 6]);
  });
  it('never repeats an index on a short series', () => {
    expect(evenLabelIndices(3)).toEqual([0, 1, 2]);
    expect(evenLabelIndices(1)).toEqual([0]);
    expect(evenLabelIndices(0)).toEqual([]);
  });
});

describe('Stats ranges (1W / 1M / 3M / 1Y)', () => {
  const day = (date: string, kcal: number) => ({
    date,
    totalKcal: kcal,
    totalProtein: kcal / 20,
    totalCarbs: 0,
    totalFat: 0,
    hasLog: kcal > 0,
  });

  it('charts daily up to a month, weekly beyond', () => {
    expect(STATS_RANGES.map(statsBucketDays)).toEqual([1, 1, 7, 7]);
  });

  it('buckets back from today and averages logged days only', () => {
    const days = [
      day('2026-10-01', 1000), // the short oldest bucket
      day('2026-10-02', 2000),
      day('2026-10-03', 0),
      day('2026-10-04', 0),
      day('2026-10-05', 0),
      day('2026-10-06', 0),
      day('2026-10-07', 0),
      day('2026-10-08', 2400),
      day('2026-10-09', 0),
    ];
    const buckets = bucketDays(days, 7);
    expect(buckets.map((b) => [b.date, b.endDate, b.loggedDays])).toEqual([
      ['2026-10-01', '2026-10-02', 2],
      ['2026-10-03', '2026-10-09', 1],
    ]);
    expect(buckets[0]?.totalKcal).toBe(1500);
    expect(buckets[1]).toMatchObject({ totalKcal: 2400, totalProtein: 120, hasLog: true });
  });

  it('a bucket with nothing logged is empty, not zero-logged', () => {
    const [only] = bucketDays([day('2026-10-01', 0), day('2026-10-02', 0)], 7);
    expect(only).toMatchObject({ hasLog: false, loggedDays: 0, totalKcal: 0 });
  });

  it('size 1 is the days themselves', () => {
    const days = [day('2026-10-01', 1800), day('2026-10-02', 0)];
    expect(bucketDays(days, 1).map((b) => b.totalKcal)).toEqual([1800, 0]);
  });
});
