import { describe, expect, it } from 'vitest';
import { buildPantryMatcher, namesMatch, rankRecipesByPantry } from './pantry-match.js';
import { isStapleIngredient } from './staples.js';

describe('isStapleIngredient (F3 denylist)', () => {
  it('excludes the classic staples in any casing', () => {
    for (const name of ['salt', 'Pepper', 'BLACK PEPPER', 'water', 'sugar', 'Baking Powder']) {
      expect(isStapleIngredient(name), name).toBe(true);
    }
  });

  it('excludes the oil/vinegar/salt suffix families', () => {
    for (const name of ['olive oil', 'sunflower oil', 'sesame oil', 'rice vinegar', 'sea salt']) {
      expect(isStapleIngredient(name), name).toBe(true);
    }
  });

  it('does NOT swallow real produce that merely contains a staple word', () => {
    for (const name of ['bell pepper', 'red peppers', 'watermelon', 'sugar snap peas']) {
      expect(isStapleIngredient(name), name).toBe(false);
    }
  });

  it('keeps trackable ingredients trackable', () => {
    for (const name of ['chicken breast', 'flour', 'butter', 'rice', 'fresh basil']) {
      expect(isStapleIngredient(name), name).toBe(false);
    }
  });

  it('excludes compound seasonings whose every part is a staple (found in dev e2e)', () => {
    for (const name of [
      'Salt and black pepper',
      'salt & pepper',
      'salt and pepper to taste',
      'Chilli flakes',
    ]) {
      expect(isStapleIngredient(name), name).toBe(true);
    }
    // …but mixed compounds with real food stay trackable.
    for (const name of ['chicken and rice', 'salt and chicken', 'tomato and basil sauce']) {
      expect(isStapleIngredient(name), name).toBe(false);
    }
  });
});

describe('namesMatch', () => {
  it('matches exact normalized names', () => {
    expect(namesMatch('Chicken  Breast ', 'chicken breast')).toBe(true);
  });

  it('matches whole-word containment both ways, plural-tolerant', () => {
    expect(namesMatch('tomato', 'cherry tomatoes')).toBe(true);
    expect(namesMatch('chicken breast', 'chicken')).toBe(true);
  });

  it('never matches inside another word', () => {
    expect(namesMatch('pepper', 'peppermint')).toBe(false);
    expect(namesMatch('rice', 'rice vinegar')).toBe(false); // vinegar is the head noun
  });

  it('matches the head noun only (audit F-PAN-1-2)', () => {
    expect(namesMatch('lemon', 'lemon juice')).toBe(false);
    expect(namesMatch('lemon', 'Lemon vinaigrette')).toBe(false);
    expect(namesMatch('rice', 'basmati rice')).toBe(true);
    expect(namesMatch('chicken', 'chicken thighs')).toBe(true); // a cut
    expect(namesMatch('coconut', 'coconut milk')).toBe(false);
    expect(namesMatch('eggs', 'Egg')).toBe(true);
  });

  it('a known smaller amount does not cover the line; unknown amounts do', () => {
    const matcher = buildPantryMatcher([
      { name: 'eggs', quantity: 3, unit: 'pcs' },
      { name: 'rice', quantity: 0, unit: 'some' },
      { name: 'milk', quantity: 1, unit: 'l' },
    ]);
    expect(matcher('Eggs', { quantity: 11, unit: 'pcs' })).toBeNull();
    expect(matcher('Eggs', { quantity: 2, unit: 'pieces' })).toBe('eggs');
    expect(matcher('Basmati rice', { quantity: 300, unit: 'g' })).toBe('rice');
    expect(matcher('Milk', { quantity: 250, unit: 'ml' })).toBe('milk');
    expect(matcher('Milk', { quantity: 2, unit: 'l' })).toBeNull();
  });

  it('short terms never match by containment', () => {
    expect(namesMatch('so', 'soy sauce')).toBe(false);
  });
});

describe('buildPantryMatcher', () => {
  it('returns the covering pantry name, null otherwise, and never covers staples', () => {
    const matcher = buildPantryMatcher(['tomato', 'chicken breast']);
    expect(matcher('Cherry Tomatoes')).toBe('tomato');
    expect(matcher('beef')).toBeNull();
    // Even if a staple somehow ended up matching, staples are never covered.
    const stapleMatcher = buildPantryMatcher(['olive oil']);
    expect(stapleMatcher('olive oil')).toBeNull();
  });
});

describe('rankRecipesByPantry (whatCanIMake)', () => {
  const recipes = [
    {
      name: 'Tomato Pasta',
      ingredients: [
        { name: 'spaghetti' },
        { name: 'tomato' },
        { name: 'olive oil' }, // staple — out of the math
        { name: 'basil' },
      ],
    },
    {
      name: 'Chicken Rice Bowl',
      ingredients: [{ name: 'chicken breast' }, { name: 'rice' }, { name: 'salt' }],
    },
    { name: 'Beef Stew', ingredients: [{ name: 'beef' }, { name: 'carrot' }] },
  ];

  it('ranks by coverage with staples excluded, dropping zero-match recipes', () => {
    const ranked = rankRecipesByPantry(recipes, ['chicken breast', 'rice', 'tomato']);
    expect(ranked.map((r) => r.name)).toEqual(['Chicken Rice Bowl', 'Tomato Pasta']);
    expect(ranked[0]).toMatchObject({ coverage: 1, missing: [] });
    // Tomato Pasta: tomato matched; spaghetti + basil missing; oil ignored.
    expect(ranked[1]!.matched).toEqual(['tomato']);
    expect(ranked[1]!.missing).toEqual(['spaghetti', 'basil']);
  });

  it('respects the limit', () => {
    const ranked = rankRecipesByPantry(recipes, ['tomato', 'beef', 'rice', 'chicken breast'], 1);
    expect(ranked).toHaveLength(1);
  });
});
