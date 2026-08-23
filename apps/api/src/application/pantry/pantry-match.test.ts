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
    expect(namesMatch('rice', 'rice vinegar')).toBe(true); // whole word — fine
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
