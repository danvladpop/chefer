import { formatKcal, QUICK_ADD_MEAL_TYPES, type QuickAddMealType } from '@chefer/utils';
import { proteinLabel } from '../numbers-mode/numbers-mode-copy';

// Copy and small formatters for the planned-slot actions (WP-06 "Flexible
// eating"): "Ate something else" and "Skipped it". Neutral on purpose — a
// swapped or skipped meal is information, never a failure (Food 2).

export const SLOT_COPY = {
  ateElse: 'Ate something else',
  ateElseHint: 'Log what you had instead of the planned meal',
  skipIt: 'Skipped it',
  skipItHint: 'Take this meal off today without logging anything',
  skippedLabel: 'Skipped',
  undo: 'Undo',
  remove: 'Remove',
} as const;

/** `logCustomMeal` takes one of the four meal types; anything older falls back to `snack`. */
export function toLogMealType(mealType: string): QuickAddMealType {
  return (QUICK_ADD_MEAL_TYPES as readonly string[]).includes(mealType)
    ? (mealType as QuickAddMealType)
    : 'snack';
}

/** "Dinner" — the meal type as a label. */
export function mealLabel(mealType: string): string {
  return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

/** The overflow button's accessible name: "More actions for Dinner". */
export function moreActionsLabel(mealType: string): string {
  return `More actions for ${mealLabel(mealType)}`;
}

/**
 * "You had: Shawarma · normal (≈ 650 kcal)" — what stands in for a replaced
 * slot. Protein-only mode (WP-08) says "(≈ 40 g protein)" instead, and just
 * the name when the protein is not known.
 */
export function youHadText(
  entry: { custom?: { name: string } | undefined; kcal: number; protein?: number | undefined },
  proteinOnly = false,
): string {
  const name = entry.custom?.name ?? 'Something else';
  if (proteinOnly) {
    return entry.protein === undefined
      ? `You had: ${name}`
      : `You had: ${name} (≈ ${proteinLabel(entry.protein)})`;
  }
  return `You had: ${name} (≈ ${formatKcal(entry.kcal)} kcal)`;
}

/** The snackbar after logging a replacement. */
export function replacedMessage(name: string, mealType: string): string {
  return `Logged ${name} for ${mealLabel(mealType).toLowerCase()}`;
}

/** The snackbar after skipping. No judgement — it just states what happened. */
export function skippedMessage(mealType: string): string {
  return `${mealLabel(mealType)} skipped`;
}
