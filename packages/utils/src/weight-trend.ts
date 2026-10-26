import { localDateStr } from './date';
import type { UnitSystem } from './units';
import { formatBodyWeight } from './weight';

// ─── Trend weight (market review 2026-10, lane D1) ───────────────────────────
// A scale reading swings a kilo or more with water, salt and timing. The trend
// is an exponentially smoothed average of the weigh-ins (the Hacker's Diet /
// Happy Scale / MacroFactor idea), so the line moves with real change and
// shrugs off a salty dinner. One implementation for the web chart, the app's
// chart and the Adaptive Chef's Sunday review.
//
// Gaps are handled in time, not in readings: the smoothing step is
// `1 − (1 − α)^days`, so a weigh-in after two weeks away pulls the trend most
// of the way to it (the old trend is stale), while daily weigh-ins each nudge
// it by α. Several weigh-ins on one day count as their average.

/** Share of the gap between the trend and today's weigh-in closed per day. */
export const TREND_DAILY_ALPHA = 0.1;

/** Faster than this between two weigh-ins is a typo, not physiology. */
const MAX_PLAUSIBLE_KG_PER_DAY = 3;

const DAY_MS = 86_400_000;

export interface WeighIn {
  recordedAt: Date | string;
  weightKg: number;
}

export interface TrendPoint {
  /** The calendar day of the weigh-in(s), `YYYY-MM-DD`. */
  date: string;
  /** When the day's first weigh-in was recorded (a chart's time axis). */
  recordedAt: Date;
  /** The day's weigh-in; the mean when there were several. */
  weightKg: number;
  /** The smoothed trend weight after this day. */
  trendKg: number;
  /**
   * A reading too far from the last kept one to be real (more than 3 kg a
   * day). It still shows as a dot, but the trend carries on without it.
   */
  outlier: boolean;
}

export interface WeightTrendOptions {
  alpha?: number;
  /** Maps a weigh-in time to its calendar day. Defaults to the local day. */
  dayKey?: (recordedAt: Date) => string;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Whole calendar days from `a` to `b` (both `YYYY-MM-DD`). */
function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

/**
 * The trend line for a set of weigh-ins: one point per calendar day, oldest
 * first, each carrying the day's reading and the smoothed trend after it.
 * Input order doesn't matter.
 */
export function weightTrendSeries(
  entries: readonly WeighIn[],
  options: WeightTrendOptions = {},
): TrendPoint[] {
  const alpha = options.alpha ?? TREND_DAILY_ALPHA;
  const dayKey = options.dayKey ?? ((d: Date) => localDateStr(d));

  const byDay = new Map<string, { recordedAt: Date; sum: number; count: number }>();
  for (const entry of entries) {
    const recordedAt = new Date(entry.recordedAt);
    const key = dayKey(recordedAt);
    const day = byDay.get(key);
    if (day) {
      day.sum += entry.weightKg;
      day.count += 1;
      if (recordedAt < day.recordedAt) day.recordedAt = recordedAt;
    } else {
      byDay.set(key, { recordedAt, sum: entry.weightKg, count: 1 });
    }
  }
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const series: TrendPoint[] = [];
  let trend: number | null = null;
  let lastKept: { date: string; weightKg: number } | null = null;
  for (const [date, day] of days) {
    const weightKg = day.sum / day.count;
    let outlier = false;
    if (lastKept && trend !== null) {
      const gap = Math.max(1, daysBetween(lastKept.date, date));
      if (Math.abs(weightKg - lastKept.weightKg) > MAX_PLAUSIBLE_KG_PER_DAY * gap) {
        outlier = true;
      } else {
        const step = 1 - Math.pow(1 - alpha, gap);
        trend = trend + step * (weightKg - trend);
      }
    } else {
      trend = weightKg;
    }
    if (!outlier) lastKept = { date, weightKg };
    series.push({
      date,
      recordedAt: day.recordedAt,
      weightKg: round3(weightKg),
      trendKg: round3(trend),
      outlier,
    });
  }
  return series;
}

export interface WeightTrendSummary {
  /** First weigh-in day inside the window. */
  fromDate: string;
  /** Last weigh-in day inside the window. */
  toDate: string;
  fromTrendKg: number;
  toTrendKg: number;
  /** toTrendKg − fromTrendKg. */
  changeKg: number;
  /** Days from fromDate to toDate. */
  spanDays: number;
  /** Days with a (non-outlier) weigh-in inside the window. */
  weighIns: number;
  /** The trend's rate of change, kg per week. */
  kgPerWeek: number;
}

export interface WeightTrendSummaryOptions {
  /** How far back from `asOf` to look. */
  windowDays: number;
  /** The window's last day, `YYYY-MM-DD`. Defaults to the last weigh-in. */
  asOf?: string;
  /** Fewer weigh-ins than this is scale noise, not a trend. */
  minWeighIns?: number;
  /** A shorter span than this is scale noise, not a trend. */
  minSpanDays?: number;
}

/**
 * How the trend moved over the last `windowDays`: where it started and ended
 * inside the window and the weekly rate between them. Points before the
 * window still feed the trend (they warm it up), they just aren't counted.
 * Null when the window holds too little to read.
 */
export function summarizeWeightTrend(
  series: readonly TrendPoint[],
  { windowDays, asOf, minWeighIns = 2, minSpanDays = 1 }: WeightTrendSummaryOptions,
): WeightTrendSummary | null {
  const end = asOf ?? series.at(-1)?.date;
  if (!end) return null;
  const inWindow = series.filter((p) => {
    if (p.outlier || p.date > end) return false;
    return daysBetween(p.date, end) <= windowDays;
  });
  const first = inWindow.at(0);
  const last = inWindow.at(-1);
  if (!first || !last || inWindow.length < minWeighIns) return null;
  const spanDays = daysBetween(first.date, last.date);
  if (spanDays < Math.max(1, minSpanDays)) return null;
  const changeKg = round3(last.trendKg - first.trendKg);
  return {
    fromDate: first.date,
    toDate: last.date,
    fromTrendKg: first.trendKg,
    toTrendKg: last.trendKg,
    changeKg,
    spanDays,
    weighIns: inWindow.length,
    kgPerWeek: round3((changeKg / spanDays) * 7),
  };
}

// ─── Copy (adherence-neutral: a direction, never a verdict) ──────────────────

/** The one-line explainer under every trend chart. */
export const TREND_WEIGHT_EXPLAINER =
  'The line is your trend weight. It smooths out day-to-day swings from water, salt and timing.';

/** Trend moves smaller than this read as steady (entries are 0.1 kg precise). */
const STEADY_KG = 0.05;

/**
 * "Trend −0.6 kg over 1 month" / "Trend steady over 1 week", or null without
 * a summary. `span` is the window in words.
 */
export function trendChangeText(
  summary: WeightTrendSummary | null,
  system: UnitSystem,
  span: string,
): string | null {
  if (!summary) return null;
  if (Math.abs(summary.changeKg) < STEADY_KG) return `Trend steady over ${span}`;
  // A real minus sign reads better than a hyphen next to a number.
  const change = formatBodyWeight(summary.changeKg, system, { signed: true }).replace('-', '−');
  return `Trend ${change} over ${span}`;
}
