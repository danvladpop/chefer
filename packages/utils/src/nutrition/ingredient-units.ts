import type { IngredientCategory, NutritionStatus } from '@chefer/types';
import type { NutritionIngredient, RecipeNutritionResult } from './compute';
import { normalizeRecipeUnit, NUTRITION_PORTION_UNITS } from './units';

// ─── Per-ingredient unit choices for the recipe-line pickers (plan §10) ───────
// The picker only offers units the shared engine can turn into grams for THAT
// ingredient, so a picked line never comes back PARTIAL for a unit reason:
// - mass units always;
// - volume units only when the row has a density;
// - the row's own portions ("clove", "medium", a private "bar");
// - the fixed tiny amounts (pinch, to taste).
// Pure, shared by web and mobile.

/** What the unit helpers need from a catalog row (search, resolve and getMany all carry it). */
export interface UnitCapableIngredient {
  portions: readonly { unit: string; grams: number }[];
  hasDensity: boolean;
  category?: IngredientCategory | undefined;
}

export type IngredientUnitGroupLabel = 'Weight' | 'Volume' | 'Portions' | 'Other';

export interface IngredientUnitGroup {
  label: IngredientUnitGroupLabel;
  units: string[];
}

export const INGREDIENT_MASS_UNIT_OPTIONS = ['g', 'kg'] as const;
export const INGREDIENT_VOLUME_UNIT_OPTIONS = ['ml', 'l', 'tsp', 'tbsp', 'cup'] as const;
export const INGREDIENT_TINY_UNIT_OPTIONS = ['pinch', 'to taste'] as const;

const PORTION_ORDER = new Map<string, number>(NUTRITION_PORTION_UNITS.map((u, i) => [u, i]));

/** The ingredient's portion units, in the shared portion order (unknown names last, A→Z). */
function portionUnits(ingredient: UnitCapableIngredient): string[] {
  const units = new Set<string>();
  for (const p of ingredient.portions) {
    if (!(p.grams > 0)) continue;
    // A portion named like a mass/volume unit ("cup") is computed through the
    // density instead, so it never appears twice.
    const kind = normalizeRecipeUnit(p.unit).kind;
    if (kind === 'portion' || kind === 'unknown') units.add(p.unit);
  }
  return [...units].sort((a, b) => {
    const ia = PORTION_ORDER.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = PORTION_ORDER.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ia - ib || a.localeCompare(b);
  });
}

/** Unit choices for one ingredient, grouped for a select sheet. Empty groups are dropped. */
export function ingredientUnitGroups(ingredient: UnitCapableIngredient): IngredientUnitGroup[] {
  const groups: IngredientUnitGroup[] = [
    { label: 'Weight', units: [...INGREDIENT_MASS_UNIT_OPTIONS] },
    { label: 'Volume', units: ingredient.hasDensity ? [...INGREDIENT_VOLUME_UNIT_OPTIONS] : [] },
    { label: 'Portions', units: portionUnits(ingredient) },
    { label: 'Other', units: [...INGREDIENT_TINY_UNIT_OPTIONS] },
  ];
  return groups.filter((g) => g.units.length > 0);
}

/** Flat list of {@link ingredientUnitGroups}. */
export function ingredientUnitOptions(ingredient: UnitCapableIngredient): string[] {
  return ingredientUnitGroups(ingredient).flatMap((g) => g.units);
}

/**
 * True when the engine can turn `unit` into grams for this ingredient (any
 * spelling: "cloves" → clove, "grams" → g). Mirrors `lineGrams` (§5.2).
 */
export function isUnitUsableForIngredient(
  unit: string,
  ingredient: UnitCapableIngredient,
): boolean {
  const { unit: canonical, kind } = normalizeRecipeUnit(unit);
  switch (kind) {
    case 'mass':
    case 'tiny':
      return true;
    case 'volume':
      return ingredient.hasDensity;
    case 'portion':
    case 'unknown':
      return ingredient.portions.some((p) => p.unit === canonical && p.grams > 0);
  }
}

const LIQUID_CATEGORIES = new Set<IngredientCategory>([
  'DAIRY_MILK',
  'PLANT_MILK',
  'BEVERAGE',
  'STOCK_BROTH',
  'ALCOHOL_COOKING',
]);
const SPOON_CATEGORIES = new Set<IngredientCategory>(['OIL_FAT', 'VINEGAR']);
const COUNTED_CATEGORIES = new Set<IngredientCategory>([
  'EGG',
  'FRUIT',
  'VEGETABLE',
  'BREAD_BAKERY',
]);
const COUNT_PREFERENCE = ['piece', 'medium', 'clove', 'slice', 'large', 'small'];

/**
 * The unit a freshly picked line starts with: what a cook would naturally
 * measure this row in, and always one of {@link ingredientUnitOptions}.
 * - eggs, fruit, vegetables and bread with a count portion → piece / medium / clove …;
 * - milk, drinks and stock with a density → ml; oils and vinegar → tbsp;
 * - everything else → g.
 */
export function defaultUnitForIngredient(ingredient: UnitCapableIngredient): string {
  const category = ingredient.category;
  if (category && COUNTED_CATEGORIES.has(category)) {
    const portions = new Set(ingredient.portions.filter((p) => p.grams > 0).map((p) => p.unit));
    const counted = COUNT_PREFERENCE.find((u) => portions.has(u));
    if (counted) return counted;
  }
  if (category && ingredient.hasDensity) {
    if (LIQUID_CATEGORIES.has(category)) return 'ml';
    if (SPOON_CATEGORIES.has(category)) return 'tbsp';
  }
  return 'g';
}

/**
 * The unit a line keeps when its ingredient changes: the current one when the
 * new row can measure it, otherwise the new row's default. Typed amounts are
 * never converted, so a cook sees exactly what changed.
 */
export function unitForPickedIngredient(
  currentUnit: string,
  ingredient: UnitCapableIngredient,
  { keepDefault = false }: { keepDefault?: boolean } = {},
): string {
  const current = currentUnit.trim();
  // A brand-new line still on the form's starting "g" takes the row's natural unit.
  if (!keepDefault && (current === '' || current === 'g')) {
    return defaultUnitForIngredient(ingredient);
  }
  return current !== '' && isUnitUsableForIngredient(current, ingredient)
    ? current
    : defaultUnitForIngredient(ingredient);
}

// ─── getMany detail → engine input ────────────────────────────────────────────

/** The `ingredients.getMany` row shape the live preview needs. */
export interface CatalogIngredientNutritionDetail {
  id: string;
  per100g: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  densityGPerMl: number | null;
  edibleFraction?: number | null | undefined;
  portions: readonly { unit: string; grams: number }[];
}

/** Maps a `getMany` row to what `computeRecipeNutrition` reads. */
export function nutritionIngredientFromDetail(
  detail: CatalogIngredientNutritionDetail,
): NutritionIngredient {
  return {
    id: detail.id,
    kcalPer100g: detail.per100g.calories,
    proteinPer100g: detail.per100g.protein,
    carbsPer100g: detail.per100g.carbs,
    fatPer100g: detail.per100g.fat,
    fiberPer100g: detail.per100g.fiber,
    densityGPerMl: detail.densityGPerMl,
    edibleFraction: detail.edibleFraction ?? null,
    portions: detail.portions,
  };
}

/** Lines that count toward the totals but contributed no grams (the "N need data" figure). */
export function incompleteLineCount(result: Pick<RecipeNutritionResult, 'lines'>): number {
  return result.lines.filter((l) => !l.optional && l.problem !== undefined).length;
}

/** Status of a stored recipe's numbers, or null for a pre-catalog API that sends none. */
export function parseNutritionStatus(value: unknown): NutritionStatus | null {
  return value === 'COMPUTED' || value === 'PARTIAL' || value === 'USER_ENTERED' ? value : null;
}
