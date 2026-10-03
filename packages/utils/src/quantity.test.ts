import { describe, expect, it } from 'vitest';
import {
  addItemPlaceholder,
  normalizeUnit,
  parseCustomItemInput,
  parsePantryQuantity,
  parseQuantityLine,
  unitFamily,
  unitOptionsFor,
} from './quantity';

describe('parseQuantityLine (UX-SHOP-01)', () => {
  it('splits amount, unit and the rest of the name', () => {
    expect(parseQuantityLine('2 lb chicken thighs')).toEqual({
      qty: 2,
      unit: 'lb',
      name: 'chicken thighs',
    });
  });

  it.each([
    ['2 kg flour', { qty: 2, unit: 'kg', name: 'flour' }],
    ['500g rice', { qty: 500, unit: 'g', name: 'rice' }],
    ['8 oz cheddar', { qty: 8, unit: 'oz', name: 'cheddar' }],
    ['1 cup oats', { qty: 1, unit: 'cup', name: 'oats' }],
    ['2 cups of flour', { qty: 2, unit: 'cup', name: 'flour' }],
    ['3 tbsp olive oil', { qty: 3, unit: 'tbsp', name: 'olive oil' }],
    ['1 tsp saffron', { qty: 1, unit: 'tsp', name: 'saffron' }],
    ['2 fl oz vanilla', { qty: 2, unit: 'fl oz', name: 'vanilla' }],
    ['1 can chickpeas', { qty: 1, unit: 'can', name: 'chickpeas' }],
    ['2 packs tortillas', { qty: 2, unit: 'pack', name: 'tortillas' }],
    ['750 ml milk', { qty: 750, unit: 'ml', name: 'milk' }],
    ['2 l water', { qty: 2, unit: 'l', name: 'water' }],
    ['6 pcs bagels', { qty: 6, unit: 'pcs', name: 'bagels' }],
    ['2 lbs beef', { qty: 2, unit: 'lb', name: 'beef' }],
    ['1.5 kg potatoes', { qty: 1.5, unit: 'kg', name: 'potatoes' }],
    ['1,5 kg potatoes', { qty: 1.5, unit: 'kg', name: 'potatoes' }],
    ['1/2 cup sugar', { qty: 0.5, unit: 'cup', name: 'sugar' }],
    ['1 1/2 lb butter', { qty: 1.5, unit: 'lb', name: 'butter' }],
    ['½ cup honey', { qty: 0.5, unit: 'cup', name: 'honey' }],
    ['2x eggs', { qty: 2, name: 'eggs' }],
  ])('%s', (input, expected) => {
    expect(parseQuantityLine(input)).toEqual(expected);
  });

  it('only reads a unit as a whole word', () => {
    expect(parseQuantityLine('2 large eggs')).toEqual({ qty: 2, name: 'large eggs' });
    expect(parseQuantityLine('2 garlic')).toEqual({ qty: 2, name: 'garlic' });
    expect(parseQuantityLine('2 xanthan gum')).toEqual({ qty: 2, name: 'xanthan gum' });
    expect(parseQuantityLine('2 lemons')).toEqual({ qty: 2, name: 'lemons' });
  });

  it('keeps plain text, zero and an amount with no name as a name', () => {
    expect(parseQuantityLine('paneer')).toEqual({ name: 'paneer' });
    expect(parseQuantityLine('  fresh   basil ')).toEqual({ name: 'fresh basil' });
    expect(parseQuantityLine('0 eggs')).toEqual({ name: '0 eggs' });
    expect(parseQuantityLine('2 kg')).toEqual({ qty: 2, name: 'kg' });
    expect(parseQuantityLine('')).toEqual({ name: '' });
  });
});

describe('parseCustomItemInput', () => {
  it('reads a bare number above 20 as grams (bug B-32), a small one as a count', () => {
    expect(parseCustomItemInput('225 paneer')).toEqual({
      name: 'paneer',
      quantity: 225,
      unit: 'g',
    });
    expect(parseCustomItemInput('3 eggs')).toEqual({ name: 'eggs', quantity: 3 });
  });

  it('understands imperial', () => {
    expect(parseCustomItemInput('2 lb chicken thighs')).toEqual({
      name: 'chicken thighs',
      quantity: 2,
      unit: 'lb',
    });
  });

  it('plain text is a name-only item', () => {
    expect(parseCustomItemInput('olive oil')).toEqual({ name: 'olive oil' });
  });
});

describe('unit vocabulary', () => {
  it('normalises spellings, qualifiers and size words', () => {
    expect(normalizeUnit('Tbsp')).toBe('tbsp');
    expect(normalizeUnit('cups, chopped')).toBe('cup');
    expect(normalizeUnit('g (dry)')).toBe('g');
    expect(normalizeUnit('pcs')).toBe('piece');
    expect(normalizeUnit('large')).toBe('piece');
    expect(normalizeUnit('fl oz')).toBe('fl oz');
  });

  it('knows mass from volume from counts', () => {
    expect(unitFamily('lb')?.family).toBe('mass');
    expect(unitFamily('fl oz')?.family).toBe('volume');
    expect(unitFamily('piece')).toBeNull();
  });

  it('teaches the user their own units', () => {
    expect(addItemPlaceholder('IMPERIAL')).toContain('lb');
    expect(addItemPlaceholder('METRIC')).toContain('kg');
    expect(unitOptionsFor('IMPERIAL')).toContain('lb');
    expect(unitOptionsFor('IMPERIAL')).not.toContain('kg');
    expect(unitOptionsFor('METRIC')).toContain('g');
  });
});

describe('parsePantryQuantity (UX-SHOP-05/07)', () => {
  it('an empty box is the "some" state', () => {
    expect(parsePantryQuantity('')).toEqual({ kind: 'some' });
    expect(parsePantryQuantity('  ')).toEqual({ kind: 'some' });
  });

  it('reads numbers, commas and fractions', () => {
    expect(parsePantryQuantity('250')).toEqual({ kind: 'amount', value: 250 });
    expect(parsePantryQuantity('1,5')).toEqual({ kind: 'amount', value: 1.5 });
    expect(parsePantryQuantity('1/2')).toEqual({ kind: 'amount', value: 0.5 });
    expect(parsePantryQuantity('½')).toEqual({ kind: 'amount', value: 0.5 });
  });

  it('refuses text, zero and negatives instead of saving "some left"', () => {
    for (const bad of ['abc', '-5', '0', '5 kg', '1..2']) {
      expect(parsePantryQuantity(bad).kind).toBe('invalid');
    }
  });

  it('refuses more than the API takes', () => {
    expect(parsePantryQuantity('10000').kind).toBe('invalid');
    expect(parsePantryQuantity('9999')).toEqual({ kind: 'amount', value: 9999 });
  });
});
