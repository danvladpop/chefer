import type { RecipeData } from '../../lib/ai/types.js';
import {
  addMacros,
  normalizeIngredientName,
  quantityToGrams,
  type ComputedNutrition,
} from '../../lib/ingredient-prices/index.js';
import type { MacroVocabularyRow } from '../../lib/recipe-import/macro-check.js';

// ─── AI recipe macro reconciliation (audit F-REC-2-4) ─────────────────────────
// Models hit the calorie target by STATING numbers, not by sizing portions:
// six premium dinners were "exactly 1100 kcal" while their ingredients came
// to ~390. We recompute each AI recipe from its ingredients (the per-100 g
// macro vocabulary) and, when the stated calories drift more than 25%, scale
// the ingredient quantities toward the stated calories — so the recipe really
// delivers what the plan promises — and restate every macro from the scaled
// ingredients. Scaling is bounded (0.6×–1.8×); beyond that the honest,
// computed numbers win over the target. Pure: the caller supplies the rows.

/** Share of ingredient lines the vocabulary must cover before we override the AI. */
const MIN_COVERAGE = 0.7;
const DRIFT_TOLERANCE = 0.25;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.8;

export type ReconcileAction = 'kept' | 'scaled' | 'unknown';

export interface ReconcileResult {
  recipe: RecipeData;
  action: ReconcileAction;
  /** Computed kcal per serving before scaling (null when unknown). */
  computedCalories: number | null;
}

function computePerServing(
  recipe: RecipeData,
  rows: Map<string, MacroVocabularyRow>,
): { nutrition: ComputedNutrition; matched: number } {
  const total: ComputedNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  let matched = 0;
  for (const line of recipe.ingredients) {
    const row = rows.get(normalizeIngredientName(line.name));
    if (!row) continue;
    const grams = quantityToGrams(line.quantity, line.unit, row.gramsPerPiece);
    if (grams === null) continue;
    if (addMacros(total, row, grams)) matched += 1;
  }
  const servings = Math.max(1, recipe.servings);
  return {
    nutrition: {
      calories: total.calories / servings,
      protein: total.protein / servings,
      carbs: total.carbs / servings,
      fat: total.fat / servings,
      fiber: total.fiber / servings,
    },
    matched,
  };
}

/** Rounds a scaled quantity to something a cook would measure. */
export function roundQuantity(quantity: number, unit: string): number {
  const u = unit.toLowerCase().trim();
  if (/^(g|ml|gram|grams)\b/.test(u)) {
    return quantity >= 20 ? Math.round(quantity / 5) * 5 : Math.max(1, Math.round(quantity));
  }
  if (/^(tsp|tbsp|teaspoon|tablespoon|cup)/.test(u)) {
    return Math.max(0.25, Math.round(quantity * 4) / 4);
  }
  return Math.max(0.5, Math.round(quantity * 2) / 2);
}

export function reconcileRecipeMacros(
  recipe: RecipeData,
  vocabulary: MacroVocabularyRow[] | Map<string, MacroVocabularyRow>,
): ReconcileResult {
  const rows =
    vocabulary instanceof Map ? vocabulary : new Map(vocabulary.map((r) => [r.ingredientName, r]));
  const lines = recipe.ingredients.length;
  const { nutrition, matched } = computePerServing(recipe, rows);
  if (lines === 0 || matched / lines < MIN_COVERAGE || nutrition.calories <= 0) {
    return { recipe, action: 'unknown', computedCalories: null };
  }

  const stated = recipe.nutritionInfo.calories;
  const computed = nutrition.calories;
  if (stated > 0 && Math.abs(stated - computed) / computed <= DRIFT_TOLERANCE) {
    return { recipe, action: 'kept', computedCalories: Math.round(computed) };
  }

  const factor = Math.min(MAX_SCALE, Math.max(MIN_SCALE, stated > 0 ? stated / computed : 1));
  const ingredients = recipe.ingredients.map((line) => ({
    ...line,
    quantity: roundQuantity(line.quantity * factor, line.unit),
  }));
  const scaled = { ...recipe, ingredients };
  // Restate from the rounded quantities so the label matches the recipe.
  const after = computePerServing(scaled, rows).nutrition;
  return {
    recipe: {
      ...scaled,
      nutritionInfo: {
        calories: Math.round(after.calories),
        protein: Math.round(after.protein),
        carbs: Math.round(after.carbs),
        fat: Math.round(after.fat),
        fiber: Math.round(after.fiber),
      },
    },
    action: 'scaled',
    computedCalories: Math.round(computed),
  };
}
