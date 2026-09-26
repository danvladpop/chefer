import { isShortOf } from '../shopping-list/aggregate.js';
import { isStapleIngredient } from './staples.js';

// ─── Pantry ↔ ingredient matching (F3, pure) ─────────────────────────────────
// Shared by the shopping-list subtraction, the generation personalisation
// ("uses 4 things you already have"), the coach savings figure and the chat
// `whatCanIMake` tool — one matching rule everywhere.

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Cuts of the same animal: a pantry "chicken breast" covers a recipe's
// "chicken" (and the reverse). Anything else after the base food makes a
// different product — "lemon juice" is not a lemon (audit F-PAN-1-2).
const CUT_WORDS = new Set([
  'breast',
  'thigh',
  'fillet',
  'leg',
  'wing',
  'drumstick',
  'steak',
  'mince',
  'loin',
  'tenderloin',
]);

function singularWord(word: string): string {
  if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(toes|shes|ches|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function words(name: string): string[] {
  return normalize(name)
    .split(' ')
    .filter((w) => w.length > 0)
    .map(singularWord);
}

/**
 * Head-noun name match (audit F-PAN-1-2). Equal names match; otherwise the
 * shorter name must be the END of the longer one — its head noun — so
 * "tomato" covers "cherry tomatoes" and "rice" covers "basmati rice", but
 * "lemon" no longer covers "lemon juice" or "lemon vinaigrette", and "rice"
 * no longer covers "rice vinegar". The one exception is a cut of meat
 * ("chicken breast" ↔ "chicken"). Terms under 3 chars never match.
 */
export function namesMatch(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 || wb.length === 0) return false;
  if (wa.join(' ') === wb.join(' ')) return true;
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (shorter.length === longer.length) return false;
  if (shorter.join(' ').length < 3) return false;

  const tail = longer.slice(longer.length - shorter.length);
  if (tail.join(' ') === shorter.join(' ')) return true;

  const head = longer.slice(0, shorter.length);
  const rest = longer.slice(shorter.length);
  return head.join(' ') === shorter.join(' ') && rest.every((w) => CUT_WORDS.has(w));
}

/** A pantry row: a bare name (unknown amount) or a name with its amount. */
export type PantryEntry = string | { name: string; quantity: number; unit: string };

/**
 * Returns a matcher closing over the user's pantry: given an ingredient name
 * (and, when known, the amount needed) it returns the covering pantry name,
 * or null. Staples are never "covered" — they are not tracked at all. A
 * pantry row with a known amount smaller than the need doesn't cover it
 * (3 eggs don't cover a list line of 11).
 */
export function buildPantryMatcher(
  pantry: PantryEntry[],
): (ingredientName: string, need?: { quantity: number; unit: string }) => string | null {
  const entries = pantry
    .map((entry) =>
      typeof entry === 'string'
        ? { name: normalize(entry), quantity: 0, unit: '' }
        : { ...entry, name: normalize(entry.name) },
    )
    .filter((entry) => entry.name.length > 0);
  return (ingredientName, need) => {
    if (isStapleIngredient(ingredientName)) return null;
    const hit = entries.find(
      (entry) => namesMatch(entry.name, ingredientName) && !(need && isShortOf(entry, need)),
    );
    return hit?.name ?? null;
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
