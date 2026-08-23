// ─── Adaptive Chef review engine (F1, premium_plan.md W1-A) ──────────────────
// Pure functions over already-loaded inputs — no I/O, fully unit-tested.
// CoachService (coach.service.ts) does the loading and persistence.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeightPoint {
  recordedAt: Date;
  weightKg: number;
}

export interface ReviewDayLog {
  /** UTC midnight of the logged day. */
  date: Date;
  totalKcal: number;
  /** Number of logged meal entries that day (planned or custom). */
  mealCount: number;
}

export interface ReviewMetrics {
  /** Days with ≥1 logged meal / 7, as a rounded percentage. */
  adherencePct: number;
  /** Mean kcal over the days that were actually logged (0 when none). */
  avgDailyKcal: number;
  /** EWMA weight trend in kg/week, or null without enough data. */
  weightTrendKg: number | null;
}

export interface AdjustmentInput {
  goal: string | null;
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const EWMA_ALPHA = 0.25;
/** Minimum weight points for a trend. */
const MIN_TREND_POINTS = 5;
/** Minimum span (days, first→last point) for a trend. */
const MIN_TREND_SPAN_DAYS = 10;
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

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Weight trend (EWMA, MacroFactor-style smoothing) ────────────────────────

/**
 * Exponentially-weighted moving average trend over raw weigh-ins, expressed
 * in kg/week. Returns null unless there are ≥5 points spanning ≥10 days —
 * anything less is scale noise, not a trend.
 */
export function computeEwmaTrendKgPerWeek(
  points: WeightPoint[],
  alpha: number = EWMA_ALPHA,
): number | null {
  if (points.length < MIN_TREND_POINTS) return null;

  const sorted = [...points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  const spanDays = (last.recordedAt.getTime() - first.recordedAt.getTime()) / DAY_MS;
  if (spanDays < MIN_TREND_SPAN_DAYS) return null;

  let ewma = first.weightKg;
  for (const point of sorted.slice(1)) {
    ewma = alpha * point.weightKg + (1 - alpha) * ewma;
  }

  const deltaKg = ewma - first.weightKg;
  const perWeek = (deltaKg / spanDays) * 7;
  return Math.round(perWeek * 1000) / 1000;
}

// ─── Week metrics ─────────────────────────────────────────────────────────────

export function computeReviewMetrics(
  weekLogs: ReviewDayLog[],
  weightPoints: WeightPoint[],
): ReviewMetrics {
  const loggedDays = weekLogs.filter((l) => l.mealCount > 0);
  const adherencePct = Math.round((loggedDays.length / 7) * 100);
  const avgDailyKcal =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((s, l) => s + l.totalKcal, 0) / loggedDays.length)
      : 0;
  return {
    adherencePct,
    avgDailyKcal,
    weightTrendKg: computeEwmaTrendKgPerWeek(weightPoints),
  };
}

// ─── Adjustment policy (deterministic, conservative) ─────────────────────────

/**
 * Decides this review's calorie-dial delta. Rules (premium_plan.md W1-A):
 *  - adherence < 50% → adjust nothing; the review text coaches the habit.
 *  - no trend (or no safe bounds from body metrics) → nothing.
 *  - LOSE_WEIGHT plateau (trend ≥ −0.1 kg/wk) for 2 CONSECUTIVE reviews →
 *    −100 kcal, floored so the resulting target never drops below BMR×1.1.
 *  - GAIN_MUSCLE stall (trend ≤ +0.05 kg/wk) → +100 kcal, ceilinged at
 *    TDEE+500.
 * The clamp is partial: if only −40 kcal of headroom remains above the
 * floor, the adjustment is −40, not 0.
 */
export function decideAdjustmentKcal(input: AdjustmentInput): number {
  const { goal, adherencePct, trendKgPerWeek, prevTrendKgPerWeek, currentTargetKcal, bmr, tdee } =
    input;

  if (adherencePct < MIN_ADHERENCE_PCT) return 0;
  if (trendKgPerWeek === null) return 0;
  if (bmr === null || tdee === null) return 0;

  if (goal === 'LOSE_WEIGHT') {
    const plateauNow = trendKgPerWeek >= LOSE_PLATEAU_KG_PER_WEEK;
    const plateauPrev =
      prevTrendKgPerWeek !== null && prevTrendKgPerWeek >= LOSE_PLATEAU_KG_PER_WEEK;
    if (!plateauNow || !plateauPrev) return 0;
    const floor = Math.round(bmr * FLOOR_BMR_FACTOR);
    const headroom = currentTargetKcal - floor; // kcal available above the floor
    if (headroom <= 0) return 0;
    return -Math.min(STEP_KCAL, headroom);
  }

  if (goal === 'GAIN_MUSCLE') {
    if (trendKgPerWeek > GAIN_STALL_KG_PER_WEEK) return 0;
    const ceiling = tdee + CEILING_OVER_TDEE_KCAL;
    const headroom = ceiling - currentTargetKcal;
    if (headroom <= 0) return 0;
    return Math.min(STEP_KCAL, headroom);
  }

  return 0;
}

// ─── Template review text (mock AI + live-failure fallback) ──────────────────

export interface ReviewTextInput {
  adherencePct: number;
  loggedDays: number;
  avgDailyKcal: number;
  targetKcal: number;
  weightTrendKg: number | null;
  adjustmentKcal: number;
  goal: string | null;
  /** Dish names from the reviewed week's plan (for flavour, may be empty). */
  dishNames: string[];
}

/**
 * Deterministic 4–5 line review used by the mock AI path and as the fallback
 * when the live call fails. Same tone rules as the live prompt: warm,
 * specific, non-medical, never mentions BMR/TDEE/algorithms. The FIRST line
 * doubles as the free-tier teaser, so it must stand alone.
 */
export function buildTemplateReviewText(input: ReviewTextInput): string {
  const { adherencePct, loggedDays, avgDailyKcal, targetKcal, weightTrendKg, adjustmentKcal } =
    input;

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
        `Your logged days averaged ${avgDailyKcal} kcal, about ${delta} over target — usually the dinners.`,
      );
    } else {
      lines.push(
        `Your logged days averaged ${avgDailyKcal} kcal, about ${-delta} under target — make sure you're eating enough to enjoy the week.`,
      );
    }
  }

  if (weightTrendKg !== null) {
    const abs = Math.abs(weightTrendKg).toFixed(1);
    if (Math.abs(weightTrendKg) < 0.05) {
      lines.push('Your weight is holding steady.');
    } else {
      lines.push(
        `Your weight is trending ${weightTrendKg < 0 ? 'down' : 'up'} about ${abs} kg a week.`,
      );
    }
  } else {
    lines.push('Log your weight a couple of times a week and I can start reading the trend.');
  }

  if (adherencePct < 50) {
    lines.push(
      "Before we touch the numbers, let's fix the logging habit — three more logged days next week and I can coach properly.",
    );
  } else if (adjustmentKcal !== 0) {
    lines.push(
      `I've adjusted next week's calorie budget by ${adjustmentKcal > 0 ? '+' : ''}${adjustmentKcal} kcal — your new plan is built around it.`,
    );
  } else {
    lines.push("Your targets still fit — I'm keeping next week's budget as it is.");
  }

  return lines.join('\n');
}
