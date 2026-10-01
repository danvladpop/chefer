import { readCatalogFile, type CatalogEntry } from '@chefer/database';
import type { LineProblem } from '@chefer/types';
import {
  computeRecipeNutrition,
  ingredientLookupKeys,
  slugToKey,
  type RecipeNutritionResult,
} from '@chefer/utils';
import type { Ingredient, MealType, RecipeData } from '../../lib/ai/types.js';
import { catalogBySlug } from '../../lib/curated-recipes/computed-nutrition.js';
import { isRecipeSafe, type SafetyPrefs } from '../../lib/curated-recipes/safety.js';
import { roundQuantity } from './macro-reconcile.js';

// ─── AI recipes on the catalog (plan-ingredient-catalog §6.3) ─────────────────
// The model names every ingredient by catalog slug with a quantity; it never
// states nutrition. This module (pure, over the committed catalog.json):
//   - renders the slug list the prompt carries, without rows the table's
//     allergies/restrictions exclude;
//   - validates and computes an AI recipe: a bad slug is fixed only by an
//     EXACT/ALIAS name match (never fuzzy), anything else is a problem line;
//   - fits a recipe to its slot's share of the day target by scaling its
//     quantities (0.6–1.8×) and recomputing.

/** Slot shares of a day's calories (the prompt's ranges, midpoints), normalised per day. */
export const SLOT_KCAL_SHARE: Record<MealType, number> = {
  breakfast: 0.225,
  lunch: 0.325,
  dinner: 0.375,
  snack: 0.125,
};
/** Fit only when the recipe is outside ±10% of its slot target (§6.3). */
export const SLOT_TOLERANCE = 0.1;
export const MIN_SCALE = 0.6;
export const MAX_SCALE = 1.8;

let entries: CatalogEntry[] | null = null;
let aliasIndex: Map<string, string> | null = null;

function catalogEntries(): CatalogEntry[] {
  entries ??= readCatalogFile();
  return entries;
}

/** Lookup key → slug (slug as words first, then aliases): the resolver's EXACT/ALIAS rules. */
function aliases(): Map<string, string> {
  if (!aliasIndex) {
    const idx = new Map<string, string>();
    for (const e of catalogEntries()) idx.set(slugToKey(e.slug), e.slug);
    for (const e of catalogEntries())
      for (const a of e.aliases) if (!idx.has(a.alias)) idx.set(a.alias, e.slug);
    aliasIndex = idx;
  }
  return aliasIndex;
}

/** The slug a free-text name or a mistyped slug resolves to (EXACT/ALIAS only). */
export function resolveSlug(text: string): string | undefined {
  const idx = aliases();
  for (const key of ingredientLookupKeys(text)) {
    const slug = idx.get(key);
    if (slug) return slug;
  }
  return undefined;
}

const slugListCache = new Map<string, string>();

/**
 * The catalog section of a generation prompt: every slug the table may eat,
 * grouped by category ("POULTRY: chicken-breast-raw, …"). Rows a single
 * ingredient of which would fail the table's allergies/restrictions are left
 * out (the same matcher that re-checks every generated dish).
 */
export function catalogSlugList(prefs: SafetyPrefs | null): string {
  const key = JSON.stringify(prefs ?? {});
  const cached = slugListCache.get(key);
  if (cached) return cached;
  const byCategory = new Map<string, string[]>();
  for (const e of catalogEntries()) {
    if (prefs) {
      const asRecipe = {
        name: e.name,
        ingredients: [e.name, ...e.aliases.map((a) => a.alias)].map((name) => ({
          name,
          quantity: 1,
          unit: 'g',
        })),
        instructions: [],
        // Tagged as the table's diets, so only the INGREDIENT patterns decide
        // (a single catalog row carries no diet tags of its own).
        dietaryTags: prefs.dietaryRestrictions.map((r) => r.toLowerCase()),
      };
      if (!isRecipeSafe(asRecipe, { ...prefs, dislikedIngredients: [] })) continue;
    }
    const list = byCategory.get(e.category) ?? [];
    list.push(e.slug);
    byCategory.set(e.category, list);
  }
  const text = [...byCategory]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, slugs]) => `${cat}: ${slugs.join(', ')}`)
    .join('\n');
  if (slugListCache.size > 200) slugListCache.clear();
  slugListCache.set(key, text);
  return text;
}

export interface AiLineProblem {
  lineIndex: number;
  rawName: string;
  slug: string | undefined;
  quantity: number;
  unit: string;
  problem: LineProblem;
}

export interface ComputedAiRecipe {
  /** The recipe with fixed slugs and computed per-serving nutritionInfo. */
  recipe: RecipeData;
  result: RecipeNutritionResult;
  problems: AiLineProblem[];
}

/**
 * Validates and computes an AI recipe against the catalog. A slug the
 * catalog doesn't have is replaced only when the slug text or the line's name
 * resolves EXACT/ALIAS; otherwise the line is a problem (NO_INGREDIENT), as is
 * a unit the row can't convert (NO_DENSITY / NO_PORTION / BAD_UNIT).
 */
export function computeAiRecipe(recipe: RecipeData): ComputedAiRecipe {
  const catalog = catalogBySlug();
  const ingredients: Ingredient[] = recipe.ingredients.map((i) => {
    if (i.slug && catalog.has(i.slug)) return i;
    const fixed = (i.slug && resolveSlug(slugToKey(i.slug))) ?? resolveSlug(i.name);
    return fixed ? { ...i, slug: fixed } : { ...i, slug: undefined };
  });
  const result = computeRecipeNutrition(
    ingredients.map((i) => ({
      ingredientId: i.slug ?? null,
      quantity: i.quantity,
      unit: i.unit,
      optional: i.optional,
    })),
    catalog,
    recipe.servings,
  );
  const problems: AiLineProblem[] = result.lines.flatMap((l) => {
    const line = ingredients[l.position];
    if (!l.problem || l.optional || !line) return [];
    return [
      {
        lineIndex: l.position,
        rawName: line.name,
        slug: line.slug,
        quantity: line.quantity,
        unit: line.unit,
        problem: l.problem,
      },
    ];
  });
  return {
    recipe: { ...recipe, ingredients, nutritionInfo: result.perServing },
    result,
    problems,
  };
}

/**
 * Per-meal kcal targets for one day: the day target split by
 * SLOT_KCAL_SHARE over the meal types the day actually has.
 */
export function slotTargets(dayTargetKcal: number, mealTypes: readonly MealType[]): number[] {
  const total = mealTypes.reduce((s, t) => s + (SLOT_KCAL_SHARE[t] ?? 0.25), 0);
  if (total <= 0 || dayTargetKcal <= 0) return mealTypes.map(() => 0);
  return mealTypes.map((t) => (dayTargetKcal * (SLOT_KCAL_SHARE[t] ?? 0.25)) / total);
}

/**
 * Scales a computed recipe toward its slot target (§6.3): when per-serving
 * kcal is outside ±10% of `targetKcal`, every quantity is multiplied by
 * target/computed (clamped 0.6–1.8), rounded (roundQuantity), and the recipe
 * is recomputed — stored numbers are always the recomputed ones.
 */
export function fitToSlotTarget(recipe: RecipeData, targetKcal: number): RecipeData {
  const current = recipe.nutritionInfo.calories;
  if (targetKcal <= 0 || current <= 0) return recipe;
  if (Math.abs(current - targetKcal) / targetKcal <= SLOT_TOLERANCE) return recipe;
  const factor = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetKcal / current));
  const scaled: RecipeData = {
    ...recipe,
    ingredients: recipe.ingredients.map((i) =>
      i.unit === 'to taste' ? i : { ...i, quantity: roundQuantity(i.quantity * factor, i.unit) },
    ),
  };
  return computeAiRecipe(scaled).recipe;
}
