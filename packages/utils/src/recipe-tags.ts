// ─── Recipe diet-tag helpers (T-01.6, bug B-01) ────────────────────────────────
// Shared by the recipe form (mobile + web): a lightweight, client-side
// "does this ingredient list actually match the tags I ticked" hint. This is
// NOT the safety matcher (server-side, fail-closed, `curated-recipes/safety.ts`)
// — it's a friendly amber nudge while editing, never a save-blocker.

const TAG_FORBIDDEN_WORDS: Record<string, string[]> = {
  vegan: [
    'chicken',
    'beef',
    'pork',
    'lamb',
    'turkey',
    'bacon',
    'ham',
    'sausage',
    'fish',
    'salmon',
    'tuna',
    'shrimp',
    'prawn',
    'milk',
    'cheese',
    'yogurt',
    'yoghurt',
    'butter',
    'cream',
    'egg',
    'honey',
    'gelatine',
    'gelatin',
  ],
  vegetarian: [
    'chicken',
    'beef',
    'pork',
    'lamb',
    'turkey',
    'bacon',
    'ham',
    'sausage',
    'fish',
    'salmon',
    'tuna',
    'shrimp',
    'prawn',
    'gelatine',
    'gelatin',
  ],
  'gluten-free': ['wheat', 'bread', 'pasta', 'flour', 'barley', 'rye', 'couscous', 'soy sauce'],
  'dairy-free': ['milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'ghee', 'whey'],
  pescatarian: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'sausage'],
};

export interface RecipeTagConflict {
  tag: string;
  /** Ingredient names that break the tag. */
  ingredients: string[];
}

/**
 * The tags the user ticked whose ingredients contradict them — an amber
 * hint under the Diet tags picker, e.g. "Chicken breast doesn't look
 * vegetarian." Case-insensitive; unknown tags never conflict (nothing to
 * check them against).
 */
export function tagConflicts(ingredients: { name: string }[], tags: string[]): RecipeTagConflict[] {
  const names = ingredients.map((i) => i.name.toLowerCase());
  const conflicts: RecipeTagConflict[] = [];
  for (const tag of tags) {
    const key = tag.trim().toLowerCase();
    const forbidden = TAG_FORBIDDEN_WORDS[key];
    if (!forbidden) continue;
    const hits = names.filter((name) => forbidden.some((word) => name.includes(word)));
    if (hits.length > 0) conflicts.push({ tag, ingredients: hits });
  }
  return conflicts;
}
