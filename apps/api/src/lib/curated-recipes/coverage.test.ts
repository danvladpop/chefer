import { describe, expect, it } from 'vitest';
import type { MealType, RecipeData } from '../ai/types.js';
import { buildCoverageReport, weeksBeforeRepeat } from './coverage.js';
import { CURATED_POOL_BY_TYPE } from './index.js';

// Market review F2: the coverage report counts what users are actually served
// (the strict curated filter), per meal type.

function recipe(id: string, ingredients: string[], extra: Partial<RecipeData> = {}): RecipeData {
  return {
    id,
    name: id,
    description: '',
    ingredients: ingredients.map((name) => ({ name, quantity: 100, unit: 'g' })),
    instructions: ['Cook.'],
    nutritionInfo: { calories: 400, protein: 20, carbs: 40, fat: 10, fiber: 5 },
    cuisineType: 'Romanian',
    dietaryTags: [],
    prepTimeMins: 10,
    cookTimeMins: 10,
    servings: 2,
    imageUrl: null,
    ...extra,
  };
}

const POOLS: Record<MealType, RecipeData[]> = {
  breakfast: [recipe('oats', ['rolled oats', 'walnuts'], { dietaryTags: ['vegetarian', 'vegan'] })],
  lunch: [],
  dinner: [
    recipe('sarmale', ['pork mince', 'cabbage', 'rice'], { cookTimeMins: 120 }),
    recipe('ciorba', ['beans', 'carrot'], {
      dietaryTags: ['vegan', 'vegetarian', 'gluten-free', 'dairy-free'],
      cuisineType: 'Romanian',
    }),
  ],
  snack: [],
};

describe('buildCoverageReport', () => {
  const report = buildCoverageReport(POOLS, new Set(['ciorba']));

  it('counts meal types, ingested recipes, prep bands and cuisines', () => {
    expect(report.total).toBe(3);
    expect(report.ingested).toBe(1);
    expect(report.byMealType).toEqual({ breakfast: 1, lunch: 0, dinner: 2, snack: 0 });
    expect(report.byPrepTime.find((b) => b.id === 'over60')!.counts.dinner).toBe(1);
    expect(report.byCuisine[0]).toMatchObject({ label: 'Romanian', total: 3 });
  });

  it('counts diets the way the strict filter serves them', () => {
    const vegan = report.byDiet.find((d) => d.id === 'vegan')!;
    expect(vegan.counts).toEqual({ breakfast: 1, lunch: 0, dinner: 1, snack: 0 });
  });

  it('counts allergen-free classes from the ingredients', () => {
    const nutFree = report.byAllergenFree.find((d) => d.id === 'tree-nuts')!;
    expect(nutFree.counts.breakfast).toBe(0);
    expect(nutFree.counts.dinner).toBe(2);
  });

  it('flags profile cells that repeat within 2 weeks, worst first', () => {
    const vegNutFree = report.profiles.find((p) => p.id === 'vegan+nut-free')!;
    expect(vegNutFree.counts.breakfast).toBe(0);
    expect(report.thinSpots[0]).toMatchObject({ poolSize: 0, severity: 'repeats within 2 weeks' });
  });

  it('runs over the real fixture pool', () => {
    const real = buildCoverageReport(CURATED_POOL_BY_TYPE);
    expect(real.total).toBeGreaterThan(100);
    expect(real.profiles.find((p) => p.id === 'none')!.counts.dinner).toBe(
      CURATED_POOL_BY_TYPE.dinner.length,
    );
  });
});

describe('weeksBeforeRepeat', () => {
  it('is pool size over 7, to one decimal', () => {
    expect(weeksBeforeRepeat(14)).toBe(2);
    expect(weeksBeforeRepeat(10)).toBe(1.4);
  });
});
