// ─── Refuel snacks (§2.6, T-06.3) ───────────────────────────────────────────────
// A small curated list of high-protein snacks shown after a workout (the gym
// summary's RefuelCard) and on Today. Every snack carries the ingredient names
// and diet tags the ONE safety filter reads (`isRecipeSafe`,
// apps/api/src/lib/curated-recipes/safety.ts), so the API filters it exactly
// like a recipe before it reaches a client — this module only owns the curated
// data + a pure pick, never the filtering. Tags must be TRUE: a tag is what
// lets a snack through a vegetarian / dairy-free / egg-free / gluten-free
// diet, so only tag what holds for the listed ingredients.

export interface ProteinSnack {
  id: string;
  name: string;
  proteinG: number;
  kcal: number;
  carbsG: number;
  fatG: number;
  /** Ingredient names, matched by the safety filter's allergen and diet patterns. */
  ingredients: readonly string[];
  /** Diet tags this snack honestly satisfies (`vegetarian`, `vegan`, `dairy-free`, `egg-free`, `gluten-free`, `pescatarian`). */
  dietaryTags: readonly string[];
}

export const PROTEIN_SNACKS: readonly ProteinSnack[] = [
  {
    id: 'greek-yogurt',
    name: 'Greek yogurt with honey',
    proteinG: 17,
    kcal: 150,
    carbsG: 12,
    fatG: 4,
    ingredients: ['greek yogurt', 'honey'],
    dietaryTags: ['vegetarian', 'gluten-free', 'egg-free'],
  },
  {
    id: 'cottage-cheese',
    name: 'Cottage cheese with fruit',
    proteinG: 14,
    kcal: 140,
    carbsG: 10,
    fatG: 5,
    ingredients: ['cottage cheese', 'berries'],
    dietaryTags: ['vegetarian', 'gluten-free', 'egg-free'],
  },
  {
    id: 'protein-shake',
    name: 'Protein shake',
    proteinG: 24,
    kcal: 130,
    carbsG: 4,
    fatG: 2,
    ingredients: ['whey protein', 'milk'],
    dietaryTags: ['vegetarian', 'gluten-free', 'egg-free'],
  },
  {
    id: 'boiled-eggs',
    name: 'Two boiled eggs',
    proteinG: 13,
    kcal: 155,
    carbsG: 1,
    fatG: 11,
    ingredients: ['eggs'],
    dietaryTags: ['vegetarian', 'gluten-free', 'dairy-free', 'pescatarian'],
  },
  {
    id: 'turkey-wrap',
    name: 'Turkey slices in a wrap',
    proteinG: 18,
    kcal: 210,
    carbsG: 20,
    fatG: 6,
    ingredients: ['turkey breast', 'wheat tortilla wrap'],
    dietaryTags: ['dairy-free', 'egg-free'],
  },
  {
    id: 'edamame',
    name: 'Edamame',
    proteinG: 11,
    kcal: 120,
    carbsG: 10,
    fatG: 5,
    ingredients: ['edamame soybeans', 'sea salt'],
    dietaryTags: ['vegan', 'vegetarian', 'pescatarian', 'gluten-free', 'dairy-free', 'egg-free'],
  },
  {
    id: 'tuna-toast',
    name: 'Tuna on toast',
    proteinG: 25,
    kcal: 230,
    carbsG: 22,
    fatG: 6,
    ingredients: ['tuna', 'wheat bread'],
    dietaryTags: ['pescatarian', 'dairy-free', 'egg-free'],
  },
  {
    id: 'hummus-pita',
    name: 'Hummus with wholemeal pita',
    proteinG: 12,
    kcal: 220,
    carbsG: 28,
    fatG: 8,
    ingredients: ['chickpeas', 'tahini sesame', 'wheat pita'],
    dietaryTags: ['vegan', 'vegetarian', 'pescatarian', 'dairy-free', 'egg-free'],
  },
  {
    id: 'roasted-chickpeas',
    name: 'Roasted chickpeas',
    proteinG: 10,
    kcal: 140,
    carbsG: 20,
    fatG: 4,
    ingredients: ['chickpeas', 'olive oil'],
    dietaryTags: ['vegan', 'vegetarian', 'pescatarian', 'gluten-free', 'dairy-free', 'egg-free'],
  },
] as const;

/** The first `count` curated snacks (a stable, deterministic pick). */
export function pickProteinSnacks(count = 3): ProteinSnack[] {
  return PROTEIN_SNACKS.slice(0, Math.max(0, count));
}

/**
 * The first `count` of `snacks` (already safety-filtered by the caller), in
 * curated order. Kept separate from `pickProteinSnacks` so the API can
 * filter first and only then take two.
 */
export function takeSnacks<T>(snacks: readonly T[], count = 2): T[] {
  return snacks.slice(0, Math.max(0, count));
}
