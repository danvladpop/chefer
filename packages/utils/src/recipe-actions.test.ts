import { describe, expect, it } from 'vitest';
import { chunkShoppingLines, shoppingLinesFor } from './recipe-actions';

const ingredients = [
  { name: 'rolled oats', quantity: 60, unit: 'g' },
  { name: 'olive oil', quantity: 1, unit: 'tbsp' },
  { name: 'salt', quantity: 1, unit: 'to taste' },
];

describe('shoppingLinesFor (UX-REC-08)', () => {
  it('scales to the cooked servings and keeps units', () => {
    expect(shoppingLinesFor(ingredients, 4, 2)).toEqual([
      { name: 'rolled oats', quantity: 120, unit: 'g' },
      { name: 'olive oil', quantity: 2, unit: 'tbsp' },
      { name: 'salt', unit: 'to taste' },
    ]);
  });

  it('keeps every amount inside the API range', () => {
    const [line] = shoppingLinesFor([{ name: 'rice', quantity: 5000, unit: 'g' }], 1, 1);
    expect(line?.quantity).toBe(999);
  });

  it('chunks into API-sized batches', () => {
    const lines = Array.from({ length: 45 }, (_, i) => ({ name: `item ${i}`, unit: 'g' }));
    expect(chunkShoppingLines(lines).map((c) => c.length)).toEqual([20, 20, 5]);
  });
});
