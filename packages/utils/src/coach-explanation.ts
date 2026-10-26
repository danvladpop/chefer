import { COACH_MIN_COMPLETE_DAYS, type CoachExplanation } from '@chefer/types';
import { formatKcal } from './format';
import type { UnitSystem } from './units';
import { formatBodyWeight, formatWeightTrend } from './weight';

// ─── The Adaptive Chef's "why", in words (lane D2) ───────────────────────────
// Turns the review's structured explanation (@chefer/types coach-review.ts)
// into plain sentences and a short table of the numbers used, in the user's
// units. Deterministic, no AI. Adherence-neutral: it describes, it never
// judges — no "missed", no "over", no making up for anything.

/** The "Partly logged day" switch on a day's log (web and app). */
export const PARTLY_LOGGED_COPY = {
  label: 'Partly logged day',
  detail: 'Your weekly review leaves this day out of its averages.',
  saveError: "Couldn't save that. Try again in a moment.",
} as const;

/** The heading over the review's explanation. */
export const COACH_WHY_TITLE = 'Why this suggestion';

export interface CoachExplanationText {
  /** The reasoning, one sentence per line; the last line is the decision. */
  lines: string[];
  /** The data the coach used, as label/value rows. */
  data: { label: string; value: string }[];
}

/** Trend moves under this read as steady (kg/week). */
const STEADY_KG_PER_WEEK = 0.05;

function spanWords(days: number): string {
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'}`;
  return `${Math.round(days / 7)} weeks`;
}

function signedKcal(kcal: number): string {
  return `${kcal > 0 ? '+' : '−'}${formatKcal(Math.abs(kcal))} kcal`;
}

function decisionLine(e: CoachExplanation): string {
  const { reason, suggestedKcal } = e;
  const withheld = suggestedKcal === null;
  switch (reason) {
    case 'plateau':
      return withheld
        ? "Your trend hasn't moved down for two weekly reviews in a row. With Premium, your chef turns that into a budget suggestion for next week."
        : `Your trend hasn't moved down for two weekly reviews in a row, so I'd suggest ${signedKcal(suggestedKcal)} a day for next week.`;
    case 'gain_stall':
      return withheld
        ? "Your trend isn't rising yet. With Premium, your chef turns that into a budget suggestion for next week."
        : `Your trend isn't rising yet, so I'd suggest ${signedKcal(suggestedKcal)} a day to fuel your training next week.`;
    case 'plateau_watch':
      return 'Your trend didn’t move down this week. One week can be water, so I’ll look again next Sunday before suggesting anything.';
    case 'on_track':
      return 'Your trend is moving the way you want, so your budget stays as it is.';
    case 'few_complete_days':
      return `I suggest changes from at least ${COACH_MIN_COMPLETE_DAYS} complete days, so your budget stays as it is this week.`;
    case 'no_trend':
      return 'Weigh in a few times a week and I can read your trend. Until then your budget stays as it is.';
    case 'at_floor':
      return 'Your budget is already at the lowest I suggest, so it stays as it is.';
    case 'at_ceiling':
      return 'Your budget is already at the highest I suggest, so it stays as it is.';
    case 'under_18':
      return 'For under-18s I keep the budget at maintenance, so it stays as it is.';
    case 'no_body_metrics':
      return 'Add your height, age and activity level in Your targets and I can suggest changes. Until then your budget stays as it is.';
    case 'no_direction':
      return "Your goal doesn't call for a budget change, so it stays as it is.";
  }
}

/**
 * The review's explanation as sentences plus the data behind them. With
 * `proteinOnly` (WP-08) every calorie line and row is left out.
 */
export function coachExplanationText(
  e: CoachExplanation,
  system: UnitSystem,
  options: { proteinOnly?: boolean } = {},
): CoachExplanationText {
  const lines: string[] = [];
  const data: { label: string; value: string }[] = [];

  const { trend, intake } = e;
  if (trend) {
    const from = formatBodyWeight(trend.fromKg, system);
    const to = formatBodyWeight(trend.toKg, system);
    const span = spanWords(trend.spanDays);
    if (Math.abs(trend.kgPerWeek) < STEADY_KG_PER_WEEK) {
      lines.push(`Your trend weight held steady, from ${from} to ${to} over ${span}.`);
    } else {
      const rate = formatBodyWeight(Math.abs(trend.kgPerWeek), system);
      lines.push(
        `Your trend weight went from ${from} to ${to} over ${span}, about ${rate} a week ${trend.kgPerWeek < 0 ? 'down' : 'up'}.`,
      );
    }
    data.push(
      { label: 'Trend weight', value: `${from} → ${to}` },
      {
        label: 'Weekly rate',
        value: formatWeightTrend(trend.kgPerWeek, system) ?? 'steady',
      },
      { label: 'Weigh-ins', value: `${trend.weighIns} over ${spanWords(trend.spanDays)}` },
    );
  } else {
    lines.push('There aren’t enough weigh-ins yet to read your trend weight.');
  }

  const leftOut =
    intake.incompleteDays > 0
      ? ` ${intake.incompleteDays} partly logged ${intake.incompleteDays === 1 ? 'day was' : 'days were'} left out.`
      : '';
  if (!options.proteinOnly) {
    if (intake.completeDays > 0) {
      lines.push(
        `Your ${intake.completeDays} complete ${intake.completeDays === 1 ? 'day' : 'days'} averaged ${formatKcal(intake.avgKcal)} kcal, with a target of ${formatKcal(intake.targetKcal)} kcal.${leftOut}`,
      );
      data.push(
        { label: 'Average intake', value: `${formatKcal(intake.avgKcal)} kcal` },
        { label: 'Daily target', value: `${formatKcal(intake.targetKcal)} kcal` },
      );
    } else {
      lines.push(`No complete days to average this week.${leftOut}`);
    }
  } else if (leftOut) {
    lines.push(leftOut.trim());
  }
  data.push({
    label: 'Complete days',
    value:
      intake.incompleteDays > 0
        ? `${intake.completeDays} (+${intake.incompleteDays} partly logged)`
        : String(intake.completeDays),
  });

  const decision = decisionLine(e);
  if (!(options.proteinOnly && /\bkcal\b/.test(decision))) lines.push(decision);
  return { lines, data };
}
