import { QUICK_ADD_LIMITS } from './quick-add';

// ─── Hidden fat on photo scans (lane A3) ─────────────────────────────────────
// A photo can't see the oil or butter a dish was cooked in. A 2026 study found
// photo-logging apps underestimate meals by about 250–345 kcal and about 30 g
// of fat. After a Snap-to-Log estimate the user says roughly how much was
// used, and the fat (and its calories) is added on top — still an estimate,
// and labelled as one.

export type HiddenFatLevel = 'none' | 'a-little' | 'a-lot';

/** Fat in grams per answer: a little ≈ 1 tbsp of oil, a lot ≈ 2½ tbsp. */
export const HIDDEN_FAT_GRAMS: Record<HiddenFatLevel, number> = {
  none: 0,
  'a-little': 14,
  'a-lot': 35,
};

/** kcal per gram of fat. */
const KCAL_PER_G_FAT = 9;

export const HIDDEN_FAT_OPTIONS: { level: HiddenFatLevel; label: string }[] = [
  { level: 'none', label: 'None' },
  { level: 'a-little', label: 'A little' },
  { level: 'a-lot', label: 'A lot' },
];

export const HIDDEN_FAT_COPY = {
  question: 'Cooked with oil or butter?',
  hint: 'Photos can’t see it, and it often adds 100–300 kcal.',
  addedLine: (kcal: number, fat: number) =>
    `+${kcal} kcal and ${fat} g fat for the oil or butter (estimate)`,
} as const;

/** The extra a level adds. */
export function hiddenFatExtra(level: HiddenFatLevel): { kcal: number; fat: number } {
  const fat = HIDDEN_FAT_GRAMS[level];
  return { kcal: fat * KCAL_PER_G_FAT, fat };
}

/** An estimate with the hidden fat added, capped at what one entry may hold. */
export function withHiddenFat<T extends { kcal: number; fat: number }>(
  numbers: T,
  level: HiddenFatLevel,
): T {
  const extra = hiddenFatExtra(level);
  return {
    ...numbers,
    kcal: Math.min(QUICK_ADD_LIMITS.kcal, numbers.kcal + extra.kcal),
    fat: Math.min(QUICK_ADD_LIMITS.fat, Math.round((numbers.fat + extra.fat) * 10) / 10),
  };
}
