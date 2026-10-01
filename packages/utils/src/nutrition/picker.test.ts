import { describe, expect, it } from 'vitest';
import { INGREDIENT_CATEGORIES } from '@chefer/types';
import {
  INGREDIENT_CATEGORY_LABELS,
  isUnitAllowedFor,
  lineProblemCopy,
  nutritionComputedCopy,
  nutritionIncompleteCopy,
  nutritionSourceLabel,
  PICKER_CATEGORY_CHIPS,
  pickerUnitForIngredient,
  pickerUnitOptions,
} from './picker';

const GARLIC = { hasDensity: false, portions: [{ unit: 'clove' }, { unit: 'head' }] };
const OIL = { hasDensity: true, portions: [] };

describe('pickerUnitOptions', () => {
  it('offers grams, the row’s portions and tiny amounts — never volume without a density (I6)', () => {
    const units = pickerUnitOptions(GARLIC);
    expect(units.slice(0, 4)).toEqual(['g', 'kg', 'clove', 'head']);
    expect(units).toContain('pinch');
    expect(units).not.toContain('ml');
    expect(units).not.toContain('cup');
    expect(units).not.toContain('piece');
  });

  it('adds the volume units when the row has a density', () => {
    expect(pickerUnitOptions(OIL)).toEqual(
      expect.arrayContaining(['g', 'ml', 'l', 'tsp', 'tbsp', 'cup']),
    );
  });

  it('never lists a unit twice', () => {
    const units = pickerUnitOptions({ hasDensity: true, portions: [{ unit: 'cup' }] });
    expect(new Set(units).size).toBe(units.length);
  });

  it('offers every generic unit before an ingredient is picked', () => {
    expect(pickerUnitOptions(null)).toEqual(expect.arrayContaining(['g', 'ml', 'piece']));
  });
});

describe('unit checks', () => {
  it('accepts any spelling of an allowed unit', () => {
    expect(isUnitAllowedFor('cloves', GARLIC)).toBe(true);
    expect(isUnitAllowedFor('tbsp', GARLIC)).toBe(false);
    expect(isUnitAllowedFor('tablespoons', OIL)).toBe(true);
    expect(isUnitAllowedFor('g', null)).toBe(false);
  });

  it('keeps the current unit when the new ingredient converts it, else grams', () => {
    expect(pickerUnitForIngredient('cloves', GARLIC)).toBe('clove');
    expect(pickerUnitForIngredient('cup', GARLIC)).toBe('g');
    expect(pickerUnitForIngredient('', OIL)).toBe('g');
    expect(pickerUnitForIngredient('tbsp', OIL)).toBe('tbsp');
  });
});

describe('copy', () => {
  it('counts ingredients with the right plural', () => {
    expect(nutritionComputedCopy(1)).toBe('Nutrition is computed from 1 ingredient');
    expect(nutritionComputedCopy(7)).toBe('Nutrition is computed from 7 ingredients');
    expect(nutritionIncompleteCopy(1)).toBe('Incomplete — 1 ingredient needs data');
    expect(nutritionIncompleteCopy(2)).toBe('Incomplete — 2 ingredients need data');
  });

  it('describes every line problem', () => {
    for (const p of ['NO_INGREDIENT', 'NO_DENSITY', 'NO_PORTION', 'BAD_UNIT', 'BAD_QTY'] as const) {
      expect(lineProblemCopy(p).length).toBeGreaterThan(5);
    }
  });

  it('labels sources as USDA / CIQUAL / Label / Mine', () => {
    expect(nutritionSourceLabel('USDA_FDC')).toBe('USDA');
    expect(nutritionSourceLabel('CIQUAL', 'global')).toBe('CIQUAL');
    expect(nutritionSourceLabel('LABEL')).toBe('Label');
    expect(nutritionSourceLabel('USER')).toBe('Mine');
    expect(nutritionSourceLabel('USDA_FDC', 'mine')).toBe('Mine');
  });

  it('has a label for every category, and chips only from the enum', () => {
    for (const c of INGREDIENT_CATEGORIES) expect(INGREDIENT_CATEGORY_LABELS[c]).toBeTruthy();
    for (const c of PICKER_CATEGORY_CHIPS) expect(INGREDIENT_CATEGORIES).toContain(c);
  });
});
