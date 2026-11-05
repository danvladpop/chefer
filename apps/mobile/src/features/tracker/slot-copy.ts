import type { MessageKey, TArgs } from '@chefer/i18n';
import {
  formatKcal,
  proteinLabel,
  QUICK_ADD_MEAL_TYPES,
  type QuickAddMealType,
} from '@chefer/utils';
import { getTranslator } from '../../lib/i18n';

// Copy and small formatters for the planned-slot actions (WP-06 "Flexible
// eating"): "Ate something else" and "Skipped it". Neutral on purpose — a
// swapped or skipped meal is information, never a failure (Food 2).
//
// Lane J: every string comes from the `tracker.slot` catalog in the current UI
// language. Helpers read the translator when called (during a render, which
// re-runs on a language change), so the screens that import them need no
// change.

function t<K extends MessageKey>(key: K, ...args: TArgs<K>): string {
  return getTranslator().t(key, ...args);
}

export const SLOT_COPY = {
  get ateElse() {
    return t('tracker.slot.ateElse');
  },
  get ateElseHint() {
    return t('tracker.slot.ateElseHint');
  },
  get skipIt() {
    return t('tracker.slot.skipIt');
  },
  get skipItHint() {
    return t('tracker.slot.skipItHint');
  },
  get skippedLabel() {
    return t('tracker.slot.skipped');
  },
  get undo() {
    return t('tracker.slot.undo');
  },
  get remove() {
    return t('tracker.slot.remove');
  },
} as const;

/** `logCustomMeal` takes one of the four meal types; anything older falls back to `snack`. */
export function toLogMealType(mealType: string): QuickAddMealType {
  return (QUICK_ADD_MEAL_TYPES as readonly string[]).includes(mealType)
    ? (mealType as QuickAddMealType)
    : 'snack';
}

const isMealType = (mealType: string): mealType is QuickAddMealType =>
  (QUICK_ADD_MEAL_TYPES as readonly string[]).includes(mealType);

/** "Dinner" — the meal type as a label. */
export function mealLabel(mealType: string): string {
  if (isMealType(mealType)) return t(`tracker.meals.${mealType}`);
  return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

/** The overflow button's accessible name: "More actions for Dinner". */
export function moreActionsLabel(mealType: string): string {
  return t('tracker.slot.moreActions', { meal: mealLabel(mealType) });
}

/**
 * "You had: Shawarma · normal (≈ 650 kcal)" — what stands in for a replaced
 * slot. Protein-only mode (WP-08) says "(≈ 40 g protein)" instead, and just
 * the name when the protein is not known.
 */
export function youHadText(
  entry: { custom?: { name: string } | undefined; kcal: number; protein?: number | undefined },
  proteinOnly = false,
  /** Lane E3 "Hide numbers": just the name. */
  noNumbers = false,
): string {
  const name = entry.custom?.name ?? t('tracker.slot.somethingElse');
  if (noNumbers) return t('tracker.slot.youHad', { name });
  if (proteinOnly) {
    return entry.protein === undefined
      ? t('tracker.slot.youHad', { name })
      : t('tracker.slot.youHadProtein', { name, protein: proteinLabel(entry.protein) });
  }
  return t('tracker.slot.youHadKcal', { name, kcal: formatKcal(entry.kcal) });
}

/** The snackbar after logging a replacement. */
export function replacedMessage(name: string, mealType: string): string {
  return t(`tracker.slot.replaced.${toLogMealType(mealType)}`, { name });
}

/** The snackbar after skipping. No judgement — it just states what happened. */
export function skippedMessage(mealType: string): string {
  return t(`tracker.slot.skippedMeal.${toLogMealType(mealType)}`);
}
