// ─── Pantry staples denylist (F3) ────────────────────────────────────────────
// Ingredients that are never tracked in the pantry: assumed-on-hand seasonings
// and cooking media. Checking off "salt" on the shopping list must not create
// a PantryItem, and coverage ranking treats these as always available.
//
// Matching is deliberately conservative: exact normalized names plus a few
// suffix families ("… oil", "… vinegar", "… salt"). Whole vegetables that
// merely CONTAIN a staple word ("bell pepper", "red pepper flakes" is a spice
// though) must not be swallowed — hence no bare substring matching.

/** Exact normalized names that are always staples. */
const STAPLE_EXACT = new Set([
  'salt',
  'pepper',
  'black pepper',
  'white pepper',
  'ground pepper',
  'ground black pepper',
  'salt and pepper',
  'water',
  'ice',
  'ice cubes',
  'oil',
  'sugar',
  'brown sugar',
  'icing sugar',
  'powdered sugar',
  'baking powder',
  'baking soda',
  'cornstarch',
  'corn starch',
  // Common dried spices — recipes list them in pinch/tsp amounts; tracking
  // them is pure noise.
  'paprika',
  'smoked paprika',
  'cumin',
  'ground cumin',
  'oregano',
  'dried oregano',
  'dried thyme',
  'dried basil',
  'dried rosemary',
  'cinnamon',
  'ground cinnamon',
  'turmeric',
  'curry powder',
  'chili powder',
  'chilli powder',
  'chili flakes',
  'red pepper flakes',
  'garlic powder',
  'onion powder',
  'nutmeg',
  'bay leaf',
  'bay leaves',
  'vanilla extract',
]);

/** Suffix families: "olive oil", "rice vinegar", "sea salt", … */
const STAPLE_SUFFIXES = [' oil', ' vinegar', ' salt'];

/** Normalizes the way lib/ingredient-prices does (kept dependency-free). */
function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * True when the ingredient is an assumed-on-hand staple that the pantry
 * never tracks (premium_plan.md §5 W2-E.1).
 */
export function isStapleIngredient(name: string): boolean {
  const normalized = normalize(name);
  if (STAPLE_EXACT.has(normalized)) return true;
  return STAPLE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}
