import { z } from 'zod';

// ─── The Adaptive Chef's "why" (market review 2026-10, lane D2) ──────────────
// Every Sunday review carries the data behind its decision, built
// deterministically on the API (no AI): how the trend weight moved, what the
// complete days averaged, and which rule decided. Clients turn it into plain
// sentences with `coachExplanationText` (@chefer/utils), in the user's units.
// Free accounts get the same explanation with `suggestedKcal` withheld — the
// reasoning is free, acting on it is Premium.

/** Which rule decided the week's suggestion. */
export const COACH_REASONS = [
  /** LOSE: the trend held steady two reviews in a row → a smaller budget. */
  'plateau',
  /** LOSE: steady this week only — one week can be water, look again. */
  'plateau_watch',
  /** The trend is moving the goal's way → keep. */
  'on_track',
  /** GAIN: the trend isn't rising → a bigger budget. */
  'gain_stall',
  /** Fewer complete days than the coach needs to suggest a change. */
  'few_complete_days',
  /** Not enough weigh-ins for a trend. */
  'no_trend',
  /** LOSE plateau, but the budget is already at the lowest the coach suggests. */
  'at_floor',
  /** GAIN stall, but the budget is already at the highest the coach suggests. */
  'at_ceiling',
  /** Under 18: the budget stays at maintenance. */
  'under_18',
  /** Height, age or activity missing, so the coach can't bound a change. */
  'no_body_metrics',
  /** The goal has no direction to adjust toward (maintain, eat healthier…). */
  'no_direction',
] as const;
export type CoachReason = (typeof COACH_REASONS)[number];

/** Complete days the coach needs before it suggests a change (4 of 7 ≈ 50 %). */
export const COACH_MIN_COMPLETE_DAYS = 4;

export const coachExplanationSchema = z.object({
  version: z.literal(1),
  reason: z.enum(COACH_REASONS),
  /**
   * The suggested daily change (kcal), 0 for "keep". Null when withheld:
   * a free account sees the reasoning, not the number.
   */
  suggestedKcal: z.number().int().nullable(),
  goal: z.string().nullable(),
  /** How the trend weight moved over the window; null without enough weigh-ins. */
  trend: z
    .object({
      fromDate: z.string(),
      toDate: z.string(),
      fromKg: z.number(),
      toKg: z.number(),
      spanDays: z.number().int(),
      weighIns: z.number().int(),
      kgPerWeek: z.number(),
    })
    .nullable(),
  /** The previous review's rate (kg/week): the "two reviews in a row" rule. */
  prevKgPerWeek: z.number().nullable(),
  intake: z.object({
    /** Mean kcal over the complete logged days (0 when none). */
    avgKcal: z.number().int(),
    completeDays: z.number().int(),
    /** Logged days the user marked as partly logged — left out of the average. */
    incompleteDays: z.number().int(),
    /** The daily target the week was judged against. */
    targetKcal: z.number().int(),
  }),
});
export type CoachExplanation = z.infer<typeof coachExplanationSchema>;
