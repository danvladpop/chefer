// ─── Manual recipe form helpers (T-40.1, UX-40 slice 1) ────────────────────────
// Pure functions shared by mobile and web so "what's missing" copy and
// quantity parsing never drift between platforms.

export interface RecipeFormIngredientLike {
  name: string;
  /** Parsed quantity — 0/NaN means "no amount yet". */
  quantity: number;
}

export interface RecipeFormMinimum {
  name: string;
  ingredients: RecipeFormIngredientLike[];
}

export type RecipeFormMissingField = 'name' | 'ingredient' | 'incompleteLine';

const isComplete = (i: RecipeFormIngredientLike) =>
  i.name.trim() !== '' && Number.isFinite(i.quantity) && i.quantity > 0;
const isNamedIncomplete = (i: RecipeFormIngredientLike) => i.name.trim() !== '' && !isComplete(i);

/**
 * D-19: the recipe minimum is a name and at least one ingredient LINE with a
 * NAME and an AMOUNT > 0. A named line with no amount is incomplete, not
 * just ignored (AC4): it blocks saving with its own `'incompleteLine'` flag
 * — even alongside another, already-complete line — so nothing typed is
 * silently dropped on submit. Only when NO line has a name at all (every
 * line is blank, or there are no lines) does the generic `'ingredient'`
 * flag apply.
 */
export function recipeMissingFields(recipe: RecipeFormMinimum): RecipeFormMissingField[] {
  const missing: RecipeFormMissingField[] = [];
  if (!recipe.name.trim()) missing.push('name');
  if (recipe.ingredients.some(isNamedIncomplete)) {
    missing.push('incompleteLine');
  } else if (!recipe.ingredients.some(isComplete)) {
    missing.push('ingredient');
  }
  return missing;
}

/** Index (0-based) of the first named-but-amountless line, or null. AC4's "line {n}" is this + 1. */
export function firstIncompleteIngredientLineIndex(
  ingredients: RecipeFormIngredientLike[],
): number | null {
  const index = ingredients.findIndex(isNamedIncomplete);
  return index === -1 ? null : index;
}

/**
 * The footer's "what's missing" sentence (PAT-17: the primary button is
 * never silently disabled — a blocked tap always explains why). `lineNumber`
 * (1-based) names the incomplete line when `missing` includes
 * `'incompleteLine'` and `'name'` isn't also missing — pass
 * `firstIncompleteIngredientLineIndex(...) + 1`.
 */
export function missingSummary(
  missing: RecipeFormMissingField[],
  lineNumber?: number,
): string | null {
  if (missing.length === 0) return null;
  if (missing.includes('incompleteLine') && !missing.includes('name')) {
    return lineNumber != null
      ? `Finish the ingredient on line ${lineNumber}.`
      : 'Add an amount, or remove this line.';
  }
  const parts: string[] = [];
  if (missing.includes('name')) parts.push('a name');
  if (missing.includes('ingredient') || missing.includes('incompleteLine')) {
    parts.push('at least one ingredient with an amount');
  }
  return `Add ${parts.join(' and ')} to save.`;
}

// ─── Quantity parsing (T-BUG-O3 C3, AC 6) ──────────────────────────────────────
// `num()`'s old `parseFloat` turned "½" into 0 (the line then got silently
// filtered out of the save) and "1/2" into 1 (the line doubled).

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

/**
 * Parses a quantity a user might type into an amount field: a plain number
 * ("200"), a comma decimal ("0,5"), a simple fraction ("1/2"), a unicode
 * fraction ("½"), or a mixed number ("1½", "1 1/2"). Returns 0 (never NaN)
 * for empty or unparseable input, so callers can treat it as "no amount"
 * uniformly.
 */
export function parseQuantity(raw: string): number {
  const text = raw.trim();
  if (text === '') return 0;

  // Mixed unicode fraction: "1½" (no space) or "1 ½" (space).
  const mixedUnicode = /^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/.exec(text);
  if (mixedUnicode?.[1] && mixedUnicode[2]) {
    return Number(mixedUnicode[1]) + (UNICODE_FRACTIONS[mixedUnicode[2]] ?? 0);
  }
  // Bare unicode fraction: "½".
  if (text.length === 1 && text in UNICODE_FRACTIONS) {
    return UNICODE_FRACTIONS[text] ?? 0;
  }

  // Mixed simple fraction: "1 1/2".
  const mixedSimple = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (mixedSimple?.[1] && mixedSimple[2] && mixedSimple[3]) {
    const denom = Number(mixedSimple[3]);
    if (denom > 0) return Number(mixedSimple[1]) + Number(mixedSimple[2]) / denom;
  }

  // Simple fraction: "1/2".
  const simple = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (simple?.[1] && simple[2]) {
    const denom = Number(simple[2]);
    if (denom > 0) return Number(simple[1]) / denom;
  }

  // Plain number, comma or dot decimal: "200", "0,5", "1.5".
  const normalised = text.replace(',', '.');
  const n = Number(normalised);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
