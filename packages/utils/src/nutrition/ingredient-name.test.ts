import { describe, expect, it } from 'vitest';
import {
  ingredientBaseKey,
  ingredientLookupKeys,
  ingredientSlug,
  normalizeIngredientKey,
  singularIngredientWord,
  slugToKey,
} from './ingredient-name';

describe('normalizeIngredientKey', () => {
  it('strips diacritics, case, apostrophes and punctuation', () => {
    expect(normalizeIngredientKey('Mărar')).toBe('marar');
    expect(normalizeIngredientKey('Cașcaval')).toBe('cascaval');
    expect(normalizeIngredientKey('Jalapeño')).toBe('jalapeno');
    expect(normalizeIngredientKey("Grandma's  Extra-Virgin Olive Oil")).toBe(
      'grandmas extra virgin olive oil',
    );
    expect(normalizeIngredientKey('Dark chocolate 70%')).toBe('dark chocolate 70%');
  });
});

describe('singularIngredientWord', () => {
  it.each([
    ['eggs', 'egg'],
    ['tomatoes', 'tomato'],
    ['berries', 'berry'],
    ['leaves', 'leaf'],
    ['radishes', 'radish'],
    ['peaches', 'peach'],
    ['hummus', 'hummus'],
    ['asparagus', 'asparagus'],
    ['couscous', 'couscous'],
    ['peas', 'pea'],
    ['oats', 'oat'],
  ])('%s → %s', (word, singular) => {
    expect(singularIngredientWord(word)).toBe(singular);
  });
});

describe('ingredientLookupKeys', () => {
  it('goes from most specific to most reduced', () => {
    expect(ingredientLookupKeys('Cherry tomatoes, halved')).toEqual([
      'cherry tomatoes halved',
      'cherry tomato halved',
      'cherry tomatoes',
      'cherry tomato',
    ]);
  });

  it('drops parentheticals, "for …" tails and prep words', () => {
    const keys = ingredientLookupKeys('Canned chickpeas (drained)');
    expect(keys).toContain('canned chickpeas');
    expect(keys).toContain('canned chickpea');
    expect(ingredientLookupKeys('Sunflower oil for wiping the pan')).toContain('sunflower oil');
    expect(ingredientLookupKeys('fresh basil leaves')).toContain('basil');
    expect(ingredientLookupKeys('Broccoli florets')).toContain('broccoli');
  });

  it('matches Romanian names without diacritics', () => {
    expect(ingredientLookupKeys('Brânză de vaci')[0]).toBe('branza de vaci');
  });

  it('returns nothing for an empty name', () => {
    expect(ingredientLookupKeys('  ')).toEqual([]);
  });
});

describe('ingredientBaseKey / slugs', () => {
  it('base key is the most reduced form', () => {
    expect(ingredientBaseKey('Fresh baby spinach, chopped')).toBe('baby spinach');
    expect(ingredientBaseKey('Eggs')).toBe('egg');
  });

  it('slugToKey and ingredientSlug round-trip simple names', () => {
    expect(slugToKey('olive-oil')).toBe('olive oil');
    expect(ingredientSlug('Lidl Pilos Skyr!')).toBe('lidl-pilos-skyr');
    expect(ingredientSlug('Ciocolată 70%')).toBe('ciocolata-70-pct');
  });
});
