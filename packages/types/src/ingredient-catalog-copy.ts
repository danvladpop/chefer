import type { IngredientCategory, NutritionSource } from './nutrition';

// ─── Ingredient catalog + computed nutrition copy (plan-ingredient-catalog §10) ─
// One set of user-facing strings for the catalog picker, the private-ingredient
// sheet, the import review and the recipe-detail nutrition provenance, so web
// and mobile say the same thing. Pure data, no platform imports.

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const INGREDIENT_CATALOG_COPY = {
  status: {
    /** COMPUTED: every line resolved against the catalog. */
    computedFrom: (n: number) => `Computed from ${n} ${plural(n, 'ingredient', 'ingredients')}`,
    /** PARTIAL: some lines have no grams or no catalog row. */
    incomplete: (n: number) =>
      `Incomplete — ${n} ${plural(n, 'ingredient needs', 'ingredients need')} data`,
    /** USER_ENTERED: an old client's typed numbers, kept under D4. */
    userEntered: 'Entered by you',
    /** Short badge text for list cards. */
    incompleteBadge: 'Incomplete',
    userEnteredBadge: 'Entered by you',
    caveat: 'Computed from standard food data, not a lab measurement.',
    fix: 'Fix ingredients',
    showBreakdown: 'Show per ingredient',
    hideBreakdown: 'Hide per ingredient',
    needsData: 'needs data',
    optional: 'optional, not counted',
    notVisible: 'Private ingredient',
    userEnteredOnEdit:
      'You typed these numbers yourself. Saving computes them from the ingredients instead.',
  },
  picker: {
    title: 'Add ingredient',
    placeholder: 'Search ingredient…',
    allCategories: 'All',
    yourIngredients: 'YOUR INGREDIENTS',
    catalog: 'CHEFER CATALOG',
    searching: 'Searching…',
    noMatches: 'No matches in the catalog.',
    createAsMine: (text: string) => `Create "${text}" as my ingredient`,
    createAsMineEmpty: 'Create my own ingredient',
    pickMatch: 'Pick a match',
    pickMatchHint: (raw: string) => `"${raw}" isn't linked to an ingredient yet.`,
    noMatchFound: (raw: string) => `No match for "${raw}" yet. Search, or create your own.`,
    searchInstead: 'Search',
    perHundred: (kcal: number) => `${Math.round(kcal)} kcal / 100 g`,
  },
  unit: {
    groups: { Weight: 'Weight', Volume: 'Volume', Portions: 'Portions', Other: 'Other' },
    notUsable: (unit: string, name: string) =>
      `"${unit}" has no weight for ${name}. Pick another unit.`,
  },
  custom: {
    title: 'New ingredient',
    description:
      'Only you can see this ingredient. Copy the values per 100 g from the package label.',
    name: 'Name',
    category: 'Category',
    categoryPlaceholder: 'Choose a category (optional)',
    nutritionHeading: 'Nutrition per 100 g',
    kcal: 'kcal',
    protein: 'Protein g',
    carbs: 'Carbs g',
    fat: 'Fat g',
    fiber: 'Fiber g',
    carbsHint: 'Carbs without fiber, as on EU labels.',
    allRequired: 'Fill in all five values from the label.',
    gramsPerPiece: 'One piece weighs (g)',
    gramsPerPieceHint: 'optional, lets you count it in pieces',
    gramsPer100ml: '100 ml weighs (g)',
    gramsPer100mlHint: 'optional, lets you measure it in ml, spoons or cups',
    save: 'Save ingredient',
    saving: 'Saving…',
    conflictTitle: (name: string) => `Chefer already has "${name}"`,
    conflictBody: 'Use the catalog row, so the numbers come from verified food data.',
    useIt: 'Use it',
    mineIsDifferent: 'No, mine is different',
  },
  importReview: {
    title: 'Ingredients to check',
    body: 'These lines have no nutrition data yet. Pick a match or create your own ingredient.',
    allMatched: 'Every ingredient is matched. Nutrition is computed from them.',
    unitProblem: (unit: string) =>
      `No weight for "${unit}" on this ingredient. Save, then fix the unit in Edit.`,
    matchedTo: (name: string) => `Matched to ${name}`,
    change: 'Change',
    saveIncompleteTitle: 'Save with incomplete nutrition?',
    saveIncompleteBody: (n: number) =>
      `${n} ${plural(n, 'ingredient has', 'ingredients have')} no nutrition data, so the numbers will be too low. You can fix it later in Edit.`,
    saveIncompleteConfirm: 'Save anyway',
    saveIncompleteCancel: 'Keep checking',
    nutritionNote: 'Nutrition is computed from the matched ingredients.',
  },
  form: {
    lineNeedsMatch: 'Pick this ingredient from the list, or remove the line.',
    lineNeedsUnit: 'Pick a unit this ingredient can be measured in.',
    missingMatch: (line: number) => `Pick a match for the ingredient on line ${line}.`,
    missingUnit: (line: number) => `Pick a unit for the ingredient on line ${line}.`,
  },
} as const;

/** Display labels for the catalog taxonomy (§4.2), used by the picker's category chips. */
export const INGREDIENT_CATEGORY_LABELS: Record<IngredientCategory, string> = {
  VEGETABLE: 'Vegetables',
  FRUIT: 'Fruit',
  HERB_FRESH: 'Fresh herbs',
  SPICE_DRIED: 'Spices',
  LEGUME: 'Legumes',
  GRAIN_CEREAL: 'Grains',
  FLOUR_BAKING: 'Flour & baking',
  PASTA_NOODLE: 'Pasta',
  BREAD_BAKERY: 'Bread',
  NUT_SEED: 'Nuts & seeds',
  BEEF: 'Beef',
  PORK: 'Pork',
  LAMB_GOAT: 'Lamb & goat',
  POULTRY: 'Poultry',
  GAME: 'Game',
  PROCESSED_MEAT: 'Cured meat',
  FISH: 'Fish',
  SEAFOOD: 'Seafood',
  EGG: 'Eggs',
  DAIRY_MILK: 'Milk',
  DAIRY_CHEESE: 'Cheese',
  DAIRY_YOGURT_CREAM: 'Yogurt & cream',
  PLANT_PROTEIN: 'Plant protein',
  PLANT_MILK: 'Plant milk',
  OIL_FAT: 'Oils & fats',
  CONDIMENT_SAUCE: 'Sauces',
  VINEGAR: 'Vinegar',
  SWEETENER: 'Sweeteners',
  CANNED_JARRED: 'Canned',
  PICKLED_FERMENTED: 'Pickled',
  STOCK_BROTH: 'Stock',
  BEVERAGE: 'Drinks',
  ALCOHOL_COOKING: 'Cooking alcohol',
  SUPPLEMENT: 'Supplements',
  SNACK_PREPARED: 'Prepared',
  OTHER: 'Other',
};

/**
 * The short list of categories the picker offers as chips, in the order a cook
 * reaches for them. The full taxonomy stays searchable; a short row of chips
 * scrolls without burying the results.
 */
export const INGREDIENT_PICKER_CATEGORIES: readonly IngredientCategory[] = [
  'VEGETABLE',
  'FRUIT',
  'POULTRY',
  'BEEF',
  'PORK',
  'FISH',
  'DAIRY_CHEESE',
  'DAIRY_MILK',
  'EGG',
  'GRAIN_CEREAL',
  'LEGUME',
  'SPICE_DRIED',
  'OIL_FAT',
  'CONDIMENT_SAUCE',
];

/** Source badge text (plan §10): USDA / CIQUAL / Label / Mine. */
export const NUTRITION_SOURCE_LABELS: Record<NutritionSource, string> = {
  USDA_FDC: 'USDA',
  CIQUAL: 'CIQUAL',
  LABEL: 'Label',
  USER: 'Mine',
  ADMIN: 'Chefer',
};
