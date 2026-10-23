import {
  curatedRecipeDraftRepository,
  ingredientRepository,
  mealPlanRepository,
  recipeLineRepository,
} from '@chefer/database';
import type { ApprovedCuratedDraft, RecipeLineWrite } from '@chefer/database';
import { CURATED_MEAL_TYPES, curatedDraftRecipeSchema } from '@chefer/types';
import {
  SWAP_BREAKFAST_POOL,
  SWAP_DINNER_POOL,
  SWAP_LUNCH_POOL,
  SWAP_SNACK_POOL,
} from '../ai/fixtures/swap-recipes.fixture.js';
import { RECIPE_LIBRARY } from '../ai/fixtures/week-plan.fixture.js';
import type { MealType, NutritionInfo, RecipeData } from '../ai/types.js';
import { computeFixtureNutrition, withComputedNutrition } from './computed-nutrition.js';
import {
  EXTRA_BREAKFAST_POOL,
  EXTRA_DINNER_POOL,
  EXTRA_LUNCH_POOL,
  EXTRA_SNACK_POOL,
} from './extra-pool.js';
import {
  ROMANIAN_BREAKFAST_POOL,
  ROMANIAN_DINNER_POOL,
  ROMANIAN_LUNCH_POOL,
} from './romanian-pool.js';
import { filterSafeRecipes, hasSafetyPrefs, type SafetyPrefs } from './safety.js';
import { VARIETY_BREAKFAST_POOL, VARIETY_DINNER_POOL, VARIETY_LUNCH_POOL } from './variety-pool.js';

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
// The original fixtures ship stock images (imageStatus DONE); the authored
// pools ship none, so their rows are generated once by the image worker, and
// the stored row's image is what clients see (F3, 2026-10-17).

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
    ...ROMANIAN_BREAKFAST_POOL,
    ...VARIETY_BREAKFAST_POOL,
  ].map(curated),
  lunch: [
    R.chickenCaesarSalad,
    R.turkeyWrap,
    R.quinoaBowl,
    ...SWAP_LUNCH_POOL,
    ...EXTRA_LUNCH_POOL,
    ...ROMANIAN_LUNCH_POOL,
    ...VARIETY_LUNCH_POOL,
  ].map(curated),
  dinner: [
    R.herbSalmon,
    R.chickenStirFry,
    R.mediterraneanCod,
    R.lentilCurry,
    ...SWAP_DINNER_POOL,
    ...EXTRA_DINNER_POOL,
    ...ROMANIAN_DINNER_POOL,
    ...VARIETY_DINNER_POOL,
  ].map(curated),
  snack: [
    R.appleAlmondButter,
    R.proteinSmoothie,
    R.mixedNuts,
    ...SWAP_SNACK_POOL,
    ...EXTRA_SNACK_POOL,
  ].map(curated),
};

// ─── Ingested slice (market review F1) ────────────────────────────────────────
// Recipes an admin ingested from a link and APPROVED (curated-ingest service)
// join the fixture pool at runtime. Only APPROVED drafts load — a draft in any
// other state has no recipe row and never reaches a user. Refreshed by
// ensureCuratedRecipes (every caller awaits it before reading the pool) when
// stale or invalidated by a review.

const INGESTED_TTL_MS = 5 * 60_000;

function emptyPools(): Record<MealType, RecipeData[]> {
  return { breakfast: [], lunch: [], dinner: [], snack: [] };
}

let ingestedPools = emptyPools();
let ingestedLoadedAt = 0;
let mergedPools: Record<MealType, RecipeData[]> = CURATED_POOL_BY_TYPE;
let mealTypeById: Map<string, MealType> | null = null;

/** An approved draft as a pool entry; null when its stored draft does not parse. */
export function approvedDraftToRecipeData({
  draft,
  recipe,
}: ApprovedCuratedDraft): RecipeData | null {
  const parsed = curatedDraftRecipeSchema.safeParse(draft.draft);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    id: recipe.id,
    name: d.name,
    description: d.description,
    ingredients: d.ingredients,
    instructions: d.instructions,
    nutritionInfo: recipe.nutritionInfo as unknown as NutritionInfo,
    cuisineType: d.cuisineType,
    dietaryTags: d.dietaryTags,
    prepTimeMins: d.prepTimeMins,
    cookTimeMins: d.cookTimeMins,
    servings: d.servings,
    imageUrl: recipe.imageUrl,
  };
}

/** Sets the ingested slice (exported for tests; production goes through ensureCuratedRecipes). */
export function setIngestedCuratedRecipes(approved: ApprovedCuratedDraft[]): void {
  const pools = emptyPools();
  for (const row of approved) {
    const recipe = approvedDraftToRecipeData(row);
    if (!recipe) continue;
    for (const type of row.draft.mealTypes) {
      if ((CURATED_MEAL_TYPES as readonly string[]).includes(type)) {
        pools[type as MealType].push(recipe);
      }
    }
  }
  ingestedPools = pools;
  ingestedLoadedAt = Date.now();
  mergedPools = {
    breakfast: [...CURATED_POOL_BY_TYPE.breakfast, ...pools.breakfast],
    lunch: [...CURATED_POOL_BY_TYPE.lunch, ...pools.lunch],
    dinner: [...CURATED_POOL_BY_TYPE.dinner, ...pools.dinner],
    snack: [...CURATED_POOL_BY_TYPE.snack, ...pools.snack],
  };
  mealTypeById = null;
}

/** Forces the next ensureCuratedRecipes to reload the ingested slice (after a review). */
export function invalidateIngestedCuratedRecipes(): void {
  ingestedLoadedAt = 0;
}

/** The ingested slice alone, by meal type (coverage report). */
export function ingestedCuratedPools(): Record<MealType, RecipeData[]> {
  return ingestedPools;
}

/** The whole free pool: the authored fixtures plus approved ingested recipes. */
export function curatedPoolByType(): Record<MealType, RecipeData[]> {
  return mergedPools;
}

/** A curated recipe's meal type (its first, when an ingested one fills several). */
export function curatedMealTypeOf(id: string): MealType | undefined {
  if (!mealTypeById) {
    mealTypeById = new Map();
    for (const type of CURATED_MEAL_TYPES) {
      for (const recipe of mergedPools[type]) {
        if (!mealTypeById.has(recipe.id)) mealTypeById.set(recipe.id, type);
      }
    }
  }
  return mealTypeById.get(id);
}

/**
 * Reloads the ingested slice when stale, without the fixture upsert that
 * ensureCuratedRecipes also does — for readers that only need the pool in
 * memory (pantry suggestions). Never throws.
 */
export async function refreshIngestedCuratedRecipes(): Promise<void> {
  await refreshIngested();
}

async function refreshIngested(): Promise<void> {
  if (Date.now() - ingestedLoadedAt < INGESTED_TTL_MS) return;
  try {
    setIngestedCuratedRecipes(await curatedRecipeDraftRepository.findApproved());
  } catch (err) {
    // The fixture pool keeps serving; the next call retries.
    console.warn('[curated-recipes] could not load ingested recipes', err);
  }
}

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
  const pools = curatedPoolByType();
  if (!hasSafetyPrefs(prefs)) return pools;
  return {
    breakfast: filterSafeRecipes(pools.breakfast, prefs),
    lunch: filterSafeRecipes(pools.lunch, prefs),
    dinner: filterSafeRecipes(pools.dinner, prefs),
    snack: filterSafeRecipes(pools.snack, prefs),
  };
}

let ensured = false;

/**
 * Idempotently upserts the curated pool into the recipes table. Called lazily
 * before the first free-tier plan generation of this process — safe to run on
 * an existing dev database (upsert by fixed ID, no destructive operations).
 * Every call also refreshes the ingested slice when it is stale.
 */
export async function ensureCuratedRecipes(): Promise<void> {
  await refreshIngested();
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
      // A stock photo is DONE; a recipe without one is queued for the image
      // worker. A null image never overwrites a stored one (upsertRecipes),
      // so generated and backfilled images survive every restart.
      imageUrl: r.imageUrl ?? null,
      imageStatus: r.imageUrl ? ('DONE' as const) : ('PENDING' as const),
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
