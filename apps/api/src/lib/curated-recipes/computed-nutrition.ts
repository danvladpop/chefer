import { readCatalogFile } from '@chefer/database';
import {
  computeRecipeNutrition,
  type NutritionIngredient,
  type RecipeNutritionResult,
} from '@chefer/utils';
import type { RecipeData } from '../ai/types.js';

// ─── Curated nutrition, computed (plan-ingredient-catalog §6.2, F5) ───────────
// Every curated fixture line names its catalog row by `slug`. The pool's
// nutrition is computed from the committed catalog.json with the shared engine
// — never the hand-written numbers the fixtures used to carry — so the curated
// planner, rebalance and Discover all read real numbers without a database.
// curated-nutrition.test.ts asserts every curated recipe computes fully.

let bySlug: Map<string, NutritionIngredient> | null = null;

/** The global catalog keyed by slug, in the engine's shape (read once). */
export function catalogBySlug(): Map<string, NutritionIngredient> {
  bySlug ??= new Map(
    readCatalogFile().map((e) => [
      e.slug,
      {
        id: e.slug,
        kcalPer100g: e.kcalPer100g ?? 0,
        proteinPer100g: e.proteinPer100g ?? 0,
        carbsPer100g: e.carbsPer100g ?? 0,
        fatPer100g: e.fatPer100g ?? 0,
        fiberPer100g: e.fiberPer100g ?? 0,
        densityGPerMl: e.densityGPerMl ?? null,
        edibleFraction: e.edibleFraction ?? 1,
        portions: e.portions,
      },
    ]),
  );
  return bySlug;
}

/** Computes a fixture recipe from its lines' slugs (a line without a slug is unresolved). */
export function computeFixtureNutrition(recipe: RecipeData): RecipeNutritionResult {
  return computeRecipeNutrition(
    recipe.ingredients.map((i) => ({
      ingredientId: i.slug ?? null,
      quantity: i.quantity,
      unit: i.unit,
      optional: i.optional,
    })),
    catalogBySlug(),
    recipe.servings,
  );
}

/** The fixture with its nutritionInfo replaced by the computed per-serving numbers. */
export function withComputedNutrition(recipe: RecipeData): RecipeData {
  return { ...recipe, nutritionInfo: computeFixtureNutrition(recipe).perServing };
}
