import { mealPlanRepository } from '@chefer/database';
import {
  SWAP_BREAKFAST_POOL,
  SWAP_DINNER_POOL,
  SWAP_LUNCH_POOL,
  SWAP_SNACK_POOL,
} from '../ai/fixtures/swap-recipes.fixture.js';
import { RECIPE_LIBRARY } from '../ai/fixtures/week-plan.fixture.js';
import type { MealType, RecipeData } from '../ai/types.js';

// ─── Curated recipe pool ──────────────────────────────────────────────────────
// Generic, non-personalised recipes served to FREE-tier users. Built from the
// existing AI fixtures (balanced macros, stable Unsplash image URLs) but stored
// under their own deterministic `curated-*` IDs with source=CURATED so they
// never collide with mock-mode fixture rows.
//
// These recipes ship with preset stock images (imageStatus DONE) — the free
// tier never touches the AI image-generation pipeline.

const R = RECIPE_LIBRARY;

function curated(recipe: RecipeData): RecipeData {
  return { ...recipe, id: `curated-${recipe.id}` };
}

export const CURATED_POOL_BY_TYPE: Record<MealType, RecipeData[]> = {
  breakfast: [
    R.greekYogurtParfait,
    R.avocadoToast,
    R.overnightOats,
    R.spinachOmelette,
    ...SWAP_BREAKFAST_POOL,
  ].map(curated),
  lunch: [R.chickenCaesarSalad, R.turkeyWrap, R.quinoaBowl, ...SWAP_LUNCH_POOL].map(curated),
  dinner: [
    R.herbSalmon,
    R.chickenStirFry,
    R.mediterraneanCod,
    R.lentilCurry,
    ...SWAP_DINNER_POOL,
  ].map(curated),
  snack: [R.appleAlmondButter, R.proteinSmoothie, R.mixedNuts, ...SWAP_SNACK_POOL].map(curated),
};

let ensured = false;

/**
 * Idempotently upserts the curated pool into the recipes table. Called lazily
 * before the first free-tier plan generation of this process — safe to run on
 * an existing dev database (upsert by fixed ID, no destructive operations).
 */
export async function ensureCuratedRecipes(): Promise<void> {
  if (ensured) return;

  const all = Object.values(CURATED_POOL_BY_TYPE).flat();
  await mealPlanRepository.upsertRecipes(
    all.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      ingredients: r.ingredients,
      instructions: r.instructions,
      nutritionInfo: r.nutritionInfo,
      cuisineType: r.cuisineType,
      dietaryTags: r.dietaryTags,
      prepTimeMins: r.prepTimeMins,
      cookTimeMins: r.cookTimeMins,
      servings: r.servings,
      imageUrl: r.imageUrl ?? null,
      imageStatus: 'DONE' as const,
      source: 'CURATED' as const,
    })),
  );
  ensured = true;
  console.log(`[curated-recipes] ensured ${all.length} curated recipes`);
}

/** Returns a random curated recipe of the given meal type, optionally excluding one ID. */
export function pickRandomCurated(mealType: MealType, excludeId?: string): RecipeData {
  const pool = CURATED_POOL_BY_TYPE[mealType] ?? CURATED_POOL_BY_TYPE.breakfast;
  const candidates = pool.filter((r) => r.id !== excludeId);
  const source = candidates.length > 0 ? candidates : pool;
  const pick = source[Math.floor(Math.random() * source.length)];
  if (!pick) throw new Error(`No curated recipes available for meal type: ${mealType}`);
  return pick;
}
