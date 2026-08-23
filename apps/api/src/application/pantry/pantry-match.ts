import { isStapleIngredient } from './staples.js';

// ─── Pantry ↔ ingredient matching (F3, pure) ─────────────────────────────────
// Shared by the shopping-list subtraction, the generation personalisation
// ("uses 4 things you already have"), the coach savings figure and the chat
// `whatCanIMake` tool — one matching rule everywhere.

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Loose-but-bounded name match: exact normalized equality, or one whole name
 * containing the other ("tomato" covers "cherry tomatoes", "chicken breast"
 * covers "chicken"). Terms under 3 chars never match by containment.
 */
export function namesMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length === 0 || nb.length === 0) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (shorter.length < 3) return false;
  // Whole-word containment ("pepper" must not cover "peppermint"), tolerant
  // of simple plurals on either side (tomato ↔ tomatoes).
  const variants = new Set([shorter]);
  if (shorter.endsWith('es')) variants.add(shorter.slice(0, -2));
  if (shorter.endsWith('s')) variants.add(shorter.slice(0, -1));
  return [...variants].some(
    (variant) =>
      variant.length >= 3 &&
      new RegExp(`(^|\\s)${escapeRegExp(variant)}(s|es)?($|\\s)`).test(longer),
  );
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns a matcher closing over the user's pantry names: given an ingredient
 * name it returns the matching pantry name, or null when the pantry does not
 * cover it. Staples are never "covered" — they are not tracked at all.
 */
export function buildPantryMatcher(
  pantryNames: string[],
): (ingredientName: string) => string | null {
  const names = pantryNames.map(normalize).filter((n) => n.length > 0);
  return (ingredientName: string) => {
    if (isStapleIngredient(ingredientName)) return null;
    return names.find((pantryName) => namesMatch(pantryName, ingredientName)) ?? null;
  };
}

// ─── Recipe ranking for `whatCanIMake` ───────────────────────────────────────

export interface CandidateRecipe {
  name: string;
  ingredients: { name: string }[];
}

export interface PantryRecipeMatch {
  name: string;
  /** Pantry-covered, non-staple ingredient names (recipe's wording). */
  matched: string[];
  /** Non-staple ingredients the user would still need. */
  missing: string[];
  /** matched / (matched + missing); staples excluded from both sides. */
  coverage: number;
}

/**
 * Ranks recipes by how much of them the pantry already covers (staples are
 * assumed on hand and excluded from the math). Ties break toward fewer
 * missing ingredients. Recipes with zero matches are dropped.
 */
export function rankRecipesByPantry(
  recipes: CandidateRecipe[],
  pantryNames: string[],
  limit = 3,
): PantryRecipeMatch[] {
  const matcher = buildPantryMatcher(pantryNames);
  const scored: PantryRecipeMatch[] = [];
  for (const recipe of recipes) {
    const matched: string[] = [];
    const missing: string[] = [];
    for (const ing of recipe.ingredients) {
      if (isStapleIngredient(ing.name)) continue;
      if (matcher(ing.name)) matched.push(ing.name);
      else missing.push(ing.name);
    }
    if (matched.length === 0) continue;
    const total = matched.length + missing.length;
    scored.push({
      name: recipe.name,
      matched,
      missing,
      coverage: total > 0 ? matched.length / total : 0,
    });
  }
  return scored
    .sort((a, b) => b.coverage - a.coverage || a.missing.length - b.missing.length)
    .slice(0, limit);
}
