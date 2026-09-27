// ─── Safety taxonomy (T-00.7 scaffold for T-01.1) ─────────────────────────────
// Canonical ids for every allergen, diet, dislike-category and health
// "condition" the safety matcher understands. The matcher itself
// (`apps/api/src/lib/curated-recipes/safety.ts`) stays server-side and owns
// the actual regex pattern tables — this module only carries the ids,
// labels, synonyms and copy the clients need, plus the pattern-set names the
// matcher keys its tables by. Wave 1 (T-01.1, T-01.9, T-22.1) fills in the
// full pattern sets, the hidden-gluten / label-dependent lists and the
// condition group; this wave ships the shape and a starter seed so nothing
// downstream is blocked.

/** What kind of rule a taxonomy entry represents. */
export const SAFETY_TAXONOMY_GROUPS = ['allergy', 'diet', 'dislike', 'condition'] as const;
export type SafetyTaxonomyGroup = (typeof SAFETY_TAXONOMY_GROUPS)[number];

/**
 * One canonical taxonomy entry. `patternSet` names the table the API matcher
 * keys its regex patterns by (e.g. `TREE_NUT_PATTERNS`); the taxonomy itself
 * carries no patterns (one enforcement point, §2.1).
 */
export interface SafetyTaxonomyEntry {
  id: string;
  group: SafetyTaxonomyGroup;
  /** Canonical, user-facing label (what new clients write to storage). */
  label: string;
  /** Free-text variants a stored term is recognised from (lowercase). */
  synonyms: string[];
  /** The API pattern-set name this id's ingredients are matched against. */
  patternSet: string;
  /** "Read back" copy — how the app names this rule in a sentence. */
  readBack: string;
  /** May-contain caveat copy, when the category has one (e.g. tree nuts). */
  mayContain?: string;
  /** Coeliac-style condition → the diet id it maps onto (`condition` group only). */
  impliesDietId?: string;
}

/**
 * Starter seed — enough ids for the shared contract to be usable end to end
 * (allergy + diet + dislike + condition, one of each). T-01.1 replaces this
 * with the full audited set (tree nuts' may-contain list, fish/leafy-greens/
 * onion-garlic dislike categories, `vegetarian-no-eggs`, `gluten-free-coeliac`,
 * hidden-gluten and label-dependent ingredients, coeliac condition, etc).
 */
export const SAFETY_TAXONOMY: readonly SafetyTaxonomyEntry[] = [
  {
    id: 'tree-nuts',
    group: 'allergy',
    label: 'Tree nuts',
    synonyms: ['tree nuts', 'nuts', 'nut allergy'],
    patternSet: 'TREE_NUT_PATTERNS',
    readBack: 'a tree nut allergy',
    mayContain: 'granola, muesli, pesto, praline, marzipan, nut butter or nut milk',
  },
  {
    id: 'gluten-free',
    group: 'diet',
    label: 'Gluten-free',
    synonyms: ['gluten free', 'no gluten', 'gluten-free'],
    patternSet: 'GLUTEN_PATTERNS',
    readBack: 'gluten-free',
  },
  {
    id: 'fish',
    group: 'dislike',
    label: 'Fish',
    synonyms: ['fish', 'seafood'],
    patternSet: 'FISH_PATTERNS',
    readBack: "doesn't eat fish",
  },
  {
    id: 'coeliac',
    group: 'condition',
    label: 'Coeliac',
    synonyms: ['coeliac', 'celiac', 'coeliac disease'],
    patternSet: 'GLUTEN_PATTERNS',
    readBack: 'coeliac',
    impliesDietId: 'gluten-free',
  },
] as const;

export function findSafetyTaxonomyEntry(id: string): SafetyTaxonomyEntry | undefined {
  return SAFETY_TAXONOMY.find((entry) => entry.id === id);
}

export function safetyTaxonomyEntriesByGroup(group: SafetyTaxonomyGroup): SafetyTaxonomyEntry[] {
  return SAFETY_TAXONOMY.filter((entry) => entry.group === group);
}
