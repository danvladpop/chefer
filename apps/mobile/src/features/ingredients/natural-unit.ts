import type { RecipeUnit } from '@chefer/types';

// ─── Natural unit heuristic (T-40.7, UX-40 slice 2) ────────────────────────
// The spec: picking a catalogue row sets the line's unit to its "natural"
// one when the unit is still the default ("Eggs" → piece, "Milk" → ml).
// `ingredients.search` doesn't return a per-row natural-unit hint today (its
// DTO is `{ name, displayName, imageUrl, hasMacros, isCustom, per100g }` —
// see apps/api/src/application/ingredients/ingredients.service.ts), so this
// is a small, deliberately conservative name-based approximation rather than
// a server-driven answer. A follow-up to add a real `naturalUnit` field to
// the search DTO is worth doing once L-RECIPE's API lock lifts (flagged in
// the wave-2 report) — until then this keeps the picker useful without
// guessing wildly: it only fires for a short, curated list of very common
// ingredients, and returns undefined (leave the unit alone) for anything
// else.

const PIECE_HINTS = [
  'egg',
  'apple',
  'banana',
  'onion',
  'potato',
  'lemon',
  'lime',
  'avocado',
  'orange',
  'tomato',
  'bell pepper',
  'garlic clove',
  'clove of garlic',
];

const LIQUID_HINTS = [
  'milk',
  'water',
  'juice',
  'oil',
  'broth',
  'stock',
  'cream',
  'wine',
  'vinegar',
  'buttermilk',
];

/**
 * Returns the catalogue row's likely natural unit from its (raw, lowercase)
 * ingredient name, or undefined when nothing in the curated list matches —
 * callers then leave the ingredient line's unit exactly as it was.
 */
export function naturalUnitForIngredient(rawName: string): RecipeUnit | undefined {
  const name = rawName.trim().toLowerCase();
  if (!name) return undefined;

  if (PIECE_HINTS.some((hint) => name === hint || name === `${hint}s` || name.includes(hint))) {
    return 'piece';
  }
  if (LIQUID_HINTS.some((hint) => name.includes(hint))) {
    return 'ml';
  }
  return undefined;
}
