// ─── Adaptive Chef review engine (F1, premium_plan.md W1-A) ──────────────────
// Pure functions over already-loaded inputs — no I/O, fully unit-tested.
// CoachService (coach.service.ts) does the loading and persistence.

import type { CoachExplanation, CoachReason } from '@chefer/types';
import {
  calorieFloor,
  dateOnlyKey,
  isMinorAge,
  summarizeWeightTrend,
  weightTrendSeries,
  type WeightTrendSummary,
} from '@chefer/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeightPoint {
  recordedAt: Date;
  weightKg: number;
}

export interface ReviewDayLog {
  /** UTC midnight of the logged day. */
  date: Date;
  totalKcal: number;
  /** Protein logged that day (g). Optional: older callers leave it out. */
  totalProtein?: number;
  /** Number of logged meal entries that day (planned or custom). */
  mealCount: number;
  /** Lane D2: the user marked the day as partly logged. */
  incomplete?: boolean;
}

export interface ReviewMetrics {
  /** Days with ≥1 logged meal / 7, as a rounded percentage. */
  adherencePct: number;
  /** Logged days the user didn't mark as partly logged (lane D2). */
  completeDays: number;
  /** Logged days the user marked as partly logged — left out of the averages. */
  incompleteDays: number;
  /** Mean kcal over the complete logged days (0 when none). */
  avgDailyKcal: number;
  /** Mean protein (g) over the complete logged days (0 when none). */
  avgDailyProteinG: number;
  /** Trend-weight rate in kg/week, or null without enough data. */
  weightTrendKg: number | null;
  /** How the trend weight moved over the window (null without enough data). */
  weightTrend: WeightTrendSummary | null;
}

export interface AdjustmentInput {
  goal: string | null;
  /** Complete days / 7, as a percentage (lane D2: partly logged days don't count). */
  adherencePct: number;
  /** This review's trend (kg/week), null when unknown. */
  trendKgPerWeek: number | null;
  /** The PREVIOUS review's stored trend — the "2 consecutive reviews" rule. */
  prevTrendKgPerWeek: number | null;
  /** The user's current resolved daily target (dial already included). */
  currentTargetKcal: number;
  /** Mifflin-St Jeor BMR — null when body metrics are incomplete. */
  bmr: number | null;
  /** Activity-multiplied TDEE — null when body metrics are incomplete. */
  tdee: number | null;
  /** Optional (R-02): drives the under-18 no-deficit rule and the sex-specific floor. */
  age?: number | null;
  biologicalSex?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum weigh-in days inside the window for a trend. */
const MIN_TREND_POINTS = 5;
/** Minimum span (days, first→last weigh-in) for a trend. */
const MIN_TREND_SPAN_DAYS = 10;
/** The window the coach reads the trend over (older weigh-ins only warm it up). */
export const TREND_WINDOW_DAYS = 28;
/** Below this adherence the coach fixes the habit, not the numbers. */
const MIN_ADHERENCE_PCT = 50;
/** One conservative step per review. */
const STEP_KCAL = 100;
/** LOSE: a trend flatter than −0.1 kg/week reads as a plateau. */
const LOSE_PLATEAU_KG_PER_WEEK = -0.1;
/** GAIN: a trend below +0.05 kg/week reads as a stall. */
const GAIN_STALL_KG_PER_WEEK = 0.05;
/** Safe floor multiplier on BMR for downward adjustments. */
const FLOOR_BMR_FACTOR = 1.1;
/** Safe ceiling above TDEE for upward adjustments. */
const CEILING_OVER_TDEE_KCAL = 500;

// ─── Weight trend (shared trend weight, @chefer/utils weight-trend.ts) ──────

// The review runs in the Sunday server sweep (no client localDate) and its
// weeks are UTC, so weigh-ins are grouped into the same UTC calendar days.
const utcDay = (d: Date) => dateOnlyKey(d);

/**
 * How the trend weight moved over the 28 days up to `asOf`, from the same
 * smoothing the charts draw. Null unless ≥5 weigh-in days span ≥10 days —
 * anything less is scale noise, not a trend. Typo readings (more than 3 kg a
 * day) are dropped, so one bad entry can't flip a plateau (audit F-DASH-3-1).
 */
export function computeWeightTrend(
  points: WeightPoint[],
  asOf: Date = new Date(),
): WeightTrendSummary | null {
  return summarizeWeightTrend(weightTrendSeries(points, { dayKey: utcDay }), {
    windowDays: TREND_WINDOW_DAYS,
    asOf: utcDay(asOf),
    minWeighIns: MIN_TREND_POINTS,
    minSpanDays: MIN_TREND_SPAN_DAYS,
  });
}

// ─── Week metrics ─────────────────────────────────────────────────────────────

export function computeReviewMetrics(
  weekLogs: ReviewDayLog[],
  weightPoints: WeightPoint[],
  asOf: Date = new Date(),
): ReviewMetrics {
  const loggedDays = weekLogs.filter((l) => l.mealCount > 0);
  // Lane D2: a day the user marked as partly logged still counts as logged,
  // but it would drag the averages down, so they read complete days only.
  const completeDays = loggedDays.filter((l) => !l.incomplete);
  const adherencePct = Math.round((loggedDays.length / 7) * 100);
  const avgOf = (pick: (l: ReviewDayLog) => number) =>
    completeDays.length > 0
      ? Math.round(completeDays.reduce((s, l) => s + pick(l), 0) / completeDays.length)
      : 0;
  const weightTrend = computeWeightTrend(weightPoints, asOf);
  return {
    adherencePct,
    completeDays: completeDays.length,
    incompleteDays: loggedDays.length - completeDays.length,
    avgDailyKcal: avgOf((l) => l.totalKcal),
    avgDailyProteinG: avgOf((l) => l.totalProtein ?? 0),
    weightTrendKg: weightTrend?.kgPerWeek ?? null,
    weightTrend,
  };
}

// ─── Adjustment policy (deterministic, conservative) ─────────────────────────

export interface AdjustmentDecision {
  /** The suggested daily change (kcal); 0 = keep. */
  kcal: number;
  /** Which rule decided — the explanation's backbone (lane D2). */
  reason: CoachReason;
}

/**
 * Decides this review's calorie-dial delta and why. Rules (premium_plan.md
 * W1-A; lane D2 added the reasons and the complete-days reading):
 *  - a goal without a direction (maintain, eat healthier…) → nothing.
 *  - under 18 and LOSE_WEIGHT → nothing (maintenance, R-02).
 *  - complete days < 50 % of the week → nothing; the review coaches the habit.
 *  - no trend (or no safe bounds from body metrics) → nothing.
 *  - LOSE_WEIGHT plateau (trend ≥ −0.1 kg/wk) for 2 CONSECUTIVE reviews →
 *    −100 kcal, floored so the resulting target never drops below BMR×1.1
 *    (or the sex-specific minimum); a first plateau week only watches.
 *  - GAIN_MUSCLE stall (trend ≤ +0.05 kg/wk) → +100 kcal, ceilinged at
 *    TDEE+500.
 * The clamp is partial: if only −40 kcal of headroom remains above the
 * floor, the adjustment is −40, not 0.
 */
export function decideAdjustment(input: AdjustmentInput): AdjustmentDecision {
  const { goal, adherencePct, trendKgPerWeek, prevTrendKgPerWeek, currentTargetKcal, bmr, tdee } =
    input;
  const keep = (reason: CoachReason): AdjustmentDecision => ({ kcal: 0, reason });

  if (goal !== 'LOSE_WEIGHT' && goal !== 'GAIN_MUSCLE') return keep('no_direction');
  // R-02: never trim calories for someone under 18 (their target is
  // maintenance — see calorie-target.ts).
  if (goal === 'LOSE_WEIGHT' && isMinorAge(input.age)) return keep('under_18');
  if (adherencePct < MIN_ADHERENCE_PCT) return keep('few_complete_days');
  if (trendKgPerWeek === null) return keep('no_trend');
  if (bmr === null || tdee === null) return keep('no_body_metrics');

  if (goal === 'LOSE_WEIGHT') {
    const plateauNow = trendKgPerWeek >= LOSE_PLATEAU_KG_PER_WEEK;
    const plateauPrev =
      prevTrendKgPerWeek !== null && prevTrendKgPerWeek >= LOSE_PLATEAU_KG_PER_WEEK;
    if (!plateauNow) return keep('on_track');
    if (!plateauPrev) return keep('plateau_watch');
    const floor = Math.max(Math.round(bmr * FLOOR_BMR_FACTOR), calorieFloor(input.biologicalSex));
    const headroom = currentTargetKcal - floor; // kcal available above the floor
    if (headroom <= 0) return keep('at_floor');
    return { kcal: -Math.min(STEP_KCAL, headroom), reason: 'plateau' };
  }

  if (trendKgPerWeek > GAIN_STALL_KG_PER_WEEK) return keep('on_track');
  const ceiling = tdee + CEILING_OVER_TDEE_KCAL;
  const headroom = ceiling - currentTargetKcal;
  if (headroom <= 0) return keep('at_ceiling');
  return { kcal: Math.min(STEP_KCAL, headroom), reason: 'gain_stall' };
}

/** The suggested daily change alone (see decideAdjustment). */
export function decideAdjustmentKcal(input: AdjustmentInput): number {
  return decideAdjustment(input).kcal;
}

// ─── The "why" (lane D2) ──────────────────────────────────────────────────────

/**
 * The structured explanation stored with the review. `suggestedKcal` is null
 * when the suggestion is withheld (free tier): the reasoning is shown to
 * everyone, acting on it is Premium.
 */
export function buildCoachExplanation(input: {
  decision: AdjustmentDecision;
  withholdSuggestion: boolean;
  goal: string | null;
  metrics: ReviewMetrics;
  prevTrendKgPerWeek: number | null;
  targetKcal: number;
}): CoachExplanation {
  const { decision, metrics } = input;
  const trend = metrics.weightTrend;
  return {
    version: 1,
    reason: decision.reason,
    suggestedKcal: input.withholdSuggestion ? null : decision.kcal,
    goal: input.goal,
    trend: trend
      ? {
          fromDate: trend.fromDate,
          toDate: trend.toDate,
          fromKg: trend.fromTrendKg,
          toKg: trend.toTrendKg,
          spanDays: trend.spanDays,
          weighIns: trend.weighIns,
          kgPerWeek: trend.kgPerWeek,
        }
      : null,
    prevKgPerWeek: input.prevTrendKgPerWeek,
    intake: {
      avgKcal: metrics.avgDailyKcal,
      completeDays: metrics.completeDays,
      incompleteDays: metrics.incompleteDays,
      targetKcal: input.targetKcal,
    },
  };
}

// ─── Template review text (mock AI + live-failure fallback) ──────────────────

export interface ReviewTextInput {
  adherencePct: number;
  loggedDays: number;
  avgDailyKcal: number;
  targetKcal: number;
  weightTrendKg: number | null;
  /**
   * §2.11, T-35.4 (rev 2): the coach PROPOSES, it never overwrites — this is
   * the amount it would adjust by, not an amount already applied. The copy
   * below says "suggests", never "adjusted" (old clients' banners must stay
   * true: nothing moves until `targets.acknowledgeChange` accepts it).
   */
  proposedAdjustmentKcal: number;
  goal: string | null;
  /** Dish names from the reviewed week's plan (for flavour, may be empty). */
  dishNames: string[];
  /**
   * Lifters only (audit P2-4 follow-up): the week's protein judged against
   * their g/kg target (resolveDailyTargets with lifter bodyweight). Absent
   * for everyone else — the review stays about calories.
   */
  protein?: ReviewProtein | null;
}

/** A lifter's week of protein, for the review line. */
export interface ReviewProtein {
  /** Mean protein (g) over the logged days. */
  avgDailyG: number;
  /** The lifter's daily protein target (g). */
  targetG: number;
  /** The g/kg rule behind the target (1.8 GAIN, 2.0 LOSE, 1.6 MAINTAIN). */
  gPerKg: number;
}

/** At or above this share of the target, protein reads as "on target". */
const PROTEIN_ON_TARGET_SHARE = 0.9;

/**
 * One protein line for a lifter's review, or null when there is nothing to
 * say (not a lifter, or no protein logged).
 */
export function reviewProteinLine(protein: ReviewProtein | null | undefined): string | null {
  if (!protein || protein.avgDailyG <= 0 || protein.targetG <= 0) return null;
  const { avgDailyG, targetG, gPerKg } = protein;
  if (avgDailyG >= targetG * PROTEIN_ON_TARGET_SHARE) {
    return `Protein averaged ${avgDailyG} g a day against your ${targetG} g lifting target (${gPerKg} g per kg) — right where your training needs it.`;
  }
  return `Protein averaged ${avgDailyG} g a day, ${targetG - avgDailyG} g short of your ${targetG} g lifting target (${gPerKg} g per kg) — a protein-forward breakfast closes most of that.`;
}

/**
 * Deterministic 4–6 line review used by the mock AI path and as the fallback
 * when the live call fails. Same tone rules as the live prompt: warm,
 * specific, non-medical, never mentions BMR/TDEE/algorithms. The FIRST line
 * doubles as the free-tier teaser, so it must stand alone.
 */
export function buildTemplateReviewText(input: ReviewTextInput): string {
  const {
    adherencePct,
    loggedDays,
    avgDailyKcal,
    targetKcal,
    weightTrendKg,
    proposedAdjustmentKcal,
  } = input;

  const lines: string[] = [];
  lines.push(
    `You logged ${loggedDays} of 7 days this week — ${
      adherencePct >= 70 ? 'a solid record to cook from' : 'enough for me to spot the pattern'
    }.`,
  );

  const delta = avgDailyKcal - targetKcal;
  if (avgDailyKcal > 0) {
    if (Math.abs(delta) <= Math.max(50, targetKcal * 0.05)) {
      lines.push(`Your logged days averaged ${avgDailyKcal} kcal — right on your target.`);
    } else if (delta > 0) {
      lines.push(
        `Your logged days averaged ${avgDailyKcal} kcal, about ${delta} above your target.`,
      );
    } else {
      lines.push(
        `Your logged days averaged ${avgDailyKcal} kcal, about ${-delta} under target — make sure you're eating enough to enjoy the week.`,
      );
    }
  }

  const proteinLine = reviewProteinLine(input.protein);
  if (proteinLine) lines.push(proteinLine);

  if (weightTrendKg !== null) {
    const abs = Math.abs(weightTrendKg).toFixed(1);
    if (Math.abs(weightTrendKg) < 0.05) {
      lines.push('Your trend weight is holding steady.');
    } else {
      lines.push(
        `Your trend weight is moving ${weightTrendKg < 0 ? 'down' : 'up'} about ${abs} kg a week.`,
      );
    }
  } else {
    lines.push('Log your weight a couple of times a week and I can start reading the trend.');
  }

  if (adherencePct < 50) {
    lines.push(
      "Before we touch the numbers, let's fix the logging habit — three more logged days next week and I can coach properly.",
    );
  } else if (proposedAdjustmentKcal !== 0) {
    lines.push(
      `I'd suggest moving next week's calorie budget by ${proposedAdjustmentKcal > 0 ? '+' : ''}${proposedAdjustmentKcal} kcal — accept it in Your targets and I'll build next week's plan around it.`,
    );
  } else {
    lines.push("Your targets still fit — I'm keeping next week's budget as it is.");
  }

  return lines.join('\n');
}
