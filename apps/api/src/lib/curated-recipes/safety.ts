import {
  ALWAYS_GLUTEN_INGREDIENTS,
  LABEL_DEPENDENT_INGREDIENTS,
  SAFETY_TAXONOMY,
} from '@chefer/types';
import { recogniseSafetyTerm } from '@chefer/utils';
import type { RecipeData } from '../ai/types.js';

// ─── Curated-pool safety filtering (P1-2, T-01.1 taxonomy-driven) ─────────────
// Free plans must never serve a recipe the user cannot eat. Allergies and
// disliked ingredients are matched against ingredient names AND the recipe
// name; dietary restrictions require the matching dietaryTag and additionally
// scan ingredients for obvious violations, so a mis-tagged recipe fails safe.
// Over-blocking is acceptable here; under-blocking is not.
//
// T-01.1: every stored term is matched literally (as before) AND via
// `recogniseSafetyTerm` (the taxonomy synonym map, shared with the clients) —
// this makes the "over-block until confirmed" rule of UX-01 (b) permanent and
// free, so a legacy free-text term ("nuts", "no eggs", "green vegetables")
// still expands to its whole ingredient-pattern category instead of matching
// only its own literal substring.

export interface SafetyPrefs {
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
  /**
   * T-01.9 (rev 2): when true, a label-dependent ingredient (stock, curry
   * powder, soy sauce…) EXCLUDES a gluten-free recipe instead of only
   * caveating it (`DietaryPreferences.excludeLabelDependent`).
   */
  excludeLabelDependent?: boolean;
}

/**
 * The slice of a recipe the safety check actually reads. `RecipeData`
 * satisfies it structurally, but so does a bare Prisma `Recipe` row (cast
 * only on `ingredients`, its one JSON field) — callers (pantry.service.ts's
 * `whatCanIMake`, recipe.service.ts's `list({ forTable })`, T-00.11) no
 * longer have to fabricate unused RecipeData fields just to run the filter.
 */
export type SafetyCheckable = Pick<
  RecipeData,
  'name' | 'ingredients' | 'instructions' | 'dietaryTags'
> & {
  /**
   * UX-REC-01: per-serving nutrition, when the caller has it — the keto
   * net-carb check reads it. For a COMPUTED recipe (`nutritionStatus`) it IS
   * catalogue nutrition (plan-ingredient-catalog invariant I1). Optional so
   * existing callers (and recipe rows cast to this) keep working.
   */
  nutritionInfo?: { calories?: number; carbs?: number; fiber?: number } | null | undefined;
  nutritionStatus?: string | null | undefined;
};

/**
 * UX-REC-01: how a diet rule is decided.
 * - `strict` (default): the stored tag AND clean ingredients — the curated
 *   pool's fail-safe, so an untagged recipe never reaches a plan.
 * - `deriveFromIngredients`: for recipes people wrote or imported, which have
 *   no diet tags to trust. A recipe without the tag passes when its own
 *   ingredients (and, for keto, its net carbs) verify the diet, so plain oats
 *   are vegetarian instead of "non-vegetarian".
 */
export interface SafetyOptions {
  deriveFromIngredients?: boolean;
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

// bug B-02: the may-contain list (granola, muesli, pesto, praline, marzipan,
// nut butter, nut milk) — cross-contamination risk, not a direct ingredient,
// so it is deliberately over-inclusive.
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
  '\\bgranola',
  '\\bmuesli',
  '\\bpesto',
  '\\bmarzipan',
];

// "satay" is deliberately NOT a peanut pattern: it's a dish/marinade STYLE
// (a grilled skewer), not necessarily peanut-based, and a Cheferized "Tofu
// Satay" can be genuinely peanut-free — matching the recipe NAME here would
// over-block a correctly adapted recipe (audit-equivalent to F-REC-4-1).
const PEANUT_PATTERNS = ['\\bpeanut', '\\bgroundnut'];

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
  // bug B-47 / T-01.9: "always-gluten" ingredients that the pattern list
  // above missed (spelt, seitan, semolina, farro, malt…) — never gluten-free
  // regardless of any "gluten-free" qualifier in front of them.
  ...ALWAYS_GLUTEN_INGREDIENTS.map((i) => `\\b${i.replace(/\s+/g, '\\s+')}`),
];

/**
 * Label-dependent ingredients (stock, curry powder, soy sauce, baking
 * powder, oats, chocolate, sausages — T-01.9 rev 2): they CAN be
 * gluten-free (a certified product exists) but the base ingredient usually
 * isn't, so they don't exclude by default — `findLabelCaveats` surfaces them
 * instead, and `excludeLabelDependent` turns them into an exclusion.
 */
const LABEL_DEPENDENT_PATTERNS = LABEL_DEPENDENT_INGREDIENTS.map(
  (i) => `\\b${i.replace(/\s+/g, '\\s+')}`,
);

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

// bug B-04: "red meat" dislike is narrower than the full MEAT_PATTERNS —
// poultry (chicken, turkey, duck) is a separate category.
const RED_MEAT_PATTERNS = [
  '\\bbeef',
  '\\bpork',
  '\\blamb',
  '\\bbacon',
  '\\bham\\b',
  '\\bsausage',
  '\\bchorizo',
  '\\bprosciutto',
  '\\bsalami',
  '\\bmince',
  '\\bmeatball',
  '\\bsteak',
  '\\bveal',
  '\\bliver',
  '\\bvenison',
  '\\bgoat\\b',
];

const MUSHROOM_PATTERNS = [
  '\\bmushroom',
  '\\bfungi',
  '\\bportobello',
  '\\bshiitake',
  '\\bcremini',
  '\\btruffle',
];

const LEAFY_GREENS_PATTERNS = [
  '\\bspinach',
  '\\bkale',
  '\\blettuce',
  '\\bchard',
  '\\barugula',
  '\\brocket',
  '\\bcollard',
  '\\bwatercress',
  '\\bcabbage',
];

const ONION_GARLIC_PATTERNS = [
  '\\bonion',
  '\\bgarlic',
  '\\bshallot',
  '\\bleek',
  '\\bscallion',
  '\\bspring onion',
  '\\bchive',
];

const SPICY_PATTERNS = [
  '\\bchil(?:i|li)',
  '\\bjalape[nñ]o',
  '\\bcayenne',
  '\\bsriracha',
  '\\bhabanero',
  '\\bhot sauce',
  '\\bharissa',
  '\\bgochujang',
];

const CILANTRO_PATTERNS = ['\\bcilantro', '\\bcoriander'];

// Canonical allergens/dislikes (normalized, singular) expand to the
// ingredient patterns they hide behind. Anything not listed falls back to
// the taxonomy recogniser (recogniseSafetyTerm) and, failing that, a raw
// literal term.
const ALLERGEN_PATTERNS: Record<string, string[]> = {
  peanut: PEANUT_PATTERNS,
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

// bug B-04: dislike categories expand the same way allergies do.
const DISLIKE_PATTERNS: Record<string, string[]> = {
  ...ALLERGEN_PATTERNS,
  'red meat': RED_MEAT_PATTERNS,
  meat: RED_MEAT_PATTERNS,
  mushroom: MUSHROOM_PATTERNS,
  mushrooms: MUSHROOM_PATTERNS,
  'leafy green': LEAFY_GREENS_PATTERNS,
  'leafy greens': LEAFY_GREENS_PATTERNS,
  'green vegetable': LEAFY_GREENS_PATTERNS,
  'green vegetables': LEAFY_GREENS_PATTERNS,
  onion: ONION_GARLIC_PATTERNS,
  garlic: ONION_GARLIC_PATTERNS,
  spicy: SPICY_PATTERNS,
  cilantro: CILANTRO_PATTERNS,
  coriander: CILANTRO_PATTERNS,
};

/** Pattern-set name (safety-taxonomy.ts `patternSet`) → its regex list. */
const PATTERN_SETS: Record<string, string[]> = {
  TREE_NUT_PATTERNS,
  PEANUT_PATTERNS,
  DAIRY_PATTERNS,
  EGG_PATTERNS,
  GLUTEN_PATTERNS,
  SOY_PATTERNS,
  FISH_PATTERNS,
  SHELLFISH_PATTERNS,
  SESAME_PATTERNS,
  RED_MEAT_PATTERNS,
  MUSHROOM_PATTERNS,
  LEAFY_GREENS_PATTERNS,
  ONION_GARLIC_PATTERNS,
  SPICY_PATTERNS,
  CILANTRO_PATTERNS,
  NONE: [],
};

// UX-REC-01: grains (paleo and keto both exclude them). Specific on purpose:
// "almond flour", "cauliflower rice" and "courgette noodles" are the usual
// grain-free swaps and must not trip the rule.
const FLOUR_FREE = notAfter(['almond', 'coconut', 'cassava', 'tapioca', 'arrowroot', 'flax']);
const GRAIN_PATTERNS = [
  '\\bwheat',
  `${FLOUR_FREE}\\bflour`,
  '(?<!cauliflower )(?<!broccoli )(?<!konjac )\\brice\\b(?! vinegar)(?! wine)',
  '\\boat',
  '\\bquinoa',
  '\\bbarley',
  '\\brye\\b',
  '\\bbulgur',
  '\\bcouscous',
  '\\bfarro',
  '\\bspelt',
  '\\bmillet',
  '\\bsorghum',
  '\\bbuckwheat',
  '\\bamaranth',
  '\\bteff',
  '\\bpolenta',
  '\\bsemolina',
  '\\bcorn(?!ed)',
  '\\bsweetcorn',
  '\\bbread',
  '\\btoast',
  '\\bpasta',
  '\\bspaghetti',
  '\\bmacaroni',
  '\\bpenne',
  '\\blasagn',
  '(?<!courgette )(?<!zucchini )(?<!zoodle )\\bnoodle',
  '\\btortilla',
  '\\bbagel',
  '\\bpita',
  '\\bcracker',
  '\\bcereal',
  '\\bgranola',
  '\\bmuesli',
  '\\bseitan',
  '\\bcrouton',
  '\\bbaguette',
  '\\bsourdough',
];

// Legumes. "green beans" and "snap peas" are pods eaten fresh and stay legal.
const BEANS_AND_PEAS_PATTERNS = [
  '(?<!green )(?<!string )(?<!runner )(?<!vanilla )(?<!coffee )(?<!cocoa )\\bbeans?\\b',
  '\\blentil',
  '\\bchickpea',
  '\\bchick pea',
  '\\bgarbanzo',
  '\\bhummus',
  '(?<!snap )(?<!snow )\\bpeas?\\b',
  '\\blupin',
];
const LEGUME_PATTERNS = [...BEANS_AND_PEAS_PATTERNS, ...PEANUT_PATTERNS, ...SOY_PATTERNS];

// Cheeses that are usually written without the word "cheese".
const NAMED_CHEESE_PATTERNS = [
  '\\bfeta',
  '\\bhalloumi',
  '\\bmozzarella',
  '\\bparmesan',
  '\\bparmigiano',
  '\\bricotta',
  '\\bcheddar',
  '\\bpaneer',
  '\\bmascarpone',
  '\\bskyr',
  '\\bquark',
];

// Refined sugar: coconut/date/palm sugar and sugar snap peas are not.
const REFINED_SUGAR_PATTERNS = [
  '(?<!coconut )(?<!date )(?<!palm )\\bsugar\\b(?! snap)',
  '\\bcorn syrup',
  '\\bhigh[- ]fructose',
];

// Paleo: no grains, legumes, dairy or refined sugar (UX-REC-01).
const PALEO_FORBIDDEN = [
  ...GRAIN_PATTERNS,
  ...LEGUME_PATTERNS,
  ...DAIRY_PATTERNS,
  ...NAMED_CHEESE_PATTERNS,
  ...REFINED_SUGAR_PATTERNS,
];

// Keto's ingredient fallback: the starchy and sugary staples. Used on its own
// when a recipe has no usable carb figure, and alongside the net-carb limit
// when it does (a recipe cannot be keto on a rounding error and a bowl of rice).
const KETO_FORBIDDEN = [
  ...GRAIN_PATTERNS,
  ...BEANS_AND_PEAS_PATTERNS,
  '\\bsugar\\b(?! snap)',
  '\\bhoney',
  '\\bsyrup',
  '\\bagave',
  '\\bjam\\b',
  '\\bpotato',
  '\\byam\\b',
  '\\bcassava',
  '\\bplantain',
  '\\bbanana',
];

/** Net carbs per serving a keto recipe may carry (a meal's share of a ~50 g day). */
export const KETO_MAX_NET_CARBS_G = 20;

// Dietary restrictions: the recipe must carry one of `anyTag` (when set) and
// must not match any `forbidden` pattern. Keys match the safety-taxonomy.ts
// diet ids (step-diet.tsx DIET_OPTIONS uses the same canonical values).
type RestrictionRule = { anyTag?: string[]; forbidden: string[]; netCarbLimitG?: number };
const RESTRICTION_RULES: Record<string, RestrictionRule> = {
  omnivore: { forbidden: [] },
  vegetarian: {
    anyTag: ['vegetarian', 'vegan'],
    forbidden: [...MEAT_PATTERNS, ...FISH_PATTERNS, ...SHELLFISH_PATTERNS],
  },
  // bug B-03: "vegetarian, no eggs" / bare "no eggs" used to be an unknown
  // free-text restriction and a silent no-op.
  'vegetarian-no-eggs': {
    anyTag: ['vegetarian', 'vegan'],
    forbidden: [...MEAT_PATTERNS, ...FISH_PATTERNS, ...SHELLFISH_PATTERNS, ...EGG_PATTERNS],
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
  // T-01.9: coeliac-strength gluten-free also excludes label-dependent
  // ingredients outright instead of only caveating them.
  'gluten-free-coeliac': {
    anyTag: ['gluten-free'],
    forbidden: [...GLUTEN_PATTERNS, ...LABEL_DEPENDENT_PATTERNS],
  },
  'egg-free': { anyTag: ['egg-free', 'vegan'], forbidden: EGG_PATTERNS },
  'dairy-free': { anyTag: ['dairy-free', 'vegan'], forbidden: DAIRY_PATTERNS },
  keto: { anyTag: ['keto'], forbidden: KETO_FORBIDDEN, netCarbLimitG: KETO_MAX_NET_CARBS_G },
  paleo: { anyTag: ['paleo'], forbidden: PALEO_FORBIDDEN },
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

/**
 * The regex patterns for a stored allergy/dislike term: the literal lookup
 * table first (today's behaviour, unchanged), then the taxonomy recogniser
 * (T-01.1 — `nuts`, `tree nut allergy`, legacy free text all resolve to the
 * same pattern set), and only then a raw literal-substring fallback so an
 * unrecognised term is never silently dropped (C5e).
 */
function patternsForTerm(term: string, table: Record<string, string[]>): string[] {
  const key = normalizeTerm(term);
  if (table[key]) return table[key];
  const recognised = recogniseSafetyTerm(term);
  if (recognised.kind !== 'unrecognised') {
    const patternSet = TAXONOMY_PATTERN_SET_BY_ID[recognised.id];
    if (patternSet && PATTERN_SETS[patternSet]) return PATTERN_SETS[patternSet];
  }
  return [`\\b${escapeRegExp(key)}`];
}

/** The RESTRICTION_RULES entry for a stored diet term — literal, then recognised. */
function ruleForRestriction(restriction: string): RestrictionRule | undefined {
  const key = restriction.trim().toLowerCase();
  if (RESTRICTION_RULES[key]) return RESTRICTION_RULES[key];
  const recognised = recogniseSafetyTerm(restriction);
  if (recognised.kind === 'diet' && RESTRICTION_RULES[recognised.id]) {
    return RESTRICTION_RULES[recognised.id];
  }
  if (
    recognised.kind === 'condition' &&
    recognised.impliesDietId &&
    RESTRICTION_RULES[recognised.impliesDietId]
  ) {
    return RESTRICTION_RULES[recognised.impliesDietId];
  }
  return undefined;
}

// id → patternSet map, built once from the shared taxonomy.
const TAXONOMY_PATTERN_SET_BY_ID: Record<string, string> = Object.fromEntries(
  SAFETY_TAXONOMY.map((entry) => [entry.id, entry.patternSet]),
);

// Steps are scanned too: an adapted recipe once kept "whisk peanut butter
// with coconut milk" in its method while its ingredient list was clean
// (audit F-REC-4-6).
function recipeText(recipe: SafetyCheckable): string {
  const parts = [recipe.name, ...recipe.ingredients.map((i) => i.name), ...recipe.instructions];
  return parts.join(' \n ').toLowerCase();
}

// ─── Diet verdicts (UX-REC-01) ────────────────────────────────────────────────

/** What a diet rule concluded about one recipe. */
export interface DietVerdict {
  /** `unverified`: untagged and nothing in the recipe could prove the diet. */
  status: 'pass' | 'fail' | 'unverified';
  /**
   * True when the recipe's own ingredients (and, for keto, its carb figures)
   * back the pass. A pass that rests on the stored tag alone is NOT verified —
   * clients say "Tagged paleo (not verified)", never "Checked".
   */
  verified: boolean;
  /** Ingredient names that broke the rule (empty when the text or a limit did). */
  ingredients: string[];
  /** Plain-language reason a limit failed ("22 g net carbs per serving"). */
  reason?: string;
}

/** Net carbs per serving, or null when the recipe has no usable carb figure. */
function netCarbsPerServing(recipe: SafetyCheckable): number | null {
  const n = recipe.nutritionInfo;
  if (!n || typeof n.carbs !== 'number' || !Number.isFinite(n.carbs)) return null;
  // No calories AND no carbs = a blank form, not a zero-carb recipe.
  if (!(n.carbs > 0) && !((n.calories ?? 0) > 0)) return null;
  // Catalogue-computed nutrition (COMPUTED/PARTIAL — and everything without a
  // status, which is the curated pool and AI recipes) already excludes fibre
  // (EU available carbohydrate). Only a figure someone TYPED can be a total
  // that includes it, so only then does fibre come off.
  const fibre = recipe.nutritionStatus === 'USER_ENTERED' ? Math.max(0, n.fiber ?? 0) : 0;
  return Math.max(0, n.carbs - fibre);
}

function verdictFor(
  recipe: SafetyCheckable,
  rule: RestrictionRule,
  options: SafetyOptions,
): DietVerdict {
  const text = recipeText(recipe);
  const tags = recipe.dietaryTags.map((t) => t.toLowerCase());
  const named = recipe.ingredients
    .filter((i) => matchesAny(i.name.toLowerCase(), rule.forbidden))
    .map((i) => i.name);
  if (named.length > 0 || matchesAny(text, rule.forbidden)) {
    return { status: 'fail', verified: true, ingredients: named };
  }

  let netCarbs: number | null = null;
  if (rule.netCarbLimitG !== undefined) {
    netCarbs = netCarbsPerServing(recipe);
    if (netCarbs !== null && netCarbs > rule.netCarbLimitG) {
      return {
        status: 'fail',
        verified: true,
        ingredients: [],
        reason: `${Math.round(netCarbs)} g net carbs per serving`,
      };
    }
  }

  // What the ingredients can prove: a rule with a carb limit needs a figure
  // that is not a lower bound (a PARTIAL recipe's total only counts the lines
  // that resolved); every rule needs an ingredient list to have been read.
  const verifiable =
    recipe.ingredients.length > 0 &&
    (rule.netCarbLimitG === undefined ||
      (netCarbs !== null && recipe.nutritionStatus !== 'PARTIAL'));
  const tagged = !rule.anyTag || rule.anyTag.some((tag) => tags.includes(tag));

  if (tagged) return { status: 'pass', verified: verifiable || !rule.anyTag, ingredients: [] };
  if (options.deriveFromIngredients) {
    return verifiable
      ? { status: 'pass', verified: true, ingredients: [] }
      : { status: 'unverified', verified: false, ingredients: [] };
  }
  return { status: 'fail', verified: false, ingredients: [] };
}

/**
 * How one stored diet term fares for a recipe, or null when the term is
 * unknown free text (those act as an ingredient block elsewhere).
 */
export function evaluateRestriction(
  recipe: SafetyCheckable,
  restriction: string,
  options: SafetyOptions = {},
): DietVerdict | null {
  const rule = ruleForRestriction(restriction);
  return rule ? verdictFor(recipe, rule, options) : null;
}

/**
 * True when the recipe is safe for the given preferences. Exported for unit
 * tests; production code goes through filterSafeRecipes.
 */
export function isRecipeSafe(
  recipe: SafetyCheckable,
  prefs: SafetyPrefs,
  options: SafetyOptions = {},
): boolean {
  const text = recipeText(recipe);

  for (const allergy of prefs.allergies) {
    if (matchesAny(text, patternsForTerm(allergy, ALLERGEN_PATTERNS))) return false;
  }

  for (const disliked of prefs.dislikedIngredients) {
    if (matchesAny(text, patternsForTerm(disliked, DISLIKE_PATTERNS))) return false;
  }

  const wantsGlutenFree = prefs.dietaryRestrictions.some((r) => {
    const rule = ruleForRestriction(r);
    return (
      rule === RESTRICTION_RULES['gluten-free'] || rule === RESTRICTION_RULES['gluten-free-coeliac']
    );
  });
  if (
    prefs.excludeLabelDependent &&
    wantsGlutenFree &&
    matchesAny(text, LABEL_DEPENDENT_PATTERNS)
  ) {
    return false;
  }

  for (const restriction of prefs.dietaryRestrictions) {
    const rule = ruleForRestriction(restriction);
    if (!rule) {
      // Unknown free-text restriction: treat it like a disliked ingredient
      // (never silently dropped — C5e).
      if (matchesAny(text, [`\\b${escapeRegExp(normalizeTerm(restriction))}`])) return false;
      continue;
    }
    if (verdictFor(recipe, rule, options).status !== 'pass') return false;
  }

  return true;
}

/**
 * The user's allergies and dietary restrictions the recipe conflicts with —
 * the matcher's boolean, decomposed per term so callers can say WHAT is
 * wrong. Dislikes are soft preferences and are not reported.
 */
export function findSafetyIssues(
  recipe: SafetyCheckable,
  prefs: Pick<SafetyPrefs, 'allergies' | 'dietaryRestrictions'>,
  options: SafetyOptions = {},
): string[] {
  const none = { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] };
  return [
    ...prefs.allergies.filter((a) => !isRecipeSafe(recipe, { ...none, allergies: [a] }, options)),
    ...prefs.dietaryRestrictions.filter(
      (r) => !isRecipeSafe(recipe, { ...none, dietaryRestrictions: [r] }, options),
    ),
  ];
}

export interface SafetyBlocker {
  /** The stored allergy/restriction term that still matches. */
  term: string;
  /** T-BUG-51: the actual ingredient names that triggered it (fail-closed evidence). */
  ingredients: string[];
  /** UX-REC-01: a limit rather than an ingredient broke it ("22 g net carbs per serving"). */
  reason?: string;
}

/**
 * Like `findSafetyIssues`, but names the actual ingredient(s) responsible
 * for each conflict (T-BUG-51: "restrictions named as ingredients" — the
 * import/save copy used to say "peanut" with no way to tell which line to
 * change; it now names the line).
 */
export function findSafetyBlockers(
  recipe: SafetyCheckable,
  prefs: Pick<SafetyPrefs, 'allergies' | 'dietaryRestrictions'>,
  options: SafetyOptions = {},
): SafetyBlocker[] {
  const blockers: SafetyBlocker[] = [];
  const matchingIngredients = (patterns: string[]): string[] =>
    recipe.ingredients.filter((i) => matchesAny(i.name.toLowerCase(), patterns)).map((i) => i.name);

  for (const allergy of prefs.allergies) {
    const patterns = patternsForTerm(allergy, ALLERGEN_PATTERNS);
    const ingredients = matchingIngredients(patterns);
    if (ingredients.length > 0 || matchesAny(recipe.name.toLowerCase(), patterns)) {
      blockers.push({ term: allergy, ingredients });
    }
  }

  for (const restriction of prefs.dietaryRestrictions) {
    const rule = ruleForRestriction(restriction);
    if (!rule) {
      const ingredients = matchingIngredients([`\\b${escapeRegExp(normalizeTerm(restriction))}`]);
      if (ingredients.length > 0) blockers.push({ term: restriction, ingredients });
      continue;
    }
    const verdict = verdictFor(recipe, rule, options);
    if (verdict.status === 'pass') continue;
    blockers.push({
      term: restriction,
      ingredients: verdict.ingredients,
      ...(verdict.reason && { reason: verdict.reason }),
    });
  }

  return blockers;
}

/**
 * T-01.9 (rev 2): the recipe's label-dependent ingredients (stock, curry
 * powder, soy sauce…) when the user wants gluten-free — shown as a caveat
 * ("Check the label") rather than excluding the recipe, unless
 * `excludeLabelDependent` is set (handled in `isRecipeSafe`, where it
 * excludes instead).
 */
export function findLabelCaveats(
  recipe: SafetyCheckable,
  prefs: Pick<SafetyPrefs, 'dietaryRestrictions'>,
): { ingredient: string; rule: string }[] {
  const wantsGlutenFree = prefs.dietaryRestrictions.some((r) => {
    const rule = ruleForRestriction(r);
    return rule === RESTRICTION_RULES['gluten-free'];
  });
  if (!wantsGlutenFree) return [];
  return recipe.ingredients
    .filter((i) => matchesAny(i.name.toLowerCase(), LABEL_DEPENDENT_PATTERNS))
    .map((i) => ({ ingredient: i.name, rule: 'gluten-free' }));
}

/**
 * T-01.10 (rev 2): diet tags derived from the recipe's own ingredients,
 * independent of (and more trustworthy than) the stored `dietaryTags` —
 * the curated pool's static tags are no longer trusted for these four.
 */
export function deriveDietTags(recipe: SafetyCheckable): string[] {
  const text = recipeText(recipe);
  const tags: string[] = [];
  if (!matchesAny(text, RESTRICTION_RULES['vegan']?.forbidden ?? [])) tags.push('vegan');
  if (!matchesAny(text, RESTRICTION_RULES['vegetarian']?.forbidden ?? [])) tags.push('vegetarian');
  if (!matchesAny(text, GLUTEN_PATTERNS)) tags.push('gluten-free');
  if (!matchesAny(text, DAIRY_PATTERNS)) tags.push('dairy-free');
  // UX-REC-01: the two diets that used to trust the stored tag blindly.
  const derive = { deriveFromIngredients: true } as const;
  for (const diet of ['paleo', 'keto'] as const) {
    const verdict = evaluateRestriction(recipe, diet, derive);
    if (verdict?.status === 'pass' && verdict.verified) tags.push(diet);
  }
  return tags;
}

/**
 * T-01.10: per-tag qualifier copy for a derived tag whose safety depends on
 * a label (AC14 — "no recipe shows a bare gluten-free derived tag while it
 * has a label-dependent ingredient").
 */
export function deriveTagQualifiers(recipe: SafetyCheckable): Record<string, string> {
  const qualifiers: Record<string, string> = {};
  const text = recipeText(recipe);
  if (!matchesAny(text, GLUTEN_PATTERNS)) {
    const labelDependent = recipe.ingredients.filter((i) =>
      matchesAny(i.name.toLowerCase(), LABEL_DEPENDENT_PATTERNS),
    );
    if (labelDependent.length > 0) {
      qualifiers['gluten-free'] =
        `gluten-free with GF-labelled ${labelDependent.map((i) => i.name).join(', ')}`;
    }
  }
  return qualifiers;
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
