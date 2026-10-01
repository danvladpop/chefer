import type { LineProblem, NutritionFacts, NutritionStatus } from '@chefer/types';
import { roundNutritionFacts } from './rounding';
import {
  normalizeRecipeUnit,
  NUTRITION_MASS_UNITS,
  NUTRITION_TINY_UNITS,
  NUTRITION_VOLUME_UNITS,
  type NutritionMassUnit,
  type NutritionTinyUnit,
  type NutritionVolumeUnit,
} from './units';

// ─── Recipe → nutrition (plan-ingredient-catalog §5.2–§5.4) ───────────────────
// Pure arithmetic over catalog data: grams × per-100 g values, summed at full
// precision, with only the per-serving figures rounded. A line whose grams
// cannot be determined is reported with a problem and never filled in with a
// default (I6).

/** What the engine needs from a catalog row (global or private). */
export interface NutritionIngredient {
  id: string;
  kcalPer100g: number;
  proteinPer100g: number;
  /** EU available carbohydrate (fiber excluded, D2). */
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  densityGPerMl?: number | null;
  /** < 1 for purchase-weight rows (bone-in, unpeeled). Applies to mass/volume quantities only. */
  edibleFraction?: number | null;
  /** Edible grams for ONE unit. */
  portions?: readonly { unit: string; grams: number }[];
}

/** A recipe line as the engine sees it. */
export interface NutritionLineInput {
  ingredientId: string | null;
  quantity: number;
  unit: string;
  /** Excluded from totals (garnish, "to serve"). */
  optional?: boolean | undefined;
}

export type IngredientLookup =
  | ReadonlyMap<string, NutritionIngredient>
  | ((id: string) => NutritionIngredient | undefined);

export interface LineGrams {
  /** Edible grams, or null when the line is unresolved. */
  grams: number | null;
  problem?: LineProblem;
  /** `to taste`: resolved at 0 g, shown as negligible. */
  negligible?: boolean;
}

export interface ComputedLine extends LineGrams {
  position: number;
  /** Full-precision facts for this line (zeros when unresolved). */
  facts: NutritionFacts;
  optional: boolean;
}

export interface RecipeNutritionResult {
  /** COMPUTED: every non-optional line resolved. PARTIAL: at least one did not. */
  status: Extract<NutritionStatus, 'COMPUTED' | 'PARTIAL'>;
  /** Whole recipe, full precision, optional lines excluded. */
  total: NutritionFacts;
  /** total ÷ servings, rounded (§5.4). The UI must say "incomplete" when PARTIAL. */
  perServing: NutritionFacts;
  lines: ComputedLine[];
}

const ZERO: NutritionFacts = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

function lookupIngredient(lookup: IngredientLookup, id: string): NutritionIngredient | undefined {
  return typeof lookup === 'function' ? lookup(id) : lookup.get(id);
}

function edible(grams: number, ingredient: NutritionIngredient): number {
  const fraction = ingredient.edibleFraction;
  return fraction != null && fraction > 0 && fraction <= 1 ? grams * fraction : grams;
}

/**
 * Edible grams for one line (§5.2):
 * - mass: qty × factor;
 * - volume: qty × ml × density (no density ⇒ NO_DENSITY);
 * - tiny: fixed grams (`to taste` = 0, negligible);
 * - portion: qty × that ingredient's portion grams (none ⇒ NO_PORTION);
 * - any other unit resolves only if the ingredient defines a portion of that exact name
 *   (a private "bar"), else BAD_UNIT.
 *
 * `edibleFraction` scales mass and volume quantities, which are purchase weight.
 * Portion grams are already edible, so they are not scaled again.
 */
export function lineGrams(
  line: Pick<NutritionLineInput, 'quantity' | 'unit'>,
  ingredient: NutritionIngredient | undefined,
): LineGrams {
  if (!ingredient) return { grams: null, problem: 'NO_INGREDIENT' };
  const qty = line.quantity;
  if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0) {
    return { grams: null, problem: 'BAD_QTY' };
  }

  const { unit, kind } = normalizeRecipeUnit(line.unit);
  switch (kind) {
    case 'mass':
      return { grams: edible(qty * NUTRITION_MASS_UNITS[unit as NutritionMassUnit], ingredient) };
    case 'volume': {
      const density = ingredient.densityGPerMl;
      if (density == null || !(density > 0)) return { grams: null, problem: 'NO_DENSITY' };
      const ml = qty * NUTRITION_VOLUME_UNITS[unit as NutritionVolumeUnit];
      return { grams: edible(ml * density, ingredient) };
    }
    case 'tiny': {
      const grams = qty * NUTRITION_TINY_UNITS[unit as NutritionTinyUnit];
      return unit === 'to taste' ? { grams: 0, negligible: true } : { grams };
    }
    case 'portion':
    case 'unknown': {
      const portion = ingredient.portions?.find((p) => p.unit === unit);
      if (portion && portion.grams > 0) return { grams: qty * portion.grams };
      return { grams: null, problem: kind === 'portion' ? 'NO_PORTION' : 'BAD_UNIT' };
    }
  }
}

function factsFor(grams: number, ingredient: NutritionIngredient): NutritionFacts {
  const k = grams / 100;
  return {
    calories: ingredient.kcalPer100g * k,
    protein: ingredient.proteinPer100g * k,
    carbs: ingredient.carbsPer100g * k,
    fat: ingredient.fatPer100g * k,
    fiber: ingredient.fiberPer100g * k,
  };
}

function add(a: NutritionFacts, b: NutritionFacts): NutritionFacts {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: a.fiber + b.fiber,
  };
}

/**
 * Computes a recipe's nutrition from its lines and the catalog (§5.3).
 * `servings` below 1 or not finite counts as 1, so a half-typed form still
 * previews. Lines keep their input order as `position`.
 */
export function computeRecipeNutrition(
  lines: readonly NutritionLineInput[],
  lookup: IngredientLookup,
  servings: number,
): RecipeNutritionResult {
  let total = ZERO;
  const computed = lines.map((line, position): ComputedLine => {
    const ingredient =
      line.ingredientId != null ? lookupIngredient(lookup, line.ingredientId) : undefined;
    const result = lineGrams(line, ingredient);
    const optional = line.optional === true;
    const facts = ingredient && result.grams != null ? factsFor(result.grams, ingredient) : ZERO;
    if (!optional) total = add(total, facts);
    return { position, ...result, facts, optional };
  });

  const complete = computed.every((l) => l.optional || l.problem === undefined);
  const divisor = Number.isFinite(servings) && servings >= 1 ? servings : 1;
  return {
    status: complete ? 'COMPUTED' : 'PARTIAL',
    total,
    perServing: roundNutritionFacts({
      calories: total.calories / divisor,
      protein: total.protein / divisor,
      carbs: total.carbs / divisor,
      fat: total.fat / divisor,
      fiber: total.fiber / divisor,
    }),
    lines: computed,
  };
}
