import { describe, expect, it } from 'vitest';
import { mergeCitrusLines, roundToPurchasable } from './purchasable';

const line = (name: string, quantity: number, unit: string, recipeId = 'r1') => ({
  name,
  quantity,
  unit,
  recipeId,
});

describe('roundToPurchasable (UX-SHOP-03)', () => {
  it('rounds counts up to whole items', () => {
    expect(roundToPurchasable({ name: 'Avocado', quantity: 0.8, unit: 'piece' }).quantity).toBe(1);
    expect(roundToPurchasable({ name: 'Garlic', quantity: 5.5, unit: 'cloves' }).quantity).toBe(6);
    expect(roundToPurchasable({ name: 'Eggs', quantity: 4, unit: 'pcs' }).quantity).toBe(4);
  });

  it('does not turn float noise into an extra item', () => {
    expect(roundToPurchasable({ name: 'Egg', quantity: 3.0000001, unit: 'pcs' }).quantity).toBe(3);
  });

  it('keeps the recipe wording of the unit', () => {
    expect(roundToPurchasable({ name: 'Garlic', quantity: 5.5, unit: 'cloves' }).unit).toBe(
      'cloves',
    );
  });

  it('turns a weight of whole produce into a count', () => {
    // 3.2 oz ≈ 91 g of onion
    expect(roundToPurchasable({ name: 'Onion', quantity: 3.2, unit: 'oz' })).toMatchObject({
      quantity: 1,
      unit: 'pcs',
    });
    expect(roundToPurchasable({ name: 'Avocados', quantity: 340, unit: 'g' })).toMatchObject({
      quantity: 2,
      unit: 'pcs',
    });
  });

  it('keeps big quantities of produce as a weight', () => {
    expect(roundToPurchasable({ name: 'Potatoes', quantity: 2.5, unit: 'kg' })).toMatchObject({
      quantity: 2.5,
      unit: 'kg',
    });
    expect(roundToPurchasable({ name: 'Tomato', quantity: 900, unit: 'g' })).toMatchObject({
      quantity: 900,
      unit: 'g',
    });
  });

  it('rounds a weight up to a step the shelf offers', () => {
    expect(
      roundToPurchasable({ name: 'Chicken breast', quantity: 252.4, unit: 'g' }).quantity,
    ).toBe(260);
    expect(roundToPurchasable({ name: 'Rice', quantity: 62, unit: 'g' }).quantity).toBe(65);
    expect(roundToPurchasable({ name: 'Flour', quantity: 1.02, unit: 'kg' }).quantity).toBe(1.05);
  });

  it('rounds imperial amounts up to a half', () => {
    expect(roundToPurchasable({ name: 'Cheddar', quantity: 3.2, unit: 'oz' }).quantity).toBe(3.5);
    expect(roundToPurchasable({ name: 'Butter', quantity: 0.8, unit: 'lb' }).quantity).toBe(1);
  });

  it('leaves unknown units and non-positive amounts alone', () => {
    const pinch = { name: 'Saffron', quantity: 1.5, unit: 'pinch' };
    expect(roundToPurchasable(pinch)).toBe(pinch);
    const zero = { name: 'Salt', quantity: 0, unit: 'g' };
    expect(roundToPurchasable(zero)).toBe(zero);
  });
});

describe('mergeCitrusLines', () => {
  it('turns zest + juice of the same recipe into lemons, not two ml lines', () => {
    const out = mergeCitrusLines([line('Lemon zest', 15, 'ml'), line('Lemon juice', 45, 'ml')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Lemon', unit: 'piece' });
    // One lemon gives 15 ml zest AND 45 ml juice.
    expect(out[0]?.quantity).toBeCloseTo(1);
  });

  it('adds fruit across recipes', () => {
    const out = mergeCitrusLines([
      line('Lemon zest', 15, 'ml', 'r1'),
      line('Lemon juice', 45, 'ml', 'r2'),
    ]);
    expect(out.map((l) => l.quantity)).toEqual([1, 1]);
  });

  it('reads tsp/tbsp and "juice of a lime"', () => {
    const out = mergeCitrusLines([line('Juice of a lime', 2, 'tbsp')]);
    expect(out[0]).toMatchObject({ name: 'Lime', unit: 'piece' });
    expect(out[0]?.quantity).toBeCloseTo(1);
  });

  it('passes other lines through untouched', () => {
    const olive = line('Olive oil', 2, 'tbsp');
    const lemon = line('Lemon', 2, 'medium');
    expect(mergeCitrusLines([olive, lemon])).toEqual([olive, lemon]);
  });

  it('the audit example: 27 ml zest + 27 ml juice rounds to whole lemons', () => {
    const [merged] = mergeCitrusLines([
      line('Lemon zest', 27, 'ml'),
      line('Lemon juice', 27, 'ml'),
    ]);
    if (!merged) throw new Error('expected one merged line');
    expect(roundToPurchasable(merged).quantity).toBe(2);
  });
});
