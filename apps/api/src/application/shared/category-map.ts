import type { GroceryCategory } from '../../lib/grocery-ai/types.js';

// ─── Ingredient → grocery category inference ──────────────────────────────────
// The single keyword map for categorising ingredients. It used to exist twice
// (here and a Title-Case copy in meal-plan.service) with diverging values, so
// the same ingredient could land in different aisles on different screens.

const CATEGORY_KEYWORDS: Record<string, GroceryCategory> = {
  tomato: 'produce',
  spinach: 'produce',
  onion: 'produce',
  garlic: 'produce',
  lemon: 'produce',
  lime: 'produce',
  avocado: 'produce',
  mushroom: 'produce',
  pepper: 'produce',
  lettuce: 'produce',
  cucumber: 'produce',
  zucchini: 'produce',
  carrot: 'produce',
  broccoli: 'produce',
  celery: 'produce',
  kale: 'produce',
  apple: 'produce',
  banana: 'produce',
  berry: 'produce',
  fruit: 'produce',
  shallot: 'produce',
  herb: 'produce',
  cilantro: 'produce',
  parsley: 'produce',
  chicken: 'proteins',
  beef: 'proteins',
  salmon: 'proteins',
  tuna: 'proteins',
  egg: 'proteins',
  tofu: 'proteins',
  shrimp: 'proteins',
  turkey: 'proteins',
  pork: 'proteins',
  lamb: 'proteins',
  cod: 'proteins',
  fish: 'proteins',
  pepperoni: 'proteins',
  milk: 'dairy',
  cheese: 'dairy',
  yogurt: 'dairy',
  butter: 'dairy',
  cream: 'dairy',
  parmesan: 'dairy',
  mozzarella: 'dairy',
  feta: 'dairy',
  rice: 'grains',
  pasta: 'grains',
  flour: 'grains',
  bread: 'grains',
  oat: 'grains',
  quinoa: 'grains',
  lentil: 'grains',
  bean: 'grains',
  oil: 'grains',
  vinegar: 'grains',
  soy: 'grains',
  honey: 'grains',
  almond: 'grains',
  walnut: 'grains',
  cashew: 'grains',
  nut: 'grains',
  chickpea: 'grains',
  coconut: 'grains',
};

// Longest keyword first so "pepperoni" wins over "pepper" when both match a
// candidate boundary (defence in depth on top of the word-boundary regex).
const MATCHERS: { pattern: RegExp; category: GroceryCategory }[] = Object.entries(CATEGORY_KEYWORDS)
  .sort(([a], [b]) => b.length - a.length)
  .map(([keyword, category]) => ({
    // Word-boundary match, not substring: the old `.includes()` sent
    // "pepperoni" to produce (via "pepper") and "coconut" everywhere "nut"
    // appeared. Plural 's' is tolerated ("carrots" → carrot).
    pattern: new RegExp(String.raw`\b${keyword}s?\b`, 'i'),
    category,
  }));

export function inferCategory(ingredientName: string): GroceryCategory {
  for (const { pattern, category } of MATCHERS) {
    if (pattern.test(ingredientName)) return category;
  }
  return 'other';
}
