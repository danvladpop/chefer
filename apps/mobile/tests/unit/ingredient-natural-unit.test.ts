import { naturalUnitForIngredient } from '../../src/features/ingredients/natural-unit';

// T-40.7 (UX-40 slice 2): "picking sets the row's natural unit (Eggs →
// piece, Milk → ml)". Pure, so it's unit-tested without rendering anything.

describe('naturalUnitForIngredient', () => {
  it('matches the spec examples', () => {
    expect(naturalUnitForIngredient('Eggs')).toBe('piece');
    expect(naturalUnitForIngredient('egg')).toBe('piece');
    expect(naturalUnitForIngredient('Milk')).toBe('ml');
  });

  it('matches a curated set of common countable/liquid ingredients, case-insensitively', () => {
    expect(naturalUnitForIngredient('Bananas')).toBe('piece');
    expect(naturalUnitForIngredient('ONION')).toBe('piece');
    expect(naturalUnitForIngredient('Olive oil')).toBe('ml');
    expect(naturalUnitForIngredient('Vegetable Broth')).toBe('ml');
  });

  it('returns undefined for anything not in the curated list, leaving the unit alone', () => {
    expect(naturalUnitForIngredient('flour')).toBeUndefined();
    expect(naturalUnitForIngredient('rolled oats')).toBeUndefined();
    expect(naturalUnitForIngredient('')).toBeUndefined();
  });
});
