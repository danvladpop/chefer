import { formatKcal } from '@chefer/utils';

// Plain words for a slot that was replaced or skipped (WP-06). Never judging:
// it says what happened and nothing about whether it was a good idea.

/** "You had: Shawarma · normal (≈ 775 kcal)". */
export function youHadLine(name: string, kcal: number): string {
  return `You had: ${name} (≈ ${formatKcal(kcal)} kcal)`;
}

export const SKIPPED_LABEL = 'Skipped';
