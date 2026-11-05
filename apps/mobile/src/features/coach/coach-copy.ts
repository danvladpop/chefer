import type { Translator } from '@chefer/i18n';
import { COACH_MIN_COMPLETE_DAYS, type CoachExplanation } from '@chefer/types';
import {
  bodyWeightInUnit,
  bodyWeightUnit,
  formatBodyWeight,
  type StatsRangeDays,
  type UnitSystem,
  type WeightTrendSummary,
} from '@chefer/utils';

// ─── Weight and coach copy in the reader's language (lane J phase 4) ─────────
// Translator versions of the English-only helpers in @chefer/utils
// (coachExplanationText, formatWeightTrend, trendChangeText, parseBodyWeight's
// messages). Same rules, same lines: only the words come from the catalog.
// The web app has the same file (apps/web/src/features/coach/coach-copy.ts).

/** "0.4" / "0,4": always one decimal, in the UI language. */
function oneDecimal(tr: Translator, value: number): string {
  try {
    return new Intl.NumberFormat(tr.intlTag, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    }).format(value);
  } catch {
    return value.toFixed(1);
  }
}

/** STATS_RANGE_SPAN in words: "30 days", "a year". */
export function rangeSpan(tr: Translator, range: StatsRangeDays): string {
  switch (range) {
    case 7:
      return tr.t('today.progress.range.span.d7');
    case 30:
      return tr.t('today.progress.range.span.d30');
    case 90:
      return tr.t('today.progress.range.span.d90');
    case 365:
      return tr.t('today.progress.range.span.d365');
  }
}

/** STATS_RANGE_LABELS: "1W", "1M", "3M", "1Y". */
export function rangeLabel(tr: Translator, range: StatsRangeDays): string {
  switch (range) {
    case 7:
      return tr.t('today.progress.range.label.d7');
    case 30:
      return tr.t('today.progress.range.label.d30');
    case 90:
      return tr.t('today.progress.range.label.d90');
    case 365:
      return tr.t('today.progress.range.label.d365');
  }
}

/** formatWeightTrend(): "−0.4 kg/wk", "steady" under 0.05 kg, null without a trend. */
export function weightTrendText(
  tr: Translator,
  trendKg: number | null,
  system: UnitSystem,
): string | null {
  if (trendKg === null || !Number.isFinite(trendKg)) return null;
  if (Math.abs(trendKg) < 0.05) return tr.t('today.progress.weight.steady');
  const abs = oneDecimal(tr, Math.abs(bodyWeightInUnit(trendKg, system)));
  const change = `${trendKg < 0 ? '−' : '+'}${abs} ${bodyWeightUnit(system)}`;
  return tr.t('today.progress.weight.perWeek', { change });
}

/** trendChangeText(): "Trend −0.6 kg over 30 days" / "Trend steady over 7 days". */
export function trendChangeLine(
  tr: Translator,
  summary: WeightTrendSummary | null,
  system: UnitSystem,
  span: string,
): string | null {
  if (!summary) return null;
  if (Math.abs(summary.changeKg) < 0.05) {
    return tr.t('today.progress.weight.trendSteady', { span });
  }
  const change = formatBodyWeight(summary.changeKg, system, { signed: true }).replace('-', '−');
  return tr.t('today.progress.weight.trendChange', { change, span });
}

/** parseBodyWeight()'s English messages, in the reader's language. */
export function weightErrorText(tr: Translator, error: string): string {
  if (error === 'Enter your weight.') return tr.t('today.progress.form.errors.empty');
  const format = /^Use a number like (\d+(?:\.\d+)?)\.$/.exec(error);
  if (format?.[1]) {
    return tr.t('today.progress.form.errors.format', {
      example: tr.number(Number(format[1]), 1),
    });
  }
  const range = /between (\d+) and (\d+) (kg|lb)\./.exec(error);
  if (range?.[1] && range[2] && range[3]) {
    return tr.t('today.progress.form.errors.range', {
      min: Number(range[1]),
      max: Number(range[2]),
      unit: range[3],
    });
  }
  return error;
}

// ─── The Adaptive Chef's "why" (mirrors @chefer/utils coach-explanation.ts) ──

export interface CoachExplanationCopy {
  lines: string[];
  data: { label: string; value: string }[];
}

const STEADY_KG_PER_WEEK = 0.05;

function spanWords(tr: Translator, days: number): string {
  if (days < 14) return tr.t('today.coachWhy.span.days', { count: days });
  return tr.t('today.coachWhy.span.weeks', { count: Math.round(days / 7) });
}

/** The decision line, and whether it quotes a calorie figure (dropped in protein-only mode). */
function decisionLine(tr: Translator, e: CoachExplanation): { text: string; kcal: boolean } {
  const { t } = tr;
  const { reason, suggestedKcal } = e;
  const signed = (kcal: number) => `${kcal > 0 ? '+' : '−'}${tr.number(Math.abs(kcal))}`;
  switch (reason) {
    case 'plateau':
      return suggestedKcal === null
        ? { text: t('today.coachWhy.decision.plateauWithheld'), kcal: false }
        : {
            text: t('today.coachWhy.decision.plateau.kcal', { change: signed(suggestedKcal) }),
            kcal: true,
          };
    case 'gain_stall':
      return suggestedKcal === null
        ? { text: t('today.coachWhy.decision.gainStallWithheld'), kcal: false }
        : {
            text: t('today.coachWhy.decision.gainStall.kcal', { change: signed(suggestedKcal) }),
            kcal: true,
          };
    case 'plateau_watch':
      return { text: t('today.coachWhy.decision.plateauWatch'), kcal: false };
    case 'on_track':
      return { text: t('today.coachWhy.decision.onTrack'), kcal: false };
    case 'few_complete_days':
      return {
        text: t('today.coachWhy.decision.fewCompleteDays', { min: COACH_MIN_COMPLETE_DAYS }),
        kcal: false,
      };
    case 'no_trend':
      return { text: t('today.coachWhy.decision.noTrend'), kcal: false };
    case 'at_floor':
      return { text: t('today.coachWhy.decision.atFloor'), kcal: false };
    case 'at_ceiling':
      return { text: t('today.coachWhy.decision.atCeiling'), kcal: false };
    case 'under_18':
      return { text: t('today.coachWhy.decision.under18'), kcal: false };
    case 'no_body_metrics':
      return { text: t('today.coachWhy.decision.noBodyMetrics'), kcal: false };
    case 'no_direction':
      return { text: t('today.coachWhy.decision.noDirection'), kcal: false };
  }
}

/**
 * coachExplanationText() in the reader's language: the reasoning, one sentence
 * per line, plus the data behind it. With `proteinOnly` (WP-08) every calorie
 * line and row is left out.
 */
export function coachExplanationCopy(
  tr: Translator,
  e: CoachExplanation,
  system: UnitSystem,
  options: { proteinOnly?: boolean } = {},
): CoachExplanationCopy {
  const { t } = tr;
  const proteinOnly = options.proteinOnly === true;
  const lines: string[] = [];
  const data: { label: string; value: string }[] = [];

  const { trend, intake } = e;
  if (trend) {
    const from = formatBodyWeight(trend.fromKg, system);
    const to = formatBodyWeight(trend.toKg, system);
    const span = spanWords(tr, trend.spanDays);
    if (Math.abs(trend.kgPerWeek) < STEADY_KG_PER_WEEK) {
      lines.push(t('today.coachWhy.trendSteady', { from, to, span }));
    } else {
      const rate = formatBodyWeight(Math.abs(trend.kgPerWeek), system);
      lines.push(
        trend.kgPerWeek < 0
          ? t('today.coachWhy.trendDown', { from, to, span, rate })
          : t('today.coachWhy.trendUp', { from, to, span, rate }),
      );
    }
    data.push(
      {
        label: t('today.coachWhy.data.trendWeight'),
        value: t('today.coachWhy.data.trendWeightValue', { from, to }),
      },
      {
        label: t('today.coachWhy.data.weeklyRate'),
        value: weightTrendText(tr, trend.kgPerWeek, system) ?? t('today.coachWhy.data.steady'),
      },
      {
        label: t('today.coachWhy.data.weighIns'),
        value: t('today.coachWhy.data.weighInsValue', { count: trend.weighIns, span }),
      },
    );
  } else {
    lines.push(t('today.coachWhy.noTrend'));
  }

  const leftOut =
    intake.incompleteDays > 0 ? t('today.coachWhy.leftOut', { count: intake.incompleteDays }) : '';
  if (!proteinOnly) {
    if (intake.completeDays > 0) {
      const averaged = t('today.coachWhy.averaged.kcal', {
        count: intake.completeDays,
        avg: tr.number(Math.round(intake.avgKcal)),
        target: tr.number(Math.round(intake.targetKcal)),
      });
      lines.push(leftOut ? `${averaged} ${leftOut}` : averaged);
      data.push(
        {
          label: t('today.coachWhy.data.averageIntake'),
          value: t('today.coachWhy.data.averageIntakeValue.kcal', {
            value: tr.number(Math.round(intake.avgKcal)),
          }),
        },
        {
          label: t('today.coachWhy.data.dailyTarget'),
          value: t('today.coachWhy.data.dailyTargetValue.kcal', {
            value: tr.number(Math.round(intake.targetKcal)),
          }),
        },
      );
    } else {
      const none = t('today.coachWhy.noCompleteDays');
      lines.push(leftOut ? `${none} ${leftOut}` : none);
    }
  } else if (leftOut) {
    lines.push(leftOut);
  }
  data.push({
    label: t('today.coachWhy.data.completeDays'),
    value:
      intake.incompleteDays > 0
        ? t('today.coachWhy.data.completeDaysPartly', {
            complete: intake.completeDays,
            partly: intake.incompleteDays,
          })
        : String(intake.completeDays),
  });

  const decision = decisionLine(tr, e);
  if (!(proteinOnly && decision.kcal)) lines.push(decision.text);
  return { lines, data };
}
