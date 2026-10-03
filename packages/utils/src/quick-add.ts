import { formatKcal } from './format';

// ─── Tracker quick add (F4, all tiers) ────────────────────────────────────────
// One parser for the manual quick-add form, mirroring the API's
// tracker.logCustomMeal bounds, so an out-of-range number is explained inline
// instead of bouncing off the server as a zod error.

export const QUICK_ADD_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type QuickAddMealType = (typeof QUICK_ADD_MEAL_TYPES)[number];

/** Upper bounds — match tracker.router.ts logCustomMeal. */
export const QUICK_ADD_LIMITS = {
  nameMaxLength: 200,
  kcal: 5000,
  protein: 500,
  carbs: 1000,
  fat: 500,
} as const;

export interface QuickAddInput {
  name: string;
  mealType: QuickAddMealType;
  kcal: string;
  protein?: string | undefined;
  carbs?: string | undefined;
  fat?: string | undefined;
}

export type QuickAddMacroKey = 'protein' | 'carbs' | 'fat';

export interface QuickAddEntry {
  name: string;
  mealType: QuickAddMealType;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /**
   * UX-FOOD-11: macros the user left blank. They are stored as 0 g (older
   * clients read plain numbers) but flagged here so the day's rows and the
   * edit sheet can tell "unknown" from "0 g", and the sanity check skips them.
   * Absent when every macro was entered.
   */
  unknownMacros?: QuickAddMacroKey[];
}

export type QuickAddErrors = Partial<Record<'name' | 'kcal' | 'protein' | 'carbs' | 'fat', string>>;

export type QuickAddParseResult =
  | { ok: true; entry: QuickAddEntry }
  | { ok: false; errors: QuickAddErrors };

export const QUICK_ADD_MACRO_KEYS = [
  'protein',
  'carbs',
  'fat',
] as const satisfies readonly QuickAddMacroKey[];

const NUMBER_RE = /^\d+([.,]\d+)?$/;

function parseAmount(
  text: string | undefined,
  max: number,
  unit: string,
  required: boolean,
): { value: number } | { error: string } {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') {
    return required ? { error: 'Enter the calories.' } : { value: 0 };
  }
  if (!NUMBER_RE.test(trimmed)) return { error: 'Use a plain number.' };
  const value = Number(trimmed.replace(',', '.'));
  if (value > max) return { error: `Max ${max} ${unit}.` };
  return { value };
}

/**
 * Validates a quick-add form. kcal is required and must be above zero
 * (rounded to a whole number); macros are optional grams, 0.1 g precision.
 */
export function parseQuickAdd(input: QuickAddInput): QuickAddParseResult {
  const errors: QuickAddErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = 'Name what you ate.';
  else if (name.length > QUICK_ADD_LIMITS.nameMaxLength) {
    errors.name = `Keep it under ${QUICK_ADD_LIMITS.nameMaxLength} characters.`;
  }

  const kcal = parseAmount(input.kcal, QUICK_ADD_LIMITS.kcal, 'kcal', true);
  let kcalValue = 0;
  if ('error' in kcal) errors.kcal = kcal.error;
  else {
    kcalValue = Math.round(kcal.value);
    if (kcalValue <= 0) errors.kcal = 'Calories must be above 0.';
  }

  const macros = { protein: 0, carbs: 0, fat: 0 };
  const unknownMacros: QuickAddMacroKey[] = [];
  for (const key of QUICK_ADD_MACRO_KEYS) {
    if ((input[key] ?? '').trim() === '') unknownMacros.push(key);
    const parsed = parseAmount(input[key], QUICK_ADD_LIMITS[key], 'g', false);
    if ('error' in parsed) errors[key] = parsed.error;
    else macros[key] = Math.round(parsed.value * 10) / 10;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    entry: {
      name,
      mealType: input.mealType,
      kcal: kcalValue,
      ...macros,
      ...(unknownMacros.length > 0 && { unknownMacros }),
    },
  };
}

// ─── Macro sanity check (bug B-39, T-19.5) ─────────────────────────────────────
// A quick add or an edited entry can have macros that don't add up to the
// stated calories (a typo, or numbers copied from two different sources).
// Rather than silently store poisoned data (which then feeds charts and the
// coach), the sheet shows an amber "These don't add up" line with `Fix` /
// `Log anyway` — this is advisory only, never a hard block (B-39 AC).

/** kcal per gram, the 4/4/9 rule. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Tolerance before the sanity line shows (±25% of the stated calories). */
export const MACRO_SANITY_TOLERANCE = 0.25;

/** Below this many stated calories the check is skipped — too easy to false-positive. */
const MACRO_SANITY_MIN_KCAL = 30;

export interface MacroSanityResult {
  ok: boolean;
  /** kcal the macros imply via the 4/4/9 rule, rounded. */
  impliedKcal: number;
  /** "These don't add up: 100 kcal logged, but the macros add up to 620 kcal." */
  message: string | null;
}

/**
 * Checks a logged/edited entry's macros against its stated calories using the
 * 4/4/9 rule, ±25% tolerance. Entries with no macros at all (quick add is
 * calories-only by default) are always fine — there's nothing to disagree.
 * UX-FOOD-11: so are entries with ANY macro left blank (`unknownMacros`) —
 * calories + protein alone can't be compared to a 4/4/9 total, and counting
 * the blanks as 0 g used to flag "400 kcal, 20 g protein" as a typo.
 */
export function checkMacroSanity(entry: {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  unknownMacros?: readonly QuickAddMacroKey[] | undefined;
}): MacroSanityResult {
  const impliedKcal = Math.round(
    entry.protein * KCAL_PER_G.protein +
      entry.carbs * KCAL_PER_G.carbs +
      entry.fat * KCAL_PER_G.fat,
  );
  const noMacros = entry.protein === 0 && entry.carbs === 0 && entry.fat === 0;
  const partial = (entry.unknownMacros?.length ?? 0) > 0;
  if (noMacros || partial || entry.kcal < MACRO_SANITY_MIN_KCAL) {
    return { ok: true, impliedKcal, message: null };
  }
  const diff = Math.abs(entry.kcal - impliedKcal) / entry.kcal;
  if (diff <= MACRO_SANITY_TOLERANCE) return { ok: true, impliedKcal, message: null };
  return {
    ok: false,
    impliedKcal,
    message: `These don't add up: ${formatKcal(entry.kcal)} kcal logged, but the macros add up to ${formatKcal(impliedKcal)} kcal.`,
  };
}

/**
 * "7.5" below 10 g (one decimal — small amounts matter, e.g. a supplement
 * scoop), "24" at or above 10 g (whole grams — false precision above that
 * point). Used by the quick-add and edit-entry sheets for every macro field.
 */
export function formatQuickAddGrams(grams: number): string {
  return grams < 10 ? grams.toFixed(1).replace(/\.0$/, '.0') : String(Math.round(grams));
}

// ─── Ingredient grams (UX-FOOD-09) ────────────────────────────────────────────
// 99,999 g of banana previewed "88999 kcal" and the server (kcal ≤ 5000) just
// rejected it. The grams field is clamped to what one entry can hold.

/** Hard ceiling for one ingredient entry, whatever its density. */
export const INGREDIENT_GRAMS_MAX = 5000;

type Per100g = { calories: number; protein: number; carbs: number; fat: number };

/** Most grams one log entry can hold: every macro and the kcal stay within QUICK_ADD_LIMITS. */
export function maxIngredientGrams(per100g: Per100g): number {
  const caps = [
    [per100g.calories, QUICK_ADD_LIMITS.kcal],
    [per100g.protein, QUICK_ADD_LIMITS.protein],
    [per100g.carbs, QUICK_ADD_LIMITS.carbs],
    [per100g.fat, QUICK_ADD_LIMITS.fat],
  ] as const;
  let max = INGREDIENT_GRAMS_MAX;
  for (const [per100, limit] of caps) {
    if (per100 > 0) max = Math.min(max, Math.floor((limit / per100) * 100));
  }
  return Math.max(max, 1);
}

/** Parses the grams field ("100", "7,5") and clamps it to `[0, maxIngredientGrams]`. */
export function clampIngredientGrams(
  text: string,
  per100g: Per100g,
): { grams: number; clamped: boolean; max: number } {
  const max = maxIngredientGrams(per100g);
  const parsed = Math.max(0, Math.round(Number(text.replace(',', '.')) || 0));
  return { grams: Math.min(parsed, max), clamped: parsed > max, max };
}
