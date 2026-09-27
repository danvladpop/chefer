// ─── Safety taxonomy (T-01.1, T-01.9, T-22.1) ─────────────────────────────────
// Canonical ids for every allergen, diet, dislike-category and health
// "condition" the safety matcher understands. The matcher itself
// (`apps/api/src/lib/curated-recipes/safety.ts`) stays server-side and owns
// the actual regex pattern tables — this module only carries the ids,
// labels, synonyms and copy the clients need, plus the pattern-set names the
// matcher keys its tables by (§2.1).

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
  /** Free-text variants a stored term is recognised from (lowercase). Conditions include RO forms (T-22.1). */
  synonyms: string[];
  /** The API pattern-set name this id's ingredients are matched against ('NONE' when nothing is matched). */
  patternSet: string;
  /** "Read back" copy — how the app names this rule in a sentence. */
  readBack: string;
  /** May-contain caveat copy, when the category has one (e.g. tree nuts). */
  mayContain?: string;
  /** Coeliac-style condition → the diet id it maps onto (`condition` group only). */
  impliesDietId?: string;
}

// ─── Allergies ──────────────────────────────────────────────────────────────

const ALLERGY_ENTRIES: SafetyTaxonomyEntry[] = [
  {
    id: 'tree-nuts',
    group: 'allergy',
    label: 'Tree nuts',
    synonyms: ['tree nuts', 'nuts', 'nut allergy', 'tree nut'],
    patternSet: 'TREE_NUT_PATTERNS',
    readBack: 'a tree nut allergy',
    mayContain: 'granola, muesli, pesto, praline, marzipan, nut butter or nut milk',
  },
  {
    id: 'peanuts',
    group: 'allergy',
    label: 'Peanuts',
    synonyms: ['peanut', 'peanuts', 'peanut allergy', 'groundnut'],
    patternSet: 'PEANUT_PATTERNS',
    readBack: 'a peanut allergy',
    mayContain: 'satay sauce, some granola bars and Thai/African-style dishes',
  },
  {
    id: 'dairy',
    group: 'allergy',
    label: 'Dairy',
    synonyms: ['dairy', 'milk', 'lactose', 'milk allergy', 'dairy allergy'],
    patternSet: 'DAIRY_PATTERNS',
    readBack: 'a dairy allergy',
    mayContain: 'baked goods, sauces and some "dairy-free" chocolate',
  },
  {
    id: 'egg',
    group: 'allergy',
    label: 'Eggs',
    synonyms: ['egg', 'eggs', 'egg allergy'],
    patternSet: 'EGG_PATTERNS',
    readBack: 'an egg allergy',
    mayContain: 'mayonnaise, baked goods and some pasta',
  },
  {
    id: 'gluten',
    group: 'allergy',
    label: 'Gluten',
    synonyms: ['gluten', 'wheat', 'gluten allergy', 'wheat allergy'],
    patternSet: 'GLUTEN_PATTERNS',
    readBack: 'a gluten allergy',
  },
  {
    id: 'soy',
    group: 'allergy',
    label: 'Soy',
    synonyms: ['soy', 'soya', 'soy allergy'],
    patternSet: 'SOY_PATTERNS',
    readBack: 'a soy allergy',
  },
  {
    id: 'fish',
    group: 'allergy',
    label: 'Fish',
    synonyms: ['fish allergy'],
    patternSet: 'FISH_PATTERNS',
    readBack: 'a fish allergy',
  },
  {
    id: 'shellfish',
    group: 'allergy',
    label: 'Shellfish',
    synonyms: ['shellfish', 'shellfish allergy', 'crustacean'],
    patternSet: 'SHELLFISH_PATTERNS',
    readBack: 'a shellfish allergy',
  },
  {
    id: 'sesame',
    group: 'allergy',
    label: 'Sesame',
    synonyms: ['sesame', 'sesame allergy'],
    patternSet: 'SESAME_PATTERNS',
    readBack: 'a sesame allergy',
    mayContain: 'hummus, tahini and some bread toppings',
  },
];

// ─── Diets ──────────────────────────────────────────────────────────────────

const DIET_ENTRIES: SafetyTaxonomyEntry[] = [
  {
    id: 'vegetarian',
    group: 'diet',
    label: 'Vegetarian',
    synonyms: ['vegetarian', 'veggie'],
    patternSet: 'VEGETARIAN_RULE',
    readBack: 'vegetarian',
  },
  {
    id: 'vegetarian-no-eggs',
    group: 'diet',
    label: 'Vegetarian (no eggs)',
    // bug B-03: "no eggs" / "vegetarian, no eggs" used to be a silent no-op —
    // an unrecognised free-text restriction was matched literally as a
    // disliked ingredient (a term that never appears in an ingredient name)
    // and so never excluded anything.
    synonyms: ['vegetarian no eggs', 'vegetarian, no eggs', 'lacto vegetarian', 'no eggs'],
    patternSet: 'VEGETARIAN_NO_EGGS_RULE',
    readBack: 'vegetarian, no eggs',
  },
  {
    id: 'vegan',
    group: 'diet',
    label: 'Vegan',
    synonyms: ['vegan'],
    patternSet: 'VEGAN_RULE',
    readBack: 'vegan',
  },
  {
    id: 'pescatarian',
    group: 'diet',
    label: 'Pescatarian',
    synonyms: ['pescatarian', 'pescetarian'],
    patternSet: 'PESCATARIAN_RULE',
    readBack: 'pescatarian',
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
    id: 'gluten-free-coeliac',
    group: 'diet',
    // T-01.9 (rev 2): a coeliac-strength rule also excludes the
    // label-dependent ingredients instead of only caveating them — see
    // `excludeLabelDependent` in the API matcher.
    label: 'Gluten-free (coeliac)',
    synonyms: ['gluten-free coeliac', 'gluten free coeliac', 'strict gluten-free', 'coeliac safe'],
    patternSet: 'GLUTEN_PATTERNS',
    readBack: 'gluten-free (coeliac-strength)',
  },
  {
    id: 'egg-free',
    group: 'diet',
    label: 'Egg-free',
    synonyms: ['egg free', 'egg-free', 'no eggs diet'],
    patternSet: 'EGG_PATTERNS',
    readBack: 'egg-free',
  },
  {
    id: 'dairy-free',
    group: 'diet',
    label: 'Dairy-free',
    synonyms: ['dairy free', 'no dairy', 'dairy-free'],
    patternSet: 'DAIRY_PATTERNS',
    readBack: 'dairy-free',
  },
  {
    id: 'keto',
    group: 'diet',
    label: 'Keto',
    synonyms: ['keto', 'ketogenic'],
    patternSet: 'KETO_RULE',
    readBack: 'keto',
  },
  {
    id: 'paleo',
    group: 'diet',
    label: 'Paleo',
    synonyms: ['paleo', 'paleolithic'],
    patternSet: 'PALEO_RULE',
    readBack: 'paleo',
  },
];

// ─── Dislikes ───────────────────────────────────────────────────────────────
// bug B-04: category dislikes ("fish", "leafy greens"…) used to be matched as
// one literal ingredient-name substring instead of expanding to the category
// (e.g. disliking "fish" didn't catch "salmon" or "cod").

const DISLIKE_ENTRIES: SafetyTaxonomyEntry[] = [
  {
    id: 'fish',
    group: 'dislike',
    label: 'Fish',
    synonyms: ['fish', 'seafood'],
    patternSet: 'FISH_PATTERNS',
    readBack: "doesn't eat fish",
  },
  {
    id: 'shellfish',
    group: 'dislike',
    label: 'Shellfish',
    synonyms: ['shellfish'],
    patternSet: 'SHELLFISH_PATTERNS',
    readBack: "doesn't eat shellfish",
  },
  {
    id: 'red-meat',
    group: 'dislike',
    label: 'Red meat',
    synonyms: ['red meat', 'meat'],
    patternSet: 'RED_MEAT_PATTERNS',
    readBack: "doesn't eat red meat",
  },
  {
    id: 'mushrooms',
    group: 'dislike',
    label: 'Mushrooms',
    synonyms: ['mushroom', 'mushrooms', 'fungi'],
    patternSet: 'MUSHROOM_PATTERNS',
    readBack: "doesn't eat mushrooms",
  },
  {
    id: 'leafy-greens',
    group: 'dislike',
    label: 'Leafy greens',
    synonyms: ['leafy greens', 'green vegetables', 'greens'],
    patternSet: 'LEAFY_GREENS_PATTERNS',
    readBack: "doesn't eat leafy greens",
  },
  {
    id: 'onion-garlic',
    group: 'dislike',
    label: 'Onion & garlic',
    synonyms: ['onion', 'garlic', 'onion and garlic', 'onion & garlic', 'alliums'],
    patternSet: 'ONION_GARLIC_PATTERNS',
    readBack: "doesn't eat onion or garlic",
  },
  {
    id: 'spicy',
    group: 'dislike',
    label: 'Spicy food',
    synonyms: ['spicy', 'spicy food', 'hot food', 'chilli', 'chili'],
    patternSet: 'SPICY_PATTERNS',
    readBack: "doesn't eat spicy food",
  },
  {
    id: 'cilantro',
    group: 'dislike',
    label: 'Cilantro / coriander',
    synonyms: ['cilantro', 'coriander'],
    patternSet: 'CILANTRO_PATTERNS',
    readBack: "doesn't eat cilantro",
  },
];

// ─── Conditions (T-22.1) ──────────────────────────────────────────────────────
// Health conditions are RECOGNISED — so the app never silently treats one as
// an unknown dislike — but nothing is saved from them automatically. Only
// coeliac has a safe automatic reading (the gluten-free-coeliac diet); every
// other condition surfaces the UncheckedNotice "Choose a goal" prompt instead.
// EN + RO synonyms (the persona study covers Romanian-speaking users).

const CONDITION_ENTRIES: SafetyTaxonomyEntry[] = [
  {
    id: 'coeliac',
    group: 'condition',
    label: 'Coeliac',
    synonyms: [
      'coeliac',
      'celiac',
      'coeliac disease',
      'celiac disease',
      'celiachie',
      'boala celiaca',
    ],
    patternSet: 'GLUTEN_PATTERNS',
    readBack: 'coeliac',
    impliesDietId: 'gluten-free-coeliac',
  },
  {
    id: 'diabetes',
    group: 'condition',
    label: 'Diabetes',
    synonyms: [
      'diabetes',
      'diabetic',
      'type 2 diabetes',
      'type 1 diabetes',
      'diabet',
      'diabet zaharat',
    ],
    patternSet: 'NONE',
    readBack: 'diabetes',
  },
  {
    id: 'hypertension',
    group: 'condition',
    label: 'High blood pressure',
    synonyms: [
      'hypertension',
      'high blood pressure',
      'hipertensiune',
      'tensiune arteriala mare',
      'tensiune arteriala',
    ],
    patternSet: 'NONE',
    readBack: 'high blood pressure',
  },
  {
    id: 'pregnancy',
    group: 'condition',
    label: 'Pregnancy',
    synonyms: ['pregnant', 'pregnancy', 'sarcina', 'insarcinata'],
    patternSet: 'NONE',
    readBack: 'pregnancy',
  },
  {
    id: 'ibs',
    group: 'condition',
    label: 'IBS',
    synonyms: ['ibs', 'irritable bowel syndrome', 'sindromul intestinului iritabil'],
    patternSet: 'NONE',
    readBack: 'IBS',
  },
  {
    id: 'kidney-disease',
    group: 'condition',
    label: 'Kidney disease',
    synonyms: ['kidney disease', 'renal disease', 'boala de rinichi', 'boala renala'],
    patternSet: 'NONE',
    readBack: 'kidney disease',
  },
];

export const SAFETY_TAXONOMY: readonly SafetyTaxonomyEntry[] = [
  ...ALLERGY_ENTRIES,
  ...DIET_ENTRIES,
  ...DISLIKE_ENTRIES,
  ...CONDITION_ENTRIES,
] as const;

export function findSafetyTaxonomyEntry(id: string): SafetyTaxonomyEntry | undefined {
  return SAFETY_TAXONOMY.find((entry) => entry.id === id);
}

export function safetyTaxonomyEntriesByGroup(group: SafetyTaxonomyGroup): SafetyTaxonomyEntry[] {
  return SAFETY_TAXONOMY.filter((entry) => entry.group === group);
}

// ─── Hidden gluten (bug B-47 / T-01.9, rev 2) ──────────────────────────────────
// "Always-gluten" ingredients join GLUTEN_PATTERNS outright (they are never
// gluten-free). "Label-dependent" ingredients CAN be gluten-free (a
// certified-GF stock cube exists) but the base ingredient usually isn't, so
// they surface as a caveat instead of excluding by default — see
// `DietaryPreferences.excludeLabelDependent` and `SafetyChecks.labelCaveats`.

export const ALWAYS_GLUTEN_INGREDIENTS = [
  'spelt',
  'seitan',
  'semolina',
  'bulgur',
  'couscous',
  'farro',
  'malt',
  'barley',
  'rye',
  'regular oats', // "gluten-free oats" is a distinct, certified product
] as const;

export const LABEL_DEPENDENT_INGREDIENTS = [
  'stock',
  'bouillon',
  'stock cube',
  'curry powder',
  'soy sauce',
  'baking powder',
  'oats',
  'chocolate',
  'sausage',
  'sausages',
] as const;
