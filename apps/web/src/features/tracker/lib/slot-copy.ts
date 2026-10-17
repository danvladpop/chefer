import { formatKcal, proteinLabel } from '@chefer/utils';

// Plain words for a slot that was replaced or skipped (WP-06). Never judging:
// it says what happened and nothing about whether it was a good idea.

/**
 * "You had: Shawarma · normal (≈ 775 kcal)". Protein-only mode (WP-08) says
 * "(≈ 40 g protein)" instead, and just the name when the protein is not known.
 */
export function youHadLine(
  name: string,
  kcal: number,
  protein?: number,
  proteinOnly = false,
): string {
  if (proteinOnly) {
    return protein === undefined
      ? `You had: ${name}`
      : `You had: ${name} (≈ ${proteinLabel(protein)})`;
  }
  return `You had: ${name} (≈ ${formatKcal(kcal)} kcal)`;
}

export const SKIPPED_LABEL = 'Skipped';
