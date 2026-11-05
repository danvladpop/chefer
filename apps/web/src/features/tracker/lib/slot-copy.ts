import { createTranslator, type Translator } from '@chefer/i18n';
import { formatKcal, proteinLabel } from '@chefer/utils';

// Plain words for a slot that was replaced or skipped (WP-06). Never judging:
// it says what happened and nothing about whether it was a good idea.
//
// Lane J: pass the screen's `t` (from `useT()`) to get the UI language; without
// it the line is English, as before.

const english = createTranslator('en').t;

/**
 * "You had: Shawarma · normal (≈ 775 kcal)". Protein-only mode (WP-08) says
 * "(≈ 40 g protein)" instead, and just the name when the protein is not known.
 */
export function youHadLine(
  name: string,
  kcal: number,
  protein?: number,
  proteinOnly = false,
  /** Lane E3 "Hide numbers": just the name. */
  noNumbers = false,
  t: Translator['t'] = english,
): string {
  if (noNumbers) return t('tracker.slot.youHad', { name });
  if (proteinOnly) {
    return protein === undefined
      ? t('tracker.slot.youHad', { name })
      : t('tracker.slot.youHadProtein', { name, protein: proteinLabel(protein) });
  }
  return t('tracker.slot.youHadKcal', { name, kcal: formatKcal(kcal) });
}

/** "Skipped" in English; screens with a translator use `skippedLabel(t)`. */
export const SKIPPED_LABEL = 'Skipped';

export const skippedLabel = (t: Translator['t']): string => t('tracker.slot.skipped');
