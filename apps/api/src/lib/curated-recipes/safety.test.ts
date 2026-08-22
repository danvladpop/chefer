import { describe, expect, it } from 'vitest';
import type { MealType, RecipeData } from '../ai/types.js';
import { CURATED_POOL_BY_TYPE, MIN_SAFE_POOL_SIZE, safeCuratedPools } from './index.js';
import { filterSafeRecipes, isRecipeSafe, type SafetyPrefs } from './safety.js';

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
