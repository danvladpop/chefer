import type { Ingredient } from '../ai/types.js';

// ─── Ingredient-name reconciliation ──────────────────────────────────────────
// Measured on real reels: a caption-only extraction produces CLEANER ingredient
// names than the same extraction with the video in context.
//
//   caption stage │ video stage
//   ──────────────┼───────────────────────────────────────
//   eggs          │ large eggs
//   garlic        │ garlic cloves, minced
//   fresh dill    │ fresh dill, chopped
//
// With the clip in context the model echoes spoken and on-screen phrasing into
// `name`. Those names feed normalizeIngredientName for price lookups and
// shopping-list merging, so the noise is not cosmetic — "garlic cloves, minced"
// and "garlic" are different rows on a shopping list.
//
// The video prompt asks for the caption's wording, but a prompt rule is a
// tendency, not a guarantee. Since stage 1 always runs first, its clean names
// are already in hand — so reconcile deterministically rather than trusting the
// model to have complied. Only NAMES are reconciled: quantities stay with the
// video stage, which legitimately revises them against what it saw.

/** Preparation and size qualifiers that describe handling, not the ingredient. */
const QUALIFIERS = new Set([
  'minced',
  'chopped',
  'diced',
  'sliced',
  'crushed',
  'grated',
  'shredded',
  'beaten',
  'melted',
  'softened',
  'drained',
  'rinsed',
  'peeled',
  'trimmed',
  'finely',
  'roughly',
  'thinly',
  'coarsely',
  'freshly',
  'large',
  'small',
  'medium',
  'extra',
  'boneless',
  'skinless',
]);

/**
 * Crude singulariser — matching only, never used for display. Both sides run
 * through it, so self-consistency matters more than English correctness.
 * "-es" is only stripped after a sibilant ("boxes" → "box"); otherwise a plain
 * "-s" comes off, which is what keeps "cloves" → "clove" rather than "clov".
 */
function singular(word: string): string {
  if (word.length > 3 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && /(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Words that describe the FORM an ingredient is bought or counted in, not a
 * different ingredient. Only these may differ between two names that still
 * refer to the same thing — "garlic" and "garlic clove" are one ingredient,
 * "garlic" and "garlic powder" are two.
 */
const FORM_WORDS = new Set([
  'clove',
  'breast',
  'fillet',
  'tenderloin',
  'thigh',
  'leave',
  'leaf',
  'sprig',
  'stalk',
  'head',
  'bulb',
  'can',
  'piece',
  'slice',
  'bunch',
]);

/**
 * Reduces a name to a comparison key: drops anything after the first comma
 * (that is where preparation lives), removes parentheticals and qualifier
 * words, then singularises what remains.
 */
export function normalizeForMatch(name: string): string {
  const head = name.toLowerCase().split(',')[0] ?? '';
  return head
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !QUALIFIERS.has(w))
    .map(singular)
    .join(' ')
    .trim();
}

/**
 * True when two names denote the same ingredient.
 *
 * Deliberately conservative: a false match silently rewrites an ingredient to
 * the wrong name, which is worse than leaving a slightly noisy one. So beyond
 * an exact key match, the only accepted difference is a trailing FORM_WORD —
 * "garlic clove" ≡ "garlic", but "garlic powder" is its own ingredient.
 */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const [longer, shorter] = na.length > nb.length ? [na, nb] : [nb, na];
  if (!longer.startsWith(`${shorter} `)) return false;
  return longer
    .slice(shorter.length + 1)
    .split(' ')
    .every((word) => FORM_WORDS.has(word));
}

export interface ReconcileResult {
  ingredients: Ingredient[];
  /** Human-readable record of each rename, surfaced to the reviewer. */
  renames: string[];
}

/**
 * Rewrites video-stage ingredient names to their caption-stage wording where
 * the two clearly refer to the same thing. Quantities and units are untouched.
 */
export function reconcileIngredientNames(
  videoIngredients: Ingredient[],
  captionIngredients: Ingredient[],
): ReconcileResult {
  if (captionIngredients.length === 0) {
    return { ingredients: videoIngredients, renames: [] };
  }

  const renames: string[] = [];
  const ingredients = videoIngredients.map((ingredient) => {
    const match = captionIngredients.find((c) => namesMatch(ingredient.name, c.name));
    // Only rewrite when the caption is actually terser — a caption name that
    // is longer is more specific ("chipotle peppers in adobo" over "chipotle"),
    // and clobbering it would lose information.
    if (!match || match.name === ingredient.name || match.name.length >= ingredient.name.length) {
      return ingredient;
    }
    renames.push(`"${ingredient.name}" → "${match.name}"`);
    return { ...ingredient, name: match.name };
  });

  return { ingredients, renames };
}
