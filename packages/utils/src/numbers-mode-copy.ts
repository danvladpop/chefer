import type { PlanTrainingBasis, PlanTrainingDay } from '@chefer/types';
import { formatNumber } from './format';
import { joinDayNames, trainingKindLabel, weekdayShortName } from './plan-training';
import {
  describeRebalanceSwap,
  type RebalanceSnackLike,
  type RebalanceSwapLike,
} from './rebalance';

// Copy and small formatters for protein-only mode (WP-08). Pure, so every
// surface words the same number the same way.

/**
 * "What do you want to keep an eye on?" (onboarding's goal step and Preferences →
 * Your targets), the same words on web and mobile. NONE is reserved for WP-16
 * and is not offered.
 */
export const NUMBERS_MODE_COPY = {
  question: 'What do you want to keep an eye on?',
  fullTitle: 'Calories and macros',
  fullDetail: 'Calories, protein, carbs and fat on Today and in the tracker.',
  proteinTitle: 'Just protein',
  proteinDetail: 'One number: protein. Your week still balances the rest in the background.',
} as const;

/** How many kcal one gram of protein stands for when only protein was entered. */
export const PROTEIN_ONLY_KCAL_PER_PROTEIN_G = 16;

/**
 * Quick add in protein-only mode asks for protein first. The week's plan still
 * balances calories underneath, so a protein-only entry carries a rough kcal
 * (about 16 kcal per gram of protein, what a mixed diet at ~1.6 g/kg works out
 * to) rather than 0, which would read as a skipped meal.
 */
export function estimateKcalFromProtein(proteinG: number): number {
  // Capped at what one entry can hold (the server's kcal limit).
  return Math.min(5000, Math.round(proteinG * PROTEIN_ONLY_KCAL_PER_PROTEIN_G));
}

/** "32 g protein" — the one number shown in protein-only mode. */
export function proteinLabel(proteinG: number): string {
  return `${formatNumber(Math.round(proteinG))} g protein`;
}

/** "520 kcal" in full mode, "32 g protein" in protein-only mode. */
export function nutritionLabel(
  entry: { kcal: number; protein: number },
  proteinOnly: boolean,
): string {
  return proteinOnly ? proteinLabel(entry.protein) : `${Math.round(entry.kcal)} kcal`;
}

/** "This week you averaged 112 g protein a day" (protein-only weekly average line). */
export function proteinAverageText(avg: { protein: number }): string {
  return `This week you averaged ${formatNumber(Math.round(avg.protein))} g protein a day`;
}

/** "72 of 120 g protein" — the Today ring's accessible name and caption source. */
export function proteinRingLabel(eatenG: number, targetG: number): string {
  return `${formatNumber(Math.round(eatenG))} of ${formatNumber(Math.round(targetG))} g protein`;
}

/**
 * Drops every line that mentions calories from server-written text (the weekly
 * review's text and first line are composed on the API, with kcal figures).
 */
export function withoutKcalLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/\bkcal\b|\bcalor/i.test(line))
    .join('\n')
    .trim();
}

/**
 * The rebalance offer's reason line ("You're about 600 kcal over for the week
 * and 36 g short on protein this week.") with the calorie clause removed.
 * Empty when it was only about calories.
 */
export function proteinOnlyHeadline(headline: string): string {
  const match = /(\d+) g short on protein this week/.exec(headline);
  return match ? `You're ${match[1]} g short on protein this week.` : '';
}

/** One swap without any calorie figure: "Sunday dinner → Chicken bowl (+28 g protein)". */
export function describeSwapProteinOnly(swap: RebalanceSwapLike): string {
  return describeRebalanceSwap({
    ...swap,
    previousKcal: undefined,
    newKcal: undefined,
    explanation: undefined,
    reason: 'protein',
  });
}

/** The rebalance offer line in protein-only mode (the server's own explanation may quote kcal). */
export function proteinOnlyOfferCopy(swaps: readonly RebalanceSwapLike[]): string {
  if (swaps.length === 0) return '';
  return `I can rebalance the rest of your week: ${swaps.map(describeSwapProteinOnly).join('; ')}.`;
}

/** "Greek yogurt with honey (+17 g protein)" — a protein snack without its calories. */
export function describeSnackProteinOnly(snack: RebalanceSnackLike): string {
  return `${snack.name} (+${Math.round(snack.proteinG)} g protein)`;
}

/**
 * The Plan tab's training-day header without calories (protein-only mode):
 * only a lifting day's protein bump is a number; a run day is just named.
 */
export function proteinOnlyTrainingHeader(day: PlanTrainingDay): {
  title: string;
  targetLine: string | null;
  bonusLine: string | null;
  a11yLabel: string;
} {
  const isLift = day.kind === 'lift';
  const title = isLift
    ? `Training day · ${day.workoutName ?? day.dayName}`
    : `${trainingKindLabel(day.kind)} · ${day.dayName}`;
  const showsProtein = isLift && day.applied && day.proteinBonus > 0;
  const targetLine =
    showsProtein && day.targetProteinG !== undefined
      ? `Target ${day.targetProteinG} g protein`
      : null;
  const bonusLine = showsProtein ? `(+${day.proteinBonus} g protein for training)` : null;
  const spokenTitle = isLift
    ? `Training day, ${day.workoutName ?? day.dayName}`
    : `${trainingKindLabel(day.kind)}, ${day.dayName}`;
  const spokenTarget = targetLine ? ` ${targetLine}.` : '';
  return {
    title,
    targetLine,
    bonusLine,
    a11yLabel: `${spokenTitle}.${spokenTarget} Explains why.`,
  };
}

/** The training Explain sheet without calories (protein-only mode). */
export function proteinOnlyTrainingExplain(input: {
  days: readonly PlanTrainingDay[];
  basis: PlanTrainingBasis | null;
}): {
  eyebrow: string;
  title: string;
  sentence: string;
  rows: { label: string; value: string }[];
  footnote: string;
  actionLabel: string;
} {
  const { days, basis } = input;
  const lifts = days.filter((d) => d.kind === 'lift');
  const names = joinDayNames(lifts.map((d) => weekdayShortName(d.dayOfWeek)));
  const first = lifts[0];
  const rows: { label: string; value: string }[] = [];
  if (basis) rows.push({ label: 'Rest-day protein', value: `${basis.restProteinG} g` });
  const withTarget = days.find((d) => d.applied && d.targetProteinG !== undefined);
  if (withTarget?.targetProteinG !== undefined) {
    rows.push({ label: 'Training-day protein', value: `${withTarget.targetProteinG} g` });
  }
  if (basis?.proteinGPerKg != null && lifts.length > 0) {
    rows.push({
      label: `Protein basis (${basis.proteinGPerKg} g per kg, because you train)`,
      value: basis.bodyweightKg != null ? `${basis.bodyweightKg} kg` : '',
    });
  }
  const sentence =
    first && first.proteinBonus > 0
      ? `You train on ${names}. On those days your protein goes up by about ${first.proteinBonus} g, mostly around your workout, to help you recover and build muscle.`
      : first
        ? `You train on ${names}.`
        : 'Your training days do not change your protein target.';
  return {
    eyebrow: 'Why this target',
    title: 'Your training days',
    sentence,
    rows,
    footnote: 'Change your training days in Gym settings.',
    actionLabel: 'Change training days',
  };
}
