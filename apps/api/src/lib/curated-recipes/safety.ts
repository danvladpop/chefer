import type { RecipeData } from '../ai/types.js';

// ─── Curated-pool safety filtering (P1-2) ─────────────────────────────────────
// Free plans must never serve a recipe the user cannot eat. Allergies and
// disliked ingredients are matched against ingredient names AND the recipe
// name; dietary restrictions require the matching dietaryTag and additionally
// scan ingredients for obvious violations, so a mis-tagged recipe fails safe.
// Over-blocking is acceptable here; under-blocking is not.

export interface SafetyPrefs {
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
}

// Dairy words must not match their plant-based namesakes ("almond butter",
// "coconut milk", "oat milk") — those are safe for dairy allergies and for
// vegan/dairy-free diets, and blocking them would gut the compliant pool.
const PLANT =
  '(?<!coconut )(?<!almond )(?<!oat )(?<!soy )(?<!rice )(?<!cashew )(?<!peanut )(?<!seed )(?<!cocoa )(?<!nut )';

/**
 * Negative lookbehinds for "<qualifier> <word>", e.g. "dairy-free milk" or
 * "vegan butter". The AI's own safe substitutions used to fail the matcher,
 * which steered allergic users to save the original recipe instead (audit
 * F-REC-4-1). Qualifiers only clear their own family: "gluten-free soy
 * sauce" still matches a soy allergy. "Lactose-free" is deliberately absent —
 * lactose-free milk is still dairy.
 */
function notAfter(qualifiers: string[]): string {
  return qualifiers.flatMap((q) => [`(?<!${q} )`, `(?<!${q.replace('-', ' ')} )`]).join('');
}
const DAIRY_FREE = notAfter(['dairy-free', 'non-dairy', 'vegan', 'plant-based', 'milk-free']);
const EGG_FREE = notAfter(['egg-free', 'vegan', 'plant-based']);
const GLUTEN_FREE = notAfter(['gluten-free', 'wheat-free']);

const DAIRY_PATTERNS = [
  `${PLANT}${DAIRY_FREE}\\bmilk`,
  `${DAIRY_FREE}\\bcheese`,
  `${DAIRY_FREE}\\byogh?urt`,
  `${PLANT}${DAIRY_FREE}\\bbutter`,
  `${PLANT}${DAIRY_FREE}\\bcream`,
  '\\bghee',
  '\\bwhey',
  '\\bkefir',
];

const TREE_NUT_PATTERNS = [
  '\\balmond',
  '\\bcashew',
  '\\bwalnut',
  '\\bpecan',
  '\\bhazelnut',
  '\\bpistachio',
  '\\bmacadamia',
  '\\bbrazil nut',
  '\\bpine nut',
  '\\bnut', // also catches "nuts", "nut butter", "nutmeg" (over-block is fine)
  '\\bcoconut', // FDA-classified tree nut
  '\\bpraline',
];

// (?!plant): eggplant is a vegetable, not an egg.
const EGG_PATTERNS = [
  '\\begg(?!plant)(?![- ]free)(?!less)',
  `${EGG_FREE}\\bmayonnaise`,
  `${EGG_FREE}\\bmayo\\b`,
  `${EGG_FREE}\\baioli`,
];

const GLUTEN_PATTERNS = [
  `${GLUTEN_FREE}\\bwheat`,
  `${GLUTEN_FREE}\\bbread`,
  `${GLUTEN_FREE}\\btoast`,
  `${GLUTEN_FREE}\\bpasta`,
  `${GLUTEN_FREE}\\bnoodle`,
  `${GLUTEN_FREE}\\bflour`,
  `${GLUTEN_FREE}\\bcouscous`,
  `${GLUTEN_FREE}\\bbulgur`,
  `${GLUTEN_FREE}\\bbarley`,
  `${GLUTEN_FREE}\\brye\\b`,
  `${GLUTEN_FREE}\\bgranola`,
  `${GLUTEN_FREE}\\boat`, // oats are routinely cross-contaminated; fail safe
  `${GLUTEN_FREE}\\bsoy sauce`,
  `${GLUTEN_FREE}\\btortilla`,
  `${GLUTEN_FREE}\\bbagel`,
  `${GLUTEN_FREE}\\bbun\\b`,
  `${GLUTEN_FREE}\\bwrap`,
  `${GLUTEN_FREE}\\bpita`,
  `${GLUTEN_FREE}\\bcrouton`,
  `${GLUTEN_FREE}\\bcracker`,
  `${GLUTEN_FREE}\\bsourdough`,
  `${GLUTEN_FREE}\\bbaguette`,
];

const FISH_PATTERNS = [
  '\\bsalmon',
  '\\btuna',
  '\\bcod\\b',
  '\\btrout',
  '\\bmackerel',
  '\\bsardine',
  '\\banchov',
  '\\bfish',
  '\\bhalibut',
  '\\bsea bass',
];

const SHELLFISH_PATTERNS = [
  '\\bshrimp',
  '\\bprawn',
  '\\bcrab',
  '\\blobster',
  '\\bmussel',
  '\\bclam',
  '\\boyster',
  '\\bscallop',
  '\\bsquid',
  '\\bcalamari',
];

const SOY_PATTERNS = ['\\bsoy', '\\btofu', '\\bedamame', '\\btempeh', '\\bmiso'];

const SESAME_PATTERNS = ['\\bsesame', '\\btahini', '\\bhummus'];

const MEAT_PATTERNS = [
  '\\bchicken',
  '\\bbeef',
  '\\bpork',
  '\\blamb',
  '\\bturkey',
  '\\bbacon',
  '\\bham\\b',
  '\\bsausage',
  '\\bchorizo',
  '\\bprosciutto',
  '\\bsalami',
  '\\bmince',
  '\\bmeatball',
  '\\bsteak',
  '\\bduck',
  '\\bveal',
  '\\bliver',
  '\\bgelatine?\\b',
];

// Canonical allergens (normalized, singular) expand to the ingredient
// patterns they hide behind. Anything not listed is matched as a raw term.
const ALLERGEN_PATTERNS: Record<string, string[]> = {
  peanut: ['\\bpeanut'],
  nut: TREE_NUT_PATTERNS,
  'tree nut': TREE_NUT_PATTERNS,
  nuts: TREE_NUT_PATTERNS,
  dairy: DAIRY_PATTERNS,
  milk: DAIRY_PATTERNS,
  lactose: DAIRY_PATTERNS,
  egg: EGG_PATTERNS,
  gluten: GLUTEN_PATTERNS,
  wheat: GLUTEN_PATTERNS,
  soy: SOY_PATTERNS,
  fish: FISH_PATTERNS,
  shellfish: SHELLFISH_PATTERNS,
  seafood: [...FISH_PATTERNS, ...SHELLFISH_PATTERNS],
  sesame: SESAME_PATTERNS,
};

// Dietary restrictions: the recipe must carry one of `anyTag` (when set) and
// must not match any `forbidden` pattern. Keys are lowercased UI values
// (step-diet.tsx DIET_OPTIONS).
const RESTRICTION_RULES: Record<string, { anyTag?: string[]; forbidden: string[] }> = {
  omnivore: { forbidden: [] },
  vegetarian: {
    anyTag: ['vegetarian', 'vegan'],
    forbidden: [...MEAT_PATTERNS, ...FISH_PATTERNS, ...SHELLFISH_PATTERNS],
  },
  vegan: {
    anyTag: ['vegan'],
    forbidden: [
      ...MEAT_PATTERNS,
      ...FISH_PATTERNS,
      ...SHELLFISH_PATTERNS,
      ...DAIRY_PATTERNS,
      ...EGG_PATTERNS,
      '\\bhoney',
    ],
  },
  pescatarian: {
    anyTag: ['pescatarian', 'vegetarian', 'vegan'],
    forbidden: MEAT_PATTERNS,
  },
  'gluten-free': { anyTag: ['gluten-free'], forbidden: GLUTEN_PATTERNS },
  'dairy-free': { anyTag: ['dairy-free', 'vegan'], forbidden: DAIRY_PATTERNS },
  keto: { anyTag: ['keto'], forbidden: [] },
  paleo: { anyTag: ['paleo'], forbidden: [] },
};

/** Lowercase, trim, and strip a plural 's' so "Peanuts" → "peanut". */
function normalizeTerm(raw: string): string {
  const term = raw.trim().toLowerCase();
  return term.length > 3 && term.endsWith('s') && !term.endsWith('ss') ? term.slice(0, -1) : term;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((source) => new RegExp(source).test(text));
}

// Steps are scanned too: an adapted recipe once kept "whisk peanut butter
// with coconut milk" in its method while its ingredient list was clean
// (audit F-REC-4-6).
function recipeText(recipe: RecipeData): string {
  const parts = [recipe.name, ...recipe.ingredients.map((i) => i.name), ...recipe.instructions];
  return parts.join(' \n ').toLowerCase();
}

/**
 * True when the recipe is safe for the given preferences. Exported for unit
 * tests; production code goes through filterSafeRecipes.
 */
export function isRecipeSafe(recipe: RecipeData, prefs: SafetyPrefs): boolean {
  const text = recipeText(recipe);
  const tags = recipe.dietaryTags.map((t) => t.toLowerCase());

  for (const allergy of prefs.allergies) {
    const key = normalizeTerm(allergy);
    const patterns = ALLERGEN_PATTERNS[key] ?? [`\\b${escapeRegExp(key)}`];
    if (matchesAny(text, patterns)) return false;
  }

  for (const disliked of prefs.dislikedIngredients) {
    if (matchesAny(text, [`\\b${escapeRegExp(normalizeTerm(disliked))}`])) return false;
  }

  for (const restriction of prefs.dietaryRestrictions) {
    const rule = RESTRICTION_RULES[restriction.trim().toLowerCase()];
    if (!rule) {
      // Unknown free-text restriction: treat it like a disliked ingredient.
      if (matchesAny(text, [`\\b${escapeRegExp(normalizeTerm(restriction))}`])) return false;
      continue;
    }
    if (rule.anyTag && !rule.anyTag.some((tag) => tags.includes(tag))) return false;
    if (matchesAny(text, rule.forbidden)) return false;
  }

  return true;
}

/**
 * The user's allergies and dietary restrictions the recipe conflicts with —
 * the matcher's boolean, decomposed per term so callers can say WHAT is
 * wrong. Dislikes are soft preferences and are not reported.
 */
export function findSafetyIssues(
  recipe: RecipeData,
  prefs: Pick<SafetyPrefs, 'allergies' | 'dietaryRestrictions'>,
): string[] {
  const none = { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] };
  return [
    ...prefs.allergies.filter((a) => !isRecipeSafe(recipe, { ...none, allergies: [a] })),
    ...prefs.dietaryRestrictions.filter(
      (r) => !isRecipeSafe(recipe, { ...none, dietaryRestrictions: [r] }),
    ),
  ];
}

export function filterSafeRecipes(pool: RecipeData[], prefs: SafetyPrefs): RecipeData[] {
  return pool.filter((recipe) => isRecipeSafe(recipe, prefs));
}

export function hasSafetyPrefs(prefs: SafetyPrefs | null | undefined): prefs is SafetyPrefs {
  return Boolean(
    prefs &&
    (prefs.allergies.length > 0 ||
      prefs.dietaryRestrictions.length > 0 ||
      prefs.dislikedIngredients.length > 0),
  );
}
