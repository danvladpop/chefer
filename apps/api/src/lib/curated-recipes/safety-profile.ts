import { SAFETY_TAXONOMY } from '@chefer/types';
import { evaluateRestriction, isRecipeSafe, type SafetyCheckable } from './safety.js';

// ─── Curated safety profile (market review F1/F2) ─────────────────────────────
// The curated pool is filtered STRICTLY (safety.ts): a diet only admits a
// recipe that carries its tag AND has clean ingredients. So an ingested
// recipe's diet tags must be derived from its ingredients at approval — a
// missing tag hides it from that diet, a wrong one would be caught by the
// ingredient check but is still a lie on the card. The same helpers describe
// the pool for the coverage report, as users are actually served.

/** Every diet tag the strict matcher reads (RESTRICTION_RULES `anyTag` values). */
export const CURATED_DIET_TAGS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'gluten-free',
  'egg-free',
  'dairy-free',
  'keto',
  'paleo',
] as const;

/** The allergies a user can pick today (taxonomy order). */
export const CURATED_ALLERGY_ENTRIES = SAFETY_TAXONOMY.filter(
  (e) => e.group === 'allergy' && !e.hiddenForNewPicks,
);

/** The diets a user can pick (taxonomy order). */
export const CURATED_DIET_ENTRIES = SAFETY_TAXONOMY.filter((e) => e.group === 'diet');

const NO_PREFS = { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] };

/**
 * The diet tags the recipe's own ingredients prove (keto also needs its
 * computed net carbs). Pescatarian is only added to a dish that is not already
 * vegetarian, whose tag admits pescatarians anyway.
 */
export function deriveCuratedDietTags(recipe: SafetyCheckable): string[] {
  const derive = { deriveFromIngredients: true } as const;
  const proven = CURATED_DIET_TAGS.filter((diet) => {
    const verdict = evaluateRestriction({ ...recipe, dietaryTags: [] }, diet, derive);
    return verdict?.status === 'pass' && verdict.verified;
  });
  return proven.filter((tag) => tag !== 'pescatarian' || !proven.includes('vegetarian'));
}

/** The stored tags: the admin's non-diet tags kept, every diet tag replaced by what is proven. */
export function finaliseDietaryTags(
  claimed: readonly string[],
  derived: readonly string[],
): string[] {
  const diet = new Set<string>(CURATED_DIET_TAGS);
  const kept = claimed.map((t) => t.trim().toLowerCase()).filter((t) => t && !diet.has(t));
  return [...new Set([...derived, ...kept])];
}

export interface CuratedSafetyProfile {
  /** Allergy ids the recipe is safe for. */
  freeFrom: string[];
  /** Allergy ids it contains. */
  contains: string[];
  /** Diet ids whose (strict) filter admits it. */
  diets: string[];
}

/** How the recipe fares for every pickable allergy and diet, as the pool filters it. */
export function curatedSafetyProfile(recipe: SafetyCheckable): CuratedSafetyProfile {
  const freeFrom: string[] = [];
  const contains: string[] = [];
  for (const entry of CURATED_ALLERGY_ENTRIES) {
    const safe = isRecipeSafe(recipe, { ...NO_PREFS, allergies: [entry.label] });
    (safe ? freeFrom : contains).push(entry.id);
  }
  const diets = CURATED_DIET_ENTRIES.filter((entry) =>
    isRecipeSafe(recipe, { ...NO_PREFS, dietaryRestrictions: [entry.id] }),
  ).map((e) => e.id);
  return { freeFrom, contains, diets };
}

export interface HiddenAllergen {
  /** The ingredient line as written. */
  line: string;
  /** The catalog row it resolved to. */
  catalogName: string;
  /** The allergy or diet its catalog name trips but its written name does not. */
  term: string;
}

/**
 * Lines whose written name hides an allergen the catalog row reveals ("pesto"
 * → "Pesto, basil, with pine nuts and parmesan"; "spaghetti" → "Pasta, dry
 * (wheat)"). The pool matches the written recipe at serving time, so when the
 * recipe as written passes a check that its catalog names fail, the lines
 * responsible must be renamed before approval. A conflict the written recipe
 * already shows (its name says "pasta") hides nothing.
 */
export function findHiddenAllergens(
  recipe: SafetyCheckable,
  catalogNames: readonly (string | null)[],
): HiddenAllergen[] {
  const reveal = (line: SafetyCheckable['ingredients'][number], k: number) => {
    const catalogName = catalogNames[k];
    return catalogName ? { ...line, name: `${line.name} (${catalogName})` } : line;
  };
  const revealed: SafetyCheckable = { ...recipe, ingredients: recipe.ingredients.map(reveal) };
  const lineAlone = (line: SafetyCheckable['ingredients'][number]): SafetyCheckable => ({
    name: '',
    instructions: [],
    dietaryTags: [],
    ingredients: [line],
  });
  const derive = { deriveFromIngredients: true } as const;
  const checks = [
    ...CURATED_ALLERGY_ENTRIES.map((entry) => ({
      term: entry.label,
      passes: (r: SafetyCheckable) => isRecipeSafe(r, { ...NO_PREFS, allergies: [entry.label] }),
    })),
    ...(['vegetarian', 'vegan'] as const).map((diet) => ({
      term: diet,
      passes: (r: SafetyCheckable) =>
        evaluateRestriction({ ...r, dietaryTags: [] }, diet, derive)?.status !== 'fail',
    })),
  ];

  const found: HiddenAllergen[] = [];
  for (const { term, passes } of checks) {
    if (!passes(recipe) || passes(revealed)) continue;
    recipe.ingredients.forEach((line, k) => {
      const catalogName = catalogNames[k];
      if (catalogName && passes(lineAlone(line)) && !passes(lineAlone(reveal(line, k)))) {
        found.push({ line: line.name, catalogName, term });
      }
    });
  }
  return found;
}
