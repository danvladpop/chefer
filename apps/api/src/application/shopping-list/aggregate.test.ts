import { describe, expect, it } from 'vitest';
import {
  aggregateIngredientLines,
  canonicalIngredientName,
  coveredQuantity,
  isSkippedLine,
  tidyListItems,
  type IngredientLine,
} from './aggregate.js';

const line = (name: string, quantity: number, unit: string, recipeId = 'r1'): IngredientLine => ({
  name,
  quantity,
  unit,
  recipeId,
});

const byName = (lines: ReturnType<typeof aggregateIngredientLines>, name: string) =>
  lines.filter((l) => l.name.toLowerCase() === name.toLowerCase());

describe('canonicalIngredientName', () => {
  it('folds plurals, prep words and parentheticals', () => {
    expect(canonicalIngredientName('Eggs')).toBe(canonicalIngredientName('Egg'));
    expect(canonicalIngredientName('Fresh parsley')).toBe('parsley');
    expect(canonicalIngredientName('Canned chickpeas (drained)')).toBe('canned chickpea');
    expect(canonicalIngredientName('Quinoa (dry)')).toBe('quinoa');
    expect(canonicalIngredientName('Cherry tomatoes')).toBe('cherry tomato');
    expect(canonicalIngredientName('Mixed berries')).toBe('mixed berry');
    expect(canonicalIngredientName('parsley, chopped')).toBe('parsley');
  });

  it('leaves words ending in -us/-ss alone', () => {
    expect(canonicalIngredientName('Hummus')).toBe('hummus');
    expect(canonicalIngredientName('Asparagus')).toBe('asparagus');
  });
});

describe('isSkippedLine', () => {
  it('drops water, ice, to-taste lines and bare salt and pepper', () => {
    expect(isSkippedLine('Water', 'cups')).toBe(true);
    expect(isSkippedLine('Ice cubes', 'pieces')).toBe(true);
    expect(isSkippedLine('Salt and black pepper', 'to taste')).toBe(true);
    expect(isSkippedLine('Salt & pepper', 'pinch')).toBe(true);
  });

  it('keeps things people actually buy', () => {
    expect(isSkippedLine('Coconut water', 'ml')).toBe(false);
    expect(isSkippedLine('Bell pepper', 'medium')).toBe(false);
    expect(isSkippedLine('Olive oil', 'tbsp')).toBe(false);
    expect(isSkippedLine('Saffron', 'pinch')).toBe(false);
  });
});

describe('aggregateIngredientLines (audit F-SHOP-1-1 real list)', () => {
  it('merges olive oil across tbsp, tsp and ml into the dominant unit', () => {
    const out = aggregateIngredientLines([
      line('Olive oil', 13.5, 'tbsp'),
      line('Olive oil', 2, 'tsp', 'r2'),
      line('olive oil', 25, 'ml', 'r3'),
    ]);
    const oil = byName(out, 'Olive oil');
    expect(oil).toHaveLength(1);
    // 202.5 + 10 + 25 = 237.5 ml → 15.8 tbsp, bought as a whole 16
    expect(oil[0]).toMatchObject({ quantity: 16, unit: 'tbsp' });
    expect(oil[0]!.recipeIds.sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('merges Egg and Eggs, and plural units', () => {
    const out = aggregateIngredientLines([
      line('Eggs', 11, 'large'),
      line('Egg', 1, 'large'),
      line('Chickpeas', 0.5, 'cup'),
      line('Chickpeas', 1.5, 'cups'),
    ]);
    expect(out.find((l) => l.name === 'Egg')).toMatchObject({ quantity: 12, unit: 'large' });
    // cup + cups normalize to one unit; the first spelling is kept
    expect(out.find((l) => l.name === 'Chickpeas')).toMatchObject({ quantity: 2, unit: 'cup' });
  });

  it('keeps mass and volume of the same thing apart (no density guess)', () => {
    const out = aggregateIngredientLines([line('Flour', 200, 'g'), line('Flour', 1, 'cup')]);
    expect(out).toHaveLength(2);
  });

  it("keeps the recipe's unit wording when nothing was converted", () => {
    const [garlic] = aggregateIngredientLines([
      line('Garlic', 1, 'cloves'),
      line('Garlic', 2, 'cloves', 'r2'),
    ]);
    expect(garlic).toMatchObject({ quantity: 3, unit: 'cloves' });
  });

  it('only merges count units with the same unit', () => {
    const out = aggregateIngredientLines([line('Garlic', 2, 'cloves'), line('Garlic', 1, 'piece')]);
    expect(out).toHaveLength(2);
  });

  it('drops water and salt-and-pepper lines entirely', () => {
    const out = aggregateIngredientLines([
      line('Water', 3, 'cups'),
      line('Salt and black pepper', 2, 'to taste'),
      line('Rice', 70, 'g'),
    ]);
    expect(out.map((l) => l.name)).toEqual(['Rice']);
  });

  it('keeps the historical key for single-source lines so check-offs survive', () => {
    const [only] = aggregateIngredientLines([line('Basmati rice', 70, 'g')]);
    expect(only!.keyPart).toBe('basmati rice|g');
  });

  it('uses the shortest original wording as the display name', () => {
    const out = aggregateIngredientLines([
      line('Canned chickpeas (drained)', 100, 'g'),
      line('Canned chickpeas', 300, 'g'),
    ]);
    expect(out).toEqual([
      expect.objectContaining({ name: 'Canned chickpeas', quantity: 400, unit: 'g' }),
    ]);
  });
});

describe('shop-sized lines (WP-11, UX-SHOP-03/04)', () => {
  it('merges "Egg · 4 pcs" and "Eggs · 4 large" into one line', () => {
    const out = aggregateIngredientLines([line('Egg', 4, 'pcs'), line('Eggs', 4, 'large', 'r2')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Egg', quantity: 8, unit: 'pcs' });
  });

  it('merges on the catalog slug when both lines carry it, whatever they are called', () => {
    const out = aggregateIngredientLines([
      { ...line('Scallions', 2, 'pcs'), slug: 'spring-onion' },
      { ...line('Green onions', 3, 'pcs', 'r2'), slug: 'spring-onion' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ quantity: 5 });
  });

  it('rounds counts up to whole items', () => {
    const [avocado] = aggregateIngredientLines([line('Avocado', 0.8, 'piece')]);
    expect(avocado).toMatchObject({ quantity: 1 });
    const [garlic] = aggregateIngredientLines([line('Garlic', 5.5, 'cloves')]);
    expect(garlic).toMatchObject({ quantity: 6, unit: 'cloves' });
  });

  it('turns a sliver of whole produce written as a weight into a count', () => {
    const [onion] = aggregateIngredientLines([line('Onion', 90, 'g')]);
    expect(onion).toMatchObject({ quantity: 1, unit: 'pcs' });
  });

  it('merges lemon zest and juice into whole lemons', () => {
    const out = aggregateIngredientLines([
      line('Lemon zest', 27, 'ml'),
      line('Lemon juice', 27, 'ml'),
      line('Lemon', 1, 'medium', 'r2'),
    ]);
    expect(out).toHaveLength(1);
    // 27 ml zest = 1.8 lemons (zest and juice share fruit), + 1 lemon → 3
    expect(out[0]).toMatchObject({ name: 'Lemon', quantity: 3 });
  });

  it('rounds a weight up to a step the shelf offers', () => {
    const [chicken] = aggregateIngredientLines([line('Chicken breast', 252.4, 'g')]);
    expect(chicken).toMatchObject({ quantity: 260, unit: 'g' });
  });
});

describe('tidyListItems rounds AI rows too', () => {
  it('rounds a lone row up to a whole item', () => {
    const [row] = tidyListItems([
      { key: 'a', ingredientName: 'Avocado', quantity: '0.8', unit: 'pcs' },
    ]);
    expect(row).toMatchObject({ quantity: '1' });
  });
});

describe('coveredQuantity (bug B-24, T-BUG-24)', () => {
  it("converts `have` into `need`'s unit within the same family", () => {
    expect(coveredQuantity({ quantity: 0.5, unit: 'kg' }, { quantity: 800, unit: 'g' })).toBe(500);
    expect(coveredQuantity({ quantity: 100, unit: 'g' }, { quantity: 250, unit: 'g' })).toBe(100);
  });

  it('returns null for a different unit family (mass vs a bare count)', () => {
    expect(coveredQuantity({ quantity: 200, unit: 'g' }, { quantity: 6, unit: 'pcs' })).toBeNull();
  });

  it('returns null for an unknown ("some") or zero amount', () => {
    expect(coveredQuantity({ quantity: 0, unit: 'g' }, { quantity: 250, unit: 'g' })).toBeNull();
  });
});
