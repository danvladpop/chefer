import type { IngredientCategory, LineProblem, NutritionSource } from '@chefer/types';
import {
  normalizeRecipeUnit,
  NUTRITION_MASS_UNITS,
  NUTRITION_TINY_UNITS,
  NUTRITION_VOLUME_UNITS,
} from './units';

// ─── Ingredient picker + nutrition status helpers (plan-ingredient-catalog §10) ─
// Pure and shared so the web and mobile recipe forms offer the same units for a
// picked ingredient and say the same thing about computed nutrition.

/** What the unit list needs from a picked catalog row (search/resolve/getMany shape). */
export interface PickerUnitSource {
  hasDensity: boolean;
  portions: readonly { unit: string }[];
}

const MASS = Object.keys(NUTRITION_MASS_UNITS);
const VOLUME = Object.keys(NUTRITION_VOLUME_UNITS);
const TINY = Object.keys(NUTRITION_TINY_UNITS);

/**
 * The units a recipe line on this ingredient can be measured in without
 * guessing (I6):
 * - mass (`g`, `kg`, `oz`, `lb`) always;
 * - volume (`ml` … `cup`) only when the row has a density;
 * - that row's own portions ("clove", "medium", "bar");
 * - tiny amounts (`pinch`, `dash`, `to taste`), which have fixed weights.
 *
 * Order: grams first, the row's portions next (the natural unit for countable
 * items), then volume, then the rest. With no ingredient picked yet, every
 * generic unit is offered.
 */
export function ingredientUnitOptions(ingredient: PickerUnitSource | null | undefined): string[] {
  if (!ingredient) return ['g', 'kg', ...VOLUME, 'piece', ...TINY, 'oz', 'lb'];
  const portions = [...new Set(ingredient.portions.map((p) => p.unit))];
  const volume = ingredient.hasDensity ? VOLUME : [];
  return [
    ...new Set([
      'g',
      'kg',
      ...portions,
      ...volume,
      ...TINY,
      ...MASS.filter((u) => u !== 'g' && u !== 'kg'),
    ]),
  ];
}

/** Whether `unit` (any spelling: "grams", "cloves") converts to grams for this ingredient. */
export function isUnitAllowedFor(
  unit: string,
  ingredient: PickerUnitSource | null | undefined,
): boolean {
  if (!ingredient) return false;
  const canonical = normalizeRecipeUnit(unit).unit;
  return ingredientUnitOptions(ingredient).includes(canonical);
}

/**
 * The unit a line keeps when its ingredient changes: the current one (in
 * canonical form) when the new ingredient can convert it, otherwise grams.
 */
export function unitForPickedIngredient(currentUnit: string, ingredient: PickerUnitSource): string {
  const canonical = normalizeRecipeUnit(currentUnit).unit;
  return currentUnit.trim() && isUnitAllowedFor(canonical, ingredient) ? canonical : 'g';
}

/** "Nutrition is computed from 7 ingredients" (recipe detail, form preview). */
export function nutritionComputedCopy(lineCount: number): string {
  return `Nutrition is computed from ${lineCount} ingredient${lineCount === 1 ? '' : 's'}`;
}

/** "Incomplete — 2 ingredients need data" (PARTIAL). */
export function nutritionIncompleteCopy(missingCount: number): string {
  return `Incomplete — ${missingCount} ingredient${missingCount === 1 ? ' needs' : 's need'} data`;
}

/** USER_ENTERED: an old client's typed numbers, kept because its lines did not all resolve (D4). */
export const NUTRITION_USER_ENTERED_COPY = 'Entered by you';

/** What a recipe-line problem asks the user to do, in a few words. */
export function lineProblemCopy(problem: LineProblem): string {
  switch (problem) {
    case 'NO_INGREDIENT':
      return 'Pick a match from the catalog';
    case 'NO_DENSITY':
      return 'Can’t be measured by volume — use grams';
    case 'NO_PORTION':
      return 'No weight known for this unit — use grams';
    case 'BAD_UNIT':
      return 'Unknown unit — pick one from the list';
    case 'BAD_QTY':
      return 'Enter an amount';
  }
}

/** Short source badge for a catalog row: USDA / CIQUAL / Label / Mine (plan §10). */
export function nutritionSourceLabel(
  source: NutritionSource,
  owner?: 'global' | 'mine' | null,
): string {
  if (owner === 'mine' || source === 'USER') return 'Mine';
  switch (source) {
    case 'USDA_FDC':
      return 'USDA';
    case 'CIQUAL':
      return 'CIQUAL';
    case 'LABEL':
      return 'Label';
    case 'ADMIN':
      return 'Chefer';
  }
}

/** Human labels for the catalog categories (picker chips, Ingredients page filter). */
export const INGREDIENT_CATEGORY_LABELS: Record<IngredientCategory, string> = {
  VEGETABLE: 'Vegetables',
  FRUIT: 'Fruit',
  HERB_FRESH: 'Fresh herbs',
  SPICE_DRIED: 'Spices',
  LEGUME: 'Legumes',
  GRAIN_CEREAL: 'Grains',
  FLOUR_BAKING: 'Flour & baking',
  PASTA_NOODLE: 'Pasta & noodles',
  BREAD_BAKERY: 'Bread',
  NUT_SEED: 'Nuts & seeds',
  BEEF: 'Beef',
  PORK: 'Pork',
  LAMB_GOAT: 'Lamb & goat',
  POULTRY: 'Poultry',
  GAME: 'Game',
  PROCESSED_MEAT: 'Cured & processed meat',
  FISH: 'Fish',
  SEAFOOD: 'Seafood',
  EGG: 'Eggs',
  DAIRY_MILK: 'Milk',
  DAIRY_CHEESE: 'Cheese',
  DAIRY_YOGURT_CREAM: 'Yogurt & cream',
  PLANT_PROTEIN: 'Plant protein',
  PLANT_MILK: 'Plant milk',
  OIL_FAT: 'Oils & fats',
  CONDIMENT_SAUCE: 'Condiments & sauces',
  VINEGAR: 'Vinegar',
  SWEETENER: 'Sweeteners',
  CANNED_JARRED: 'Canned & jarred',
  PICKLED_FERMENTED: 'Pickled & fermented',
  STOCK_BROTH: 'Stock & broth',
  BEVERAGE: 'Drinks',
  ALCOHOL_COOKING: 'Cooking alcohol',
  SUPPLEMENT: 'Supplements',
  SNACK_PREPARED: 'Snacks & prepared',
  OTHER: 'Other',
};

/**
 * The category chips the picker shows first, most-used first. The rest stay
 * reachable through the Ingredients page filter and search.
 */
export const PICKER_CATEGORY_CHIPS: readonly IngredientCategory[] = [
  'VEGETABLE',
  'FRUIT',
  'POULTRY',
  'BEEF',
  'PORK',
  'FISH',
  'SEAFOOD',
  'EGG',
  'DAIRY_CHEESE',
  'DAIRY_MILK',
  'DAIRY_YOGURT_CREAM',
  'GRAIN_CEREAL',
  'PASTA_NOODLE',
  'LEGUME',
  'NUT_SEED',
  'HERB_FRESH',
  'SPICE_DRIED',
  'OIL_FAT',
  'CONDIMENT_SAUCE',
  'FLOUR_BAKING',
  'BREAD_BAKERY',
  'SWEETENER',
  'CANNED_JARRED',
  'PLANT_PROTEIN',
];
