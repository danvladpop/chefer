import { describe, expect, it } from 'vitest';
import {
  aggregateIngredientLines,
  canonicalIngredientName,
  isSkippedLine,
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
    // 202.5 + 10 + 25 = 237.5 ml → 15.8 tbsp
    expect(oil[0]).toMatchObject({ quantity: 15.8, unit: 'tbsp' });
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
