import type { ExtractedRecipe } from '../ai/types.js';
import {
  addMacros,
  normalizeIngredientName,
  quantityToGrams,
  type ComputedNutrition,
} from '../ingredient-prices/index.js';

// ─── Macro cross-check (F5) ───────────────────────────────────────────────────
// The AI's per-serving calorie estimate is sanity-checked against the
// ingredient macro vocabulary (IngredientPrice per-100g macros). >25%
// disagreement flags the estimate as uncertain in the preview. Pure — the
// caller supplies the vocabulary rows, so this is unit-testable without a DB.

/** Fraction of ingredient lines that must match the vocabulary before the
 *  computed number is trusted enough to dispute the AI. */
const MIN_COVERAGE = 0.5;
const DISAGREEMENT_THRESHOLD = 0.25;

export interface MacroVocabularyRow {
  ingredientName: string;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  gramsPerPiece: number | null;
}

export interface MacroCheckResult {
  /** 'ok' — within 25%; 'uncertain' — >25% off; 'unknown' — vocabulary covers
   *  too few ingredients to judge. */
  status: 'ok' | 'uncertain' | 'unknown';
  /** Vocabulary-computed kcal per serving (null when status is 'unknown'). */
  computedCaloriesPerServing: number | null;
  statedCaloriesPerServing: number;
  matchedLines: number;
  totalLines: number;
}

export function crossCheckMacros(
  recipe: ExtractedRecipe,
  vocabulary: MacroVocabularyRow[],
): MacroCheckResult {
  const stated = recipe.nutritionInfo.calories;
  const totalLines = recipe.ingredients.length;
  const rowMap = new Map(vocabulary.map((row) => [row.ingredientName, row]));

  const total: ComputedNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  let matched = 0;
  for (const line of recipe.ingredients) {
    const row = rowMap.get(normalizeIngredientName(line.name));
    if (!row) continue;
    const grams = quantityToGrams(line.quantity, line.unit, row.gramsPerPiece);
    if (grams === null) continue;
    if (addMacros(total, row, grams)) matched += 1;
  }

  const base: Pick<MacroCheckResult, 'statedCaloriesPerServing' | 'matchedLines' | 'totalLines'> = {
    statedCaloriesPerServing: stated,
    matchedLines: matched,
    totalLines,
  };

  const servings = Math.max(1, recipe.servings);
  if (totalLines === 0 || matched / totalLines < MIN_COVERAGE || total.calories <= 0) {
    return { ...base, status: 'unknown', computedCaloriesPerServing: null };
  }

  const computed = Math.round(total.calories / servings);
  if (stated <= 0) {
    return { ...base, status: 'uncertain', computedCaloriesPerServing: computed };
  }
  const disagreement = Math.abs(computed - stated) / stated;
  return {
    ...base,
    status: disagreement > DISAGREEMENT_THRESHOLD ? 'uncertain' : 'ok',
    computedCaloriesPerServing: computed,
  };
}
