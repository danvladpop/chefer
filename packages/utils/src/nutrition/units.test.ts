import { describe, expect, it } from 'vitest';
import { lineGrams, type NutritionIngredient } from './compute';
import { FDC_GOLDEN } from './fdc-golden.fixture';
import { normalizeRecipeUnit } from './units';

describe('normalizeRecipeUnit', () => {
  it.each([
    ['g', 'g', 'mass'],
    ['grams', 'g', 'mass'],
    ['Kilograms', 'kg', 'mass'],
    ['ounces', 'oz', 'mass'],
    ['lbs', 'lb', 'mass'],
    ['millilitres', 'ml', 'volume'],
    ['Litre', 'l', 'volume'],
    ['teaspoon', 'tsp', 'volume'],
    ['Tablespoons', 'tbsp', 'volume'],
    ['cups', 'cup', 'volume'],
    ['pinch', 'pinch', 'tiny'],
    ['to taste', 'to taste', 'tiny'],
    ['cloves', 'clove', 'portion'],
    ['pcs', 'piece', 'portion'],
    ['whole', 'piece', 'portion'],
    ['stalks', 'stalk', 'portion'],
    ['leaves', 'leaf', 'portion'],
    ['medium', 'medium', 'portion'],
  ])('%s → %s (%s)', (raw, unit, kind) => {
    expect(normalizeRecipeUnit(raw)).toEqual({ unit, kind });
  });

  it('splits trailing prep text into a note', () => {
    expect(normalizeRecipeUnit('g, chopped')).toEqual({ unit: 'g', kind: 'mass', note: 'chopped' });
    expect(normalizeRecipeUnit('cloves, minced')).toEqual({
      unit: 'clove',
      kind: 'portion',
      note: 'minced',
    });
    expect(normalizeRecipeUnit('medium, diced')).toEqual({
      unit: 'medium',
      kind: 'portion',
      note: 'diced',
    });
    expect(normalizeRecipeUnit('can (15oz)')).toEqual({
      unit: 'can',
      kind: 'portion',
      note: '15oz',
    });
    expect(normalizeRecipeUnit('cup chopped')).toEqual({
      unit: 'cup',
      kind: 'volume',
      note: 'chopped',
    });
    expect(normalizeRecipeUnit('cup (cooked)')).toEqual({
      unit: 'cup',
      kind: 'volume',
      note: 'cooked',
    });
  });

  it('a bare count (empty unit) is a piece', () => {
    expect(normalizeRecipeUnit('')).toEqual({ unit: 'piece', kind: 'portion' });
    expect(normalizeRecipeUnit(null)).toEqual({ unit: 'piece', kind: 'portion' });
  });

  it('never invents a unit for junk', () => {
    expect(normalizeRecipeUnit('lightyears')).toEqual({ unit: 'lightyears', kind: 'unknown' });
    expect(normalizeRecipeUnit('serving')).toEqual({ unit: 'serving', kind: 'unknown' });
    expect(normalizeRecipeUnit('pitted')).toEqual({ unit: 'pitted', kind: 'unknown' });
  });
});

// Unit table checks from the plan (§5.5), with densities and portions taken
// from FDC SR Legacy portion rows exactly as the catalog build derives them.
describe('unit table against FDC portion data', () => {
  const fromFdc = (
    key: keyof typeof FDC_GOLDEN,
    extra: Partial<NutritionIngredient>,
  ): NutritionIngredient => {
    const f = FDC_GOLDEN[key];
    return {
      id: key,
      kcalPer100g: f.kcal,
      proteinPer100g: f.protein,
      carbsPer100g: f.carbsByDifference - f.fiber,
      fatPer100g: f.fat,
      fiberPer100g: f.fiber,
      ...extra,
    };
  };
  const portionGrams = (key: keyof typeof FDC_GOLDEN, label: string): number => {
    const p = FDC_GOLDEN[key].portions.find((x) => x.label === label);
    if (!p) throw new Error(`${key}: no FDC portion "${label}"`);
    return p.gramWeight;
  };
  const cupGrams = (key: keyof typeof FDC_GOLDEN) => portionGrams(key, '1 cup');
  const grams = (r: { grams: number | null }): number => {
    if (r.grams === null) throw new Error('line unresolved');
    return r.grams;
  };

  it('1 cup flour ≈ 125 g (not 240 g)', () => {
    const flour = fromFdc('flourAllPurpose', {
      densityGPerMl: cupGrams('flourAllPurpose') / 236.6,
    });
    expect(lineGrams({ quantity: 1, unit: 'cup' }, flour).grams).toBeCloseTo(125, 0);
  });

  it('1 tbsp olive oil ≈ 13.5 g', () => {
    const oil = fromFdc('oliveOil', { densityGPerMl: cupGrams('oliveOil') / 236.6 });
    const g = grams(lineGrams({ quantity: 1, unit: 'tbsp' }, oil));
    expect(g).toBeGreaterThan(13.2);
    expect(g).toBeLessThan(13.8);
  });

  it('2 cloves garlic = 6 g (the old pricing heuristic gave ~1.5 g)', () => {
    const clove = portionGrams('garlic', '1 clove');
    const garlic = fromFdc('garlic', { portions: [{ unit: 'clove', grams: clove }] });
    const g = grams(lineGrams({ quantity: 2, unit: 'cloves' }, garlic));
    expect(g).toBeGreaterThanOrEqual(6);
    expect(g).toBeLessThanOrEqual(10);
  });

  it('mass units convert exactly', () => {
    const any = fromFdc('riceWhiteDry', {});
    expect(lineGrams({ quantity: 1, unit: 'kg' }, any).grams).toBe(1000);
    expect(lineGrams({ quantity: 1, unit: 'oz' }, any).grams).toBeCloseTo(28.35, 2);
    expect(lineGrams({ quantity: 1, unit: 'lb' }, any).grams).toBeCloseTo(453.59, 2);
  });
});
