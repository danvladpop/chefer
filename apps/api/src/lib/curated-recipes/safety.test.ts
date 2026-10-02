import { describe, expect, it } from 'vitest';
import type { MealType, RecipeData } from '../ai/types.js';
import { CURATED_POOL_BY_TYPE, MIN_SAFE_POOL_SIZE, safeCuratedPools } from './index.js';
import {
  deriveDietTags,
  evaluateRestriction,
  filterSafeRecipes,
  findSafetyBlockers,
  findSafetyIssues,
  isRecipeSafe,
  KETO_MAX_NET_CARBS_G,
  type SafetyPrefs,
} from './safety.js';

const prefs = (over: Partial<SafetyPrefs>): SafetyPrefs => ({
  allergies: [],
  dietaryRestrictions: [],
  dislikedIngredients: [],
  ...over,
});

const recipe = (over: Partial<RecipeData>): RecipeData => ({
  id: 'r1',
  name: 'Test Recipe',
  description: 'd',
  ingredients: [],
  instructions: ['step'],
  nutritionInfo: { calories: 500, protein: 30, carbs: 40, fat: 20, fiber: 5 },
  cuisineType: 'generic',
  dietaryTags: [],
  prepTimeMins: 10,
  cookTimeMins: 10,
  servings: 1,
  imageUrl: null,
  ...over,
});

const PLAN_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

describe('isRecipeSafe — allergies', () => {
  it('a peanut allergy blocks peanut ingredients wherever they hide', () => {
    const r = recipe({ ingredients: [{ name: 'crunchy peanut butter', quantity: 20, unit: 'g' }] });
    expect(isRecipeSafe(r, prefs({ allergies: ['Peanuts'] }))).toBe(false);
  });

  it('a nut allergy expands to tree nuts, nut butters and coconut', () => {
    const almond = recipe({ ingredients: [{ name: 'almond butter', quantity: 20, unit: 'g' }] });
    const coconut = recipe({ ingredients: [{ name: 'coconut milk', quantity: 200, unit: 'ml' }] });
    const oats = recipe({ ingredients: [{ name: 'rolled oats', quantity: 80, unit: 'g' }] });
    expect(isRecipeSafe(almond, prefs({ allergies: ['nuts'] }))).toBe(false);
    expect(isRecipeSafe(coconut, prefs({ allergies: ['nuts'] }))).toBe(false);
    expect(isRecipeSafe(oats, prefs({ allergies: ['nuts'] }))).toBe(true);
  });

  it('a dairy allergy blocks cheese but not plant milks', () => {
    const feta = recipe({ ingredients: [{ name: 'feta cheese', quantity: 30, unit: 'g' }] });
    const oatMilk = recipe({ ingredients: [{ name: 'oat milk', quantity: 200, unit: 'ml' }] });
    expect(isRecipeSafe(feta, prefs({ allergies: ['dairy'] }))).toBe(false);
    expect(isRecipeSafe(oatMilk, prefs({ allergies: ['dairy'] }))).toBe(true);
  });

  it('matches the recipe NAME too, not just ingredients', () => {
    const r = recipe({ name: 'Peanut Satay Skewers' });
    expect(isRecipeSafe(r, prefs({ allergies: ['peanut'] }))).toBe(false);
  });
});

describe('isRecipeSafe — restrictions', () => {
  it('vegan requires the tag AND clean ingredients (mis-tags fail safe)', () => {
    const misTagged = recipe({
      dietaryTags: ['vegan'],
      ingredients: [{ name: 'Greek yogurt', quantity: 40, unit: 'g' }],
    });
    const genuine = recipe({
      dietaryTags: ['vegan'],
      ingredients: [{ name: 'chickpeas', quantity: 150, unit: 'g' }],
    });
    const untagged = recipe({ ingredients: [{ name: 'chickpeas', quantity: 150, unit: 'g' }] });
    expect(isRecipeSafe(misTagged, prefs({ dietaryRestrictions: ['Vegan'] }))).toBe(false);
    expect(isRecipeSafe(genuine, prefs({ dietaryRestrictions: ['Vegan'] }))).toBe(true);
    expect(isRecipeSafe(untagged, prefs({ dietaryRestrictions: ['Vegan'] }))).toBe(false);
  });

  it('vegan does not block eggplant (aubergine is not an egg)', () => {
    const r = recipe({
      dietaryTags: ['vegan'],
      ingredients: [{ name: 'eggplant', quantity: 1, unit: 'large' }],
    });
    expect(isRecipeSafe(r, prefs({ dietaryRestrictions: ['vegan'] }))).toBe(true);
  });

  it('vegetarian accepts vegan-tagged recipes, rejects fish', () => {
    const veganTagged = recipe({ dietaryTags: ['vegan'] });
    const fish = recipe({
      dietaryTags: ['vegetarian'], // mis-tagged
      ingredients: [{ name: 'smoked salmon', quantity: 60, unit: 'g' }],
    });
    expect(isRecipeSafe(veganTagged, prefs({ dietaryRestrictions: ['Vegetarian'] }))).toBe(true);
    expect(isRecipeSafe(fish, prefs({ dietaryRestrictions: ['Vegetarian'] }))).toBe(false);
  });

  it('gluten-free is not fooled by buckwheat', () => {
    const r = recipe({
      dietaryTags: ['gluten-free'],
      ingredients: [{ name: 'buckwheat groats', quantity: 70, unit: 'g' }],
    });
    expect(isRecipeSafe(r, prefs({ dietaryRestrictions: ['Gluten-Free'] }))).toBe(true);
  });

  it('an unrecognised free-text restriction acts as an ingredient block', () => {
    const r = recipe({ ingredients: [{ name: 'mushrooms', quantity: 100, unit: 'g' }] });
    expect(isRecipeSafe(r, prefs({ dietaryRestrictions: ['mushrooms'] }))).toBe(false);
  });
});

describe('isRecipeSafe — dislikes', () => {
  it('plural dislikes match singular ingredient mentions', () => {
    const r = recipe({ ingredients: [{ name: 'red onion', quantity: 20, unit: 'g' }] });
    expect(isRecipeSafe(r, prefs({ dislikedIngredients: ['Onions'] }))).toBe(false);
  });
});

// ─── The coverage guarantee (P1-2 acceptance) ─────────────────────────────────
// A free plan generates only while every plan meal type keeps at least
// MIN_SAFE_POOL_SIZE safe recipes. These tests pin that guarantee to the REAL
// pool for the restrictions the roadmap names — if a pool edit breaks
// coverage, this fails before a user ever sees the upsell where a plan
// should have been.

describe('curated pool coverage', () => {
  it(`ships ≥ 60 recipes overall`, () => {
    const total = Object.values(CURATED_POOL_BY_TYPE).flat().length;
    expect(total).toBeGreaterThanOrEqual(60);
  });

  const scenarios: [string, SafetyPrefs][] = [
    ['vegan', prefs({ dietaryRestrictions: ['Vegan'] })],
    ['vegetarian', prefs({ dietaryRestrictions: ['Vegetarian'] })],
    ['pescatarian', prefs({ dietaryRestrictions: ['Pescatarian'] })],
    ['gluten-free', prefs({ dietaryRestrictions: ['Gluten-Free'] })],
    ['dairy-free', prefs({ dietaryRestrictions: ['Dairy-Free'] })],
    ['nut allergy', prefs({ allergies: ['nuts'] })],
    ['peanut allergy', prefs({ allergies: ['peanuts'] })],
    ['egg allergy', prefs({ allergies: ['eggs'] })],
    ['vegan + nut allergy', prefs({ dietaryRestrictions: ['Vegan'], allergies: ['nuts'] })],
    ['vegan + gluten-free', prefs({ dietaryRestrictions: ['Vegan', 'Gluten-Free'] })],
  ];

  for (const [label, p] of scenarios) {
    it(`keeps ≥ ${MIN_SAFE_POOL_SIZE} ${label} recipes per plan meal type`, () => {
      for (const type of PLAN_MEAL_TYPES) {
        const safe = filterSafeRecipes(CURATED_POOL_BY_TYPE[type], p);
        expect(
          safe.length,
          `${type}: ${safe.length} safe recipes for ${label}`,
        ).toBeGreaterThanOrEqual(MIN_SAFE_POOL_SIZE);
      }
    });
  }

  it('safeCuratedPools returns the full pool when no prefs are set', () => {
    const pools = safeCuratedPools(prefs({}));
    expect(pools).toEqual(CURATED_POOL_BY_TYPE);
  });
});

// ─── Audit 2026-09-25: steps and safe substitutes ─────────────────────────────

const ing = (...names: string[]) => names.map((name) => ({ name, quantity: 1, unit: 'g' }));

describe('isRecipeSafe — instructions are scanned (F-REC-4-6)', () => {
  it('catches an allergen that survives only in the method', () => {
    const satay = recipe({
      name: 'Satay Skewers',
      ingredients: ing('chicken', 'toasted sunflower seeds'),
      instructions: ['Whisk peanut butter with coconut milk into a sauce.'],
    });
    expect(isRecipeSafe(satay, prefs({ allergies: ['Peanuts'] }))).toBe(false);
  });
});

describe('isRecipeSafe — safe substitutes are not flagged (F-REC-4-1)', () => {
  it('clears dairy-free and plant-based dairy words for a dairy allergy', () => {
    const r = recipe({
      ingredients: ing('dairy-free milk', 'vegan butter', 'plant-based cheese', 'non dairy yogurt'),
    });
    expect(isRecipeSafe(r, prefs({ allergies: ['Dairy'] }))).toBe(true);
  });

  it('still flags real dairy, including lactose-free milk', () => {
    expect(
      isRecipeSafe(recipe({ ingredients: ing('whole milk') }), prefs({ allergies: ['Dairy'] })),
    ).toBe(false);
    expect(
      isRecipeSafe(
        recipe({ ingredients: ing('lactose-free milk') }),
        prefs({ allergies: ['Dairy'] }),
      ),
    ).toBe(false);
  });

  it('clears egg-free mayo and gluten-free pasta for their own allergens only', () => {
    expect(
      isRecipeSafe(recipe({ ingredients: ing('egg-free mayo') }), prefs({ allergies: ['Egg'] })),
    ).toBe(true);
    expect(
      isRecipeSafe(
        recipe({ ingredients: ing('gluten-free pasta') }),
        prefs({ allergies: ['Gluten'] }),
      ),
    ).toBe(true);
    // A gluten-free qualifier does not clear soy.
    expect(
      isRecipeSafe(
        recipe({ ingredients: ing('gluten-free soy sauce') }),
        prefs({ allergies: ['Soy'] }),
      ),
    ).toBe(false);
  });
});

describe('findSafetyIssues', () => {
  it('names each conflicting allergy and restriction, ignoring dislikes', () => {
    const omelette = recipe({
      name: 'Ham and Cheese Omelette',
      ingredients: ing('eggs', 'ham', 'cheddar cheese'),
      dietaryTags: [],
    });
    expect(
      findSafetyIssues(omelette, {
        allergies: ['Eggs', 'Peanuts'],
        dietaryRestrictions: ['Vegetarian'],
      }),
    ).toEqual(['Eggs', 'Vegetarian']);
  });
});

// ─── UX-REC-01: diet checks read the ingredients, not just the tags ───────────

const line = (name: string, quantity = 100, unit = 'g') => ({ name, quantity, unit });
const DERIVE = { deriveFromIngredients: true } as const;
const PALEO = prefs({ dietaryRestrictions: ['Paleo'] });
const KETO = prefs({ dietaryRestrictions: ['Keto'] });

describe('paleo — grains, legumes, dairy and refined sugar are out (UX-REC-01)', () => {
  const quinoaSalad = recipe({
    name: 'Mexican Quinoa Salad',
    dietaryTags: ['vegetarian', 'paleo'], // the tag lies
    ingredients: [line('quinoa'), line('sweetcorn'), line('black beans'), line('lime juice')],
  });

  it('a quinoa salad is not paleo even when it is tagged paleo, and the blocker names the grain', () => {
    expect(isRecipeSafe(quinoaSalad, PALEO)).toBe(false);
    expect(findSafetyIssues(quinoaSalad, PALEO)).toEqual(['Paleo']);
    const [blocker] = findSafetyBlockers(quinoaSalad, PALEO);
    expect(blocker?.term).toBe('Paleo');
    expect(blocker?.ingredients).toEqual(expect.arrayContaining(['quinoa', 'black beans']));
  });

  it.each([
    ['rice', 'jasmine rice'],
    ['oats', 'rolled oats'],
    ['wheat', 'wholewheat pasta'],
    ['lentils', 'red lentils'],
    ['chickpeas', 'chickpeas'],
    ['peanuts', 'peanut butter'],
    ['dairy', 'Greek yogurt'],
    ['dairy (cheese by name)', 'halloumi'],
    ['refined sugar', 'brown sugar'],
  ])('%s is not paleo', (_label, ingredient) => {
    const r = recipe({ dietaryTags: ['paleo'], ingredients: [line(ingredient)] });
    expect(isRecipeSafe(r, PALEO)).toBe(false);
  });

  it.each([
    'almond flour',
    'cauliflower rice',
    'courgette noodles',
    'coconut milk',
    'coconut sugar',
    'green beans',
    'sugar snap peas',
    'corned beef',
    'sweet potato',
  ])('%s does not trip the rule', (ingredient) => {
    const r = recipe({ dietaryTags: ['paleo'], ingredients: [line(ingredient)] });
    expect(isRecipeSafe(r, PALEO)).toBe(true);
  });

  it('a genuine paleo plate passes and is verified from its ingredients', () => {
    const steak = recipe({
      dietaryTags: ['paleo'],
      ingredients: [line('sirloin steak'), line('courgette'), line('olive oil')],
    });
    expect(evaluateRestriction(steak, 'Paleo')).toMatchObject({ status: 'pass', verified: true });
    expect(deriveDietTags(steak)).toContain('paleo');
  });

  it('the curated pool no longer serves a paleo user a grain dish', () => {
    for (const pool of Object.values(CURATED_POOL_BY_TYPE)) {
      for (const r of filterSafeRecipes(pool, PALEO)) {
        expect(isRecipeSafe(r, PALEO)).toBe(true);
        expect(
          evaluateRestriction(r, 'Paleo')?.status,
          `${r.name} should not be paleo-safe with grains/legumes/dairy/sugar`,
        ).toBe('pass');
      }
    }
  });
});

describe('keto — a net-carb limit from the recipe nutrition, with an ingredient fallback (UX-REC-01)', () => {
  // `nutritionStatus` is not part of RecipeData; the safety check reads it off the row/DTO.
  const carbs = (carbsG: number, fiberG = 0, status?: string) => ({
    nutritionInfo: { calories: 500, protein: 30, carbs: carbsG, fat: 30, fiber: fiberG },
    ...(status ? { nutritionStatus: status } : {}),
  });

  it('a 110 g-carb recipe tagged keto is no longer keto', () => {
    const r = recipe({
      dietaryTags: ['keto'],
      ingredients: [line('chicken thigh'), line('olive oil')],
      ...carbs(110, 6),
    });
    expect(isRecipeSafe(r, KETO)).toBe(false);
    expect(findSafetyBlockers(r, KETO)[0]?.reason).toBe('110 g net carbs per serving');
  });

  it(`passes at or below ${KETO_MAX_NET_CARBS_G} g net carbs; typed totals lose their fibre first`, () => {
    const salad = recipe({
      dietaryTags: ['keto'],
      ingredients: [line('halloumi'), line('cucumber'), line('olive oil')],
      ...carbs(19.5, 5.3, 'COMPUTED'),
    });
    expect(isRecipeSafe(salad, KETO)).toBe(true);
    expect(evaluateRestriction(salad, 'Keto')?.verified).toBe(true);
    // 25 g computed carbs is over the limit…
    expect(isRecipeSafe(recipe({ ...salad, ...carbs(25, 5, 'COMPUTED') }), KETO)).toBe(false);
    // …but a typed 25 g TOTAL with 8 g fibre is 17 g net.
    expect(isRecipeSafe(recipe({ ...salad, ...carbs(25, 8, 'USER_ENTERED') }), KETO)).toBe(true);
  });

  it('computed nutrition already excludes fibre, so it is not subtracted twice', () => {
    const r = recipe({
      dietaryTags: ['keto'],
      ingredients: [line('eggs'), line('spinach')],
      ...carbs(26, 8, 'COMPUTED'),
    });
    expect(isRecipeSafe(r, KETO)).toBe(false); // 26 g net, not 18
  });

  it('starchy staples fail keto even when the figures look fine', () => {
    const r = recipe({
      dietaryTags: ['keto'],
      ingredients: [line('white rice'), line('chicken breast')],
      ...carbs(8),
    });
    expect(isRecipeSafe(r, KETO)).toBe(false);
  });

  it('with no usable carb figure, a tagged recipe passes on its tag alone, which is NOT verified', () => {
    const r = recipe({
      dietaryTags: ['keto'],
      ingredients: [line('eggs'), line('spinach')],
      nutritionInfo: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    });
    expect(evaluateRestriction(r, 'Keto')).toMatchObject({ status: 'pass', verified: false });
    expect(deriveDietTags(r)).not.toContain('keto');
  });

  it('a PARTIAL recipe cannot prove keto (its carbs are a lower bound)', () => {
    const r = recipe({
      dietaryTags: ['keto'],
      ingredients: [line('eggs'), line('mystery sauce')],
      ...carbs(3, 0, 'PARTIAL'),
    });
    expect(evaluateRestriction(r, 'Keto')).toMatchObject({ status: 'pass', verified: false });
  });

  it('an untagged recipe derives keto from its figures, or stays unverified without them', () => {
    const lowCarb = recipe({ ingredients: [line('salmon'), line('asparagus')], ...carbs(6, 3) });
    expect(isRecipeSafe(lowCarb, KETO)).toBe(false); // strict: untagged fails
    expect(isRecipeSafe(lowCarb, KETO, DERIVE)).toBe(true);
    expect(evaluateRestriction(lowCarb, 'Keto', DERIVE)).toMatchObject({
      status: 'pass',
      verified: true,
    });
    const blank = recipe({
      ingredients: [line('salmon')],
      nutritionInfo: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    });
    expect(evaluateRestriction(blank, 'Keto', DERIVE)?.status).toBe('unverified');
  });
});

describe('untagged user and imported recipes derive diet tags from their ingredients (UX-REC-01)', () => {
  const oats = recipe({ name: 'Porridge', ingredients: [line('rolled oats', 60)] });

  it('plain oats are vegetarian and vegan, not "non-vegetarian"', () => {
    const vegetarian = prefs({ dietaryRestrictions: ['Vegetarian'] });
    expect(isRecipeSafe(oats, vegetarian)).toBe(false); // the curated pool stays strict
    expect(isRecipeSafe(oats, vegetarian, DERIVE)).toBe(true);
    expect(isRecipeSafe(oats, prefs({ dietaryRestrictions: ['Vegan'] }), DERIVE)).toBe(true);
    expect(findSafetyIssues(oats, vegetarian, DERIVE)).toEqual([]);
  });

  it('but oats are still not paleo, and the reason names the grain', () => {
    expect(findSafetyIssues(oats, PALEO, DERIVE)).toEqual(['Paleo']);
    expect(findSafetyBlockers(oats, PALEO, DERIVE)[0]?.ingredients).toEqual(['rolled oats']);
  });

  it('a wrong-diet ingredient still fails an untagged recipe', () => {
    const chicken = recipe({ ingredients: [line('chicken breast')] });
    expect(isRecipeSafe(chicken, prefs({ dietaryRestrictions: ['Vegetarian'] }), DERIVE)).toBe(
      false,
    );
  });

  it('a recipe with no ingredients cannot be verified, so an untagged one stays unverified', () => {
    expect(evaluateRestriction(recipe({}), 'Vegetarian', DERIVE)?.status).toBe('unverified');
  });

  it('a tagged recipe passing on its tag with ingredients present is verified; tag-only is not', () => {
    const tagged = recipe({ dietaryTags: ['vegetarian'], ingredients: [line('lentils')] });
    expect(evaluateRestriction(tagged, 'Vegetarian')).toMatchObject({
      status: 'pass',
      verified: true,
    });
    const bare = recipe({ dietaryTags: ['vegetarian'] });
    expect(evaluateRestriction(bare, 'Vegetarian')).toMatchObject({
      status: 'pass',
      verified: false,
    });
  });
});
