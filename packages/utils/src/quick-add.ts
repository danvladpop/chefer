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

export interface QuickAddEntry {
  name: string;
  mealType: QuickAddMealType;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type QuickAddErrors = Partial<Record<'name' | 'kcal' | 'protein' | 'carbs' | 'fat', string>>;

export type QuickAddParseResult =
  | { ok: true; entry: QuickAddEntry }
  | { ok: false; errors: QuickAddErrors };

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
  for (const key of ['protein', 'carbs', 'fat'] as const) {
    const parsed = parseAmount(input[key], QUICK_ADD_LIMITS[key], 'g', false);
    if ('error' in parsed) errors[key] = parsed.error;
    else macros[key] = Math.round(parsed.value * 10) / 10;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, entry: { name, mealType: input.mealType, kcal: kcalValue, ...macros } };
}
