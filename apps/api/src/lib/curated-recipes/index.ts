import { ingredientRepository, mealPlanRepository, recipeLineRepository } from '@chefer/database';
import type { RecipeLineWrite } from '@chefer/database';
import {
  SWAP_BREAKFAST_POOL,
  SWAP_DINNER_POOL,
  SWAP_LUNCH_POOL,
  SWAP_SNACK_POOL,
} from '../ai/fixtures/swap-recipes.fixture.js';
import { RECIPE_LIBRARY } from '../ai/fixtures/week-plan.fixture.js';
import type { MealType, RecipeData } from '../ai/types.js';
import { computeFixtureNutrition, withComputedNutrition } from './computed-nutrition.js';
import {
  EXTRA_BREAKFAST_POOL,
  EXTRA_DINNER_POOL,
  EXTRA_LUNCH_POOL,
  EXTRA_SNACK_POOL,
} from './extra-pool.js';
import { filterSafeRecipes, hasSafetyPrefs, type SafetyPrefs } from './safety.js';

export {
  deriveDietTags,
  deriveTagQualifiers,
  filterSafeRecipes,
  findLabelCaveats,
  findSafetyBlockers,
  findSafetyIssues,
  hasSafetyPrefs,
  isRecipeSafe,
  type SafetyBlocker,
  type SafetyCheckable,
  type SafetyPrefs,
} from './safety.js';

// ─── Curated recipe pool ──────────────────────────────────────────────────────
// Generic, non-personalised recipes served to FREE-tier users. Built from the
// existing AI fixtures (balanced macros, stable Unsplash image URLs) but stored
// under their own deterministic `curated-*` IDs with source=CURATED so they
// never collide with mock-mode fixture rows.
//
// These recipes ship with preset stock images (imageStatus DONE) — the free
// tier never touches the AI image-generation pipeline.

const R = RECIPE_LIBRARY;

// Nutrition is computed from the catalog (computed-nutrition.ts), not taken
// from the fixture: every fixture line carries its catalog `slug`.
function curated(recipe: RecipeData): RecipeData {
  return { ...withComputedNutrition(recipe), id: `curated-${recipe.id}` };
}

export const CURATED_POOL_BY_TYPE: Record<MealType, RecipeData[]> = {
  breakfast: [
    R.greekYogurtParfait,
    R.avocadoToast,
    R.overnightOats,
    R.spinachOmelette,
    ...SWAP_BREAKFAST_POOL,
    ...EXTRA_BREAKFAST_POOL,
  ].map(curated),
  lunch: [
    R.chickenCaesarSalad,
    R.turkeyWrap,
    R.quinoaBowl,
    ...SWAP_LUNCH_POOL,
    ...EXTRA_LUNCH_POOL,
  ].map(curated),
  dinner: [
    R.herbSalmon,
    R.chickenStirFry,
    R.mediterraneanCod,
    R.lentilCurry,
    ...SWAP_DINNER_POOL,
    ...EXTRA_DINNER_POOL,
  ].map(curated),
  snack: [
    R.appleAlmondButter,
    R.proteinSmoothie,
    R.mixedNuts,
    ...SWAP_SNACK_POOL,
    ...EXTRA_SNACK_POOL,
  ].map(curated),
};

/**
 * Minimum SAFE recipes a meal type must keep after filtering for a free plan
 * to generate — below this the week would be too repetitive to feel usable,
 * so the caller shows the contextual upgrade prompt instead (P1-2).
 */
export const MIN_SAFE_POOL_SIZE = 3;

/**
 * The curated pool filtered by the user's safety preferences. Returns every
 * meal type's safe subset; callers decide what to do when a type falls below
 * MIN_SAFE_POOL_SIZE.
 */
export function safeCuratedPools(prefs: SafetyPrefs | null): Record<MealType, RecipeData[]> {
  if (!hasSafetyPrefs(prefs)) return CURATED_POOL_BY_TYPE;
  return {
    breakfast: filterSafeRecipes(CURATED_POOL_BY_TYPE.breakfast, prefs),
    lunch: filterSafeRecipes(CURATED_POOL_BY_TYPE.lunch, prefs),
    dinner: filterSafeRecipes(CURATED_POOL_BY_TYPE.dinner, prefs),
    snack: filterSafeRecipes(CURATED_POOL_BY_TYPE.snack, prefs),
  };
}

let ensured = false;
let warmed = false;

/**
 * Fire-and-forget warm-up of the Pollinations-backed curated images. The
 * first request for each URL generates the image (~20s) and lands it in
 * Pollinations' CDN; every later request is a ~150ms cache hit. Without this,
 * the first free plan a user ever generates shows a wall of broken images
 * until reload. Low concurrency on purpose — parallel cold generations get
 * rate-limited (429), which is exactly the broken-image case again.
 */
function warmCuratedImages(): void {
  if (warmed) return;
  warmed = true;
  const urls = Object.values(CURATED_POOL_BY_TYPE)
    .flat()
    .map((r) => r.imageUrl)
    .filter((u): u is string => Boolean(u?.includes('image.pollinations.ai')));
  void (async () => {
    for (const url of urls) {
      try {
        await fetch(url, { signal: AbortSignal.timeout(60_000) });
      } catch {
        // Best-effort: a failed warm just means that image warms on first view.
      }
    }
    console.log(`[curated-recipes] warmed ${urls.length} pool images`);
  })();
}

/**
 * Idempotently upserts the curated pool into the recipes table. Called lazily
 * before the first free-tier plan generation of this process — safe to run on
 * an existing dev database (upsert by fixed ID, no destructive operations).
 */
export async function ensureCuratedRecipes(): Promise<void> {
  warmCuratedImages();
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
  await syncCuratedLines(all);
  ensured = true;
  console.log(`[curated-recipes] ensured ${all.length} curated recipes`);
}

/** Field-wise compare: Postgres jsonb reorders keys, so a JSON string compare never matches. */
function sameFacts(stored: unknown, facts: Record<string, number>): boolean {
  if (typeof stored !== 'object' || stored === null) return false;
  const s = stored as Record<string, unknown>;
  return Object.entries(facts).every(([k, v]) => s[k] === v);
}

/**
 * Gives every curated DB row its catalog lines and computed nutrition
 * (plan-ingredient-catalog §6.2, §7): the fixture is authoritative for CURATED
 * rows, so a row whose stored state differs is rewritten through the one line
 * write path. Rows already matching are skipped. If the catalog is not synced
 * into this database yet, the pool keeps working and the sync is retried on
 * the next process start.
 */
async function syncCuratedLines(all: RecipeData[]): Promise<void> {
  const slugs = [
    ...new Set(all.flatMap((r) => r.ingredients.flatMap((i) => (i.slug ? [i.slug] : [])))),
  ];
  const ids = await ingredientRepository.findGlobalIdsBySlugs(slugs);
  const missing = slugs.filter((s) => !ids.has(s));
  if (missing.length > 0) {
    console.warn(
      `[curated-recipes] catalog not synced (${missing.length} slugs missing, e.g. ${missing.slice(0, 3).join(', ')}); curated lines not written — run pnpm ingredients:sync`,
    );
    return;
  }
  const states = new Map(
    (await recipeLineRepository.findNutritionStates(all.map((r) => r.id))).map((s) => [s.id, s]),
  );
  let written = 0;
  for (const recipe of all) {
    const result = computeFixtureNutrition(recipe);
    const state = states.get(recipe.id);
    const upToDate =
      state?.nutritionStatus === result.status &&
      state.lineCount === recipe.ingredients.length &&
      sameFacts(state.nutritionInfo, result.perServing);
    if (!state || upToDate) continue;
    const lines: RecipeLineWrite[] = recipe.ingredients.map((i, k) => ({
      ingredientId: i.slug ? (ids.get(i.slug) ?? null) : null,
      rawName: i.name,
      quantity: i.quantity,
      unit: i.unit,
      grams: result.lines[k]?.grams ?? null,
      note: i.note ?? null,
      optional: i.optional ?? false,
    }));
    await recipeLineRepository.writeLines(recipe.id, lines, {
      status: result.status,
      perServing: result.perServing,
      total: result.total,
    });
    written += 1;
  }
  if (written > 0)
    console.log(`[curated-recipes] wrote catalog lines for ${written} curated recipes`);
}

/**
 * Returns a random curated recipe of the given meal type, optionally excluding
 * one ID. Pass `prefs` to draw only from the user's safe subset — returns
 * null when nothing safe remains (caller shows the upgrade prompt).
 */
export function pickRandomCurated(
  mealType: MealType,
  excludeId?: string,
  prefs?: SafetyPrefs | null,
): RecipeData | null {
  const pools = safeCuratedPools(prefs ?? null);
  const pool = pools[mealType] ?? pools.breakfast;
  if (pool.length === 0) return null;
  const candidates = pool.filter((r) => r.id !== excludeId);
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(Math.random() * source.length)] ?? null;
}
