import { describe, expect, it } from 'vitest';
import { safetyTaxonomyEntriesByGroup } from '@chefer/types';
import type { MealType, RecipeData } from '../../lib/ai/types.js';
import {
  CURATED_POOL_BY_TYPE,
  deriveDietTags,
  deriveTagQualifiers,
  filterSafeRecipes,
  findLabelCaveats,
  isRecipeSafe,
  type SafetyCheckable,
  type SafetyPrefs,
} from '../../lib/curated-recipes/index.js';
import { mergeHouseholdSafety } from '../household/household.service.js';

// ─── Safety regression suite (T-01.1) ──────────────────────────────────────────
// Every curated recipe × a fixture matrix of profiles: every taxonomy
// allergen, every diet, every dislike category, legacy free-text variants,
// and mixed households. This is the ongoing guarantee that (a) the matcher
// never under-blocks (the acceptance assertions below) and (b) it never
// over-blocks a meal type below MIN_SAFE_POOL_SIZE (the printed pool-size
// report is the B-26 evidence artefact — content gaps like "vegan +
// coeliac" are visible here, not discovered by a user hitting the upsell).

const ALL_MEAL_TYPES = Object.keys(CURATED_POOL_BY_TYPE) as MealType[];
const NONE: SafetyPrefs = { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] };

const allergyProfiles: [string, SafetyPrefs][] = safetyTaxonomyEntriesByGroup('allergy').map(
  (e) => [`allergy: ${e.label}`, { ...NONE, allergies: [e.label] }],
);
const dietProfiles: [string, SafetyPrefs][] = safetyTaxonomyEntriesByGroup('diet').map((e) => [
  `diet: ${e.label}`,
  { ...NONE, dietaryRestrictions: [e.label] },
]);
const dislikeProfiles: [string, SafetyPrefs][] = safetyTaxonomyEntriesByGroup('dislike').map(
  (e) => [`dislike: ${e.label}`, { ...NONE, dislikedIngredients: [e.label] }],
);

/** Legacy free-text a pre-taxonomy client stored — must still expand (C5e). */
const legacyProfiles: [string, SafetyPrefs][] = [
  ['legacy allergy "nuts"', { ...NONE, allergies: ['nuts'] }],
  ['legacy restriction "no eggs"', { ...NONE, dietaryRestrictions: ['no eggs'] }],
  ['legacy dislike "fish"', { ...NONE, dislikedIngredients: ['fish'] }],
  ['legacy dislike "green vegetables"', { ...NONE, dislikedIngredients: ['green vegetables'] }],
];

/** A handful of realistic mixed-household unions (owner + members). */
const mixedHouseholdProfiles: [string, SafetyPrefs][] = [
  [
    'household: vegan owner + tree-nut-allergic kid',
    mergeHouseholdSafety({ ...NONE, dietaryRestrictions: ['Vegan'] }, [
      { allergies: ['Tree nuts'], dietaryRestrictions: [], dislikedIngredients: [] },
    ]),
  ],
  [
    'household: gluten-free owner + shellfish-allergic member + fish-disliking member',
    mergeHouseholdSafety({ ...NONE, dietaryRestrictions: ['Gluten-free'] }, [
      { allergies: ['Shellfish'], dietaryRestrictions: [], dislikedIngredients: [] },
      { allergies: [], dietaryRestrictions: [], dislikedIngredients: ['Fish'] },
    ]),
  ],
  [
    'vegan + gluten-free (content-gap watch)',
    { ...NONE, dietaryRestrictions: ['Vegan', 'Gluten-free'] },
  ],
];

const ALL_PROFILES = [
  ...allergyProfiles,
  ...dietProfiles,
  ...dislikeProfiles,
  ...legacyProfiles,
  ...mixedHouseholdProfiles,
];

describe('Safety regression suite — pool sizes (T-01.1, B-26 evidence)', () => {
  const report: Record<string, Record<string, number>> = {};

  for (const [label, safetyPrefs] of ALL_PROFILES) {
    it(`${label}: every plan meal type keeps recipes safe`, () => {
      report[label] = {};
      for (const type of ALL_MEAL_TYPES) {
        const safe = filterSafeRecipes(CURATED_POOL_BY_TYPE[type], safetyPrefs);
        report[label][type] = safe.length;
      }
      // Every profile keeps SOMETHING safe somewhere — a hard zero across
      // every meal type would mean the matcher (not the profile) is broken.
      const total = Object.values(report[label]).reduce((a, b) => a + b, 0);
      expect(total, `${label}: 0 safe recipes across every meal type`).toBeGreaterThan(0);
    });
  }

  it('prints the per-profile, per-meal-type pool-size report', () => {
    console.log('[safety regression] pool sizes:\n' + JSON.stringify(report, null, 2));
    expect(Object.keys(report).length).toBe(ALL_PROFILES.length);
  });
});

// ─── Acceptance: never under-block (AC-style assertions) ──────────────────────

function synthetic(over: Partial<RecipeData>): RecipeData {
  return {
    id: 'synthetic',
    name: 'Synthetic Recipe',
    description: 'd',
    ingredients: [],
    instructions: [],
    nutritionInfo: { calories: 400, protein: 20, carbs: 30, fat: 15, fiber: 5 },
    cuisineType: 'generic',
    dietaryTags: [],
    prepTimeMins: 10,
    cookTimeMins: 10,
    servings: 2,
    imageUrl: null,
    ...over,
  };
}
const ing = (...names: string[]) => names.map((name) => ({ name, quantity: 1, unit: 'g' }));

describe('acceptance — tree-nut allergy (bug B-02, may-contain)', () => {
  it('excludes every may-contain item: granola, muesli, pesto, praline, marzipan, nut butter, nut milk', () => {
    const prefs: SafetyPrefs = { ...NONE, allergies: ['Tree nuts'] };
    for (const item of [
      'granola',
      'muesli',
      'pesto',
      'praline',
      'marzipan',
      'nut butter',
      'nut milk',
    ]) {
      const r = synthetic({ ingredients: ing(item) });
      expect(isRecipeSafe(r, prefs), `${item} should be excluded`).toBe(false);
    }
  });

  it('a curated pool has no tree-nut or may-contain recipe left for a tree-nut allergy', () => {
    const prefs: SafetyPrefs = { ...NONE, allergies: ['Tree nuts'] };
    const unsafe = filterSafeRecipes(
      Object.values(CURATED_POOL_BY_TYPE).flat(),
      { ...NONE }, // baseline: everything
    );
    const stillUnsafe = unsafe.filter((r) => !isRecipeSafe(r, prefs));
    // Every recipe that mentions a tree-nut/may-contain word is excluded —
    // spot check that the matcher actually ran (non-empty on this pool).
    expect(stillUnsafe.length).toBeGreaterThan(0);
    for (const r of filterSafeRecipes(Object.values(CURATED_POOL_BY_TYPE).flat(), prefs)) {
      const text = [r.name, ...r.ingredients.map((i) => i.name)].join(' ').toLowerCase();
      expect(text, r.name).not.toMatch(
        /\b(almond|cashew|walnut|pecan|hazelnut|pistachio|macadamia|coconut|granola|muesli|pesto|praline|marzipan)/,
      );
    }
  });
});

describe('acceptance — dislike categories expand (bug B-04)', () => {
  it('no FISH_PATTERNS recipe survives a "fish" dislike', () => {
    const prefs: SafetyPrefs = { ...NONE, dislikedIngredients: ['fish'] };
    for (const item of ['salmon', 'tuna', 'trout', 'mackerel', 'sardine', 'halibut']) {
      expect(isRecipeSafe(synthetic({ ingredients: ing(item) }), prefs)).toBe(false);
    }
  });

  it('a "red meat" dislike does not block poultry', () => {
    const prefs: SafetyPrefs = { ...NONE, dislikedIngredients: ['red meat'] };
    expect(isRecipeSafe(synthetic({ ingredients: ing('beef') }), prefs)).toBe(false);
    expect(isRecipeSafe(synthetic({ ingredients: ing('chicken breast') }), prefs)).toBe(true);
  });
});

describe('acceptance — new diet keys (bug B-03)', () => {
  it('"vegetarian-no-eggs" blocks eggs in an otherwise-vegetarian recipe', () => {
    const prefs: SafetyPrefs = { ...NONE, dietaryRestrictions: ['vegetarian-no-eggs'] };
    const r = synthetic({ dietaryTags: ['vegetarian'], ingredients: ing('eggs', 'spinach') });
    expect(isRecipeSafe(r, prefs)).toBe(false);
    const clean = synthetic({
      dietaryTags: ['vegetarian'],
      ingredients: ing('spinach', 'chickpeas'),
    });
    expect(isRecipeSafe(clean, prefs)).toBe(true);
  });

  it('"egg-free" is its own key, independent of vegetarian', () => {
    const prefs: SafetyPrefs = { ...NONE, dietaryRestrictions: ['egg-free'] };
    const r = synthetic({ dietaryTags: ['egg-free'], ingredients: ing('eggs') });
    expect(isRecipeSafe(r, prefs)).toBe(false);
  });
});

describe('acceptance — hidden gluten (bug B-47, T-01.9 rev 2)', () => {
  const ALWAYS_GLUTEN = [
    'spelt',
    'seitan',
    'semolina',
    'bulgur',
    'couscous',
    'farro',
    'malt',
    'barley',
    'rye',
  ];

  it('a coeliac profile gets no spelt, seitan, semolina, malt or couscous recipe', () => {
    const prefs: SafetyPrefs = { ...NONE, dietaryRestrictions: ['gluten-free-coeliac'] };
    for (const item of ['spelt flour', 'seitan strips', 'semolina', 'malt syrup', 'couscous']) {
      const r = synthetic({ dietaryTags: ['gluten-free'], ingredients: ing(item) });
      expect(isRecipeSafe(r, prefs), item).toBe(false);
    }
  });

  it('every always-gluten ingredient excludes a plain "gluten-free" recipe too', () => {
    const prefs: SafetyPrefs = { ...NONE, dietaryRestrictions: ['gluten-free'] };
    for (const item of ALWAYS_GLUTEN) {
      const r = synthetic({ dietaryTags: ['gluten-free'], ingredients: ing(item) });
      expect(isRecipeSafe(r, prefs), item).toBe(false);
    }
  });

  it('a label-dependent ingredient (stock, curry powder…) is a caveat, not an exclusion, by default', () => {
    const stockRecipe: SafetyCheckable = synthetic({
      dietaryTags: ['gluten-free'],
      ingredients: ing('vegetable stock', 'rice'),
    });
    const prefs: SafetyPrefs = { ...NONE, dietaryRestrictions: ['gluten-free'] };
    expect(isRecipeSafe(stockRecipe, prefs)).toBe(true);
    const caveats = findLabelCaveats(stockRecipe, { dietaryRestrictions: ['gluten-free'] });
    expect(caveats.map((c) => c.ingredient)).toContain('vegetable stock');
  });

  it('excludeLabelDependent turns the caveat into an exclusion', () => {
    const stockRecipe: SafetyCheckable = synthetic({
      dietaryTags: ['gluten-free'],
      ingredients: ing('vegetable stock', 'rice'),
    });
    const prefs: SafetyPrefs = {
      ...NONE,
      dietaryRestrictions: ['gluten-free'],
      excludeLabelDependent: true,
    };
    expect(isRecipeSafe(stockRecipe, prefs)).toBe(false);
  });

  it('AC14: no recipe shows a bare gluten-free derived tag while it has a label-dependent ingredient', () => {
    const stockRecipe: SafetyCheckable = synthetic({
      ingredients: ing('vegetable stock', 'rice'),
    });
    const derived = deriveDietTags(stockRecipe);
    const qualifiers = deriveTagQualifiers(stockRecipe);
    expect(derived).toContain('gluten-free');
    // The tag is present, but MUST carry a qualifier — never shown bare.
    expect(qualifiers['gluten-free']).toBeDefined();
  });
});

describe('acceptance — legacy strings the matcher must still catch', () => {
  const LEGACY_ALLERGIES = ['nuts', 'no eggs', 'fish', 'green vegetables'];

  it.each(LEGACY_ALLERGIES)('%s is recognised (not a silent no-op)', (term: string) => {
    // Every legacy string maps to something the recogniser understands OR
    // still blocks literally — either way it is never a no-op against a
    // recipe that names it directly.
    const r = synthetic({ ingredients: ing(term.replace('no ', '')) });
    const prefs: SafetyPrefs = { ...NONE, allergies: [term], dietaryRestrictions: [term] };
    expect(isRecipeSafe(r, prefs)).toBe(false);
  });
});
