// ─── Progress screen helpers (UX-FOOD-20), shared by web and mobile ───────────

/** The windows the Progress charts can show, in days (the API serves 7–90). */
export const PROGRESS_RANGES = [7, 28, 90] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number];
export const DEFAULT_PROGRESS_RANGE: ProgressRange = 28;

/**
 * A day that counts as "logged": it has a log AND something in it. A day whose
 * entries were all deleted keeps an empty log row (`hasLog` true, 0 kcal), and
 * used to be counted in "Days logged" and drawn as a 0 kcal point.
 */
export function isLoggedDay(day: { hasLog: boolean; totalKcal: number }): boolean {
  return day.hasLog && day.totalKcal > 0;
}

/**
 * Indices of about `wanted` evenly spaced x labels over `count` points,
 * always including the first and last. Spacing is even (no "21, 27" pair
 * squeezed at the end) and a short series never gets duplicates.
 */
export function evenLabelIndices(count: number, wanted = 5): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const n = Math.min(Math.max(2, wanted), count);
  const out = new Set<number>();
  for (let i = 0; i < n; i++) out.add(Math.round((i * (count - 1)) / (n - 1)));
  return [...out].sort((a, b) => a - b);
}

// ─── Stats ranges (1W / 1M / 3M / 1Y), shared by mobile Stats and web Progress ─

/** The Stats windows in days: 1W, 1M, 3M, 1Y (`tracker.monthlySummary` serves 7–365). */
export const STATS_RANGES = [7, 30, 90, 365] as const;
export type StatsRangeDays = (typeof STATS_RANGES)[number];
export const DEFAULT_STATS_RANGE: StatsRangeDays = 30;

/** What the range control shows. */
export const STATS_RANGE_LABELS: Record<StatsRangeDays, string> = {
  7: '1W',
  30: '1M',
  90: '3M',
  365: '1Y',
};

/** The range in prose: "−1.9 kg in 30 days", "in a year". */
export const STATS_RANGE_SPAN: Record<StatsRangeDays, string> = {
  7: '7 days',
  30: '30 days',
  90: '90 days',
  365: 'a year',
};

/**
 * Days per chart bar: one a day up to a month, then weekly averages (90 or
 * 365 daily bars are too thin to read on a phone).
 */
export function statsBucketDays(rangeDays: number): 1 | 7 {
  return rangeDays > 31 ? 7 : 1;
}

export type DayTotals = {
  date: string;
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  hasLog: boolean;
};

export type DayBucket = DayTotals & {
  /** Last day in the bucket (`date` is the first). */
  endDate: string;
  /** Logged days the averages are taken over. */
  loggedDays: number;
};

/**
 * `days` (oldest first) in buckets of `size`, counted back from the last day
 * so the newest bucket ends today; the oldest one may be shorter. Each
 * bucket's totals are the average of its LOGGED days (`isLoggedDay`), so a
 * week with three logged days reads as a normal day's intake, not 3/7 of one;
 * a bucket with none has zero totals and `hasLog` false.
 */
export function bucketDays(days: readonly DayTotals[], size: number): DayBucket[] {
  const step = Math.max(1, Math.floor(size));
  const out: DayBucket[] = [];
  for (let end = days.length; end > 0; end -= step) {
    const chunk = days.slice(Math.max(0, end - step), end);
    const first = chunk[0];
    const last = chunk.at(-1);
    if (!first || !last) continue;
    const logged = chunk.filter(isLoggedDay);
    const n = logged.length;
    const avg = (pick: (d: DayTotals) => number) =>
      n > 0 ? logged.reduce((s, d) => s + pick(d), 0) / n : 0;
    out.unshift({
      date: first.date,
      endDate: last.date,
      totalKcal: avg((d) => d.totalKcal),
      totalProtein: avg((d) => d.totalProtein),
      totalCarbs: avg((d) => d.totalCarbs),
      totalFat: avg((d) => d.totalFat),
      hasLog: n > 0,
      loggedDays: n,
    });
  }
  return out;
}
