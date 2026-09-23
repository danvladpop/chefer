import { describe, expect, it } from 'vitest';
import { namesMatch, normalizeForMatch, reconcileIngredientNames } from './reconcile.js';

describe('normalizeForMatch', () => {
  it('drops preparation after the first comma', () => {
    expect(normalizeForMatch('garlic cloves, minced')).toBe('garlic clove');
    expect(normalizeForMatch('fresh dill, chopped')).toBe('fresh dill');
  });

  it('strips size and prep qualifiers', () => {
    expect(normalizeForMatch('large eggs')).toBe('egg');
    expect(normalizeForMatch('finely chopped onion')).toBe('onion');
    expect(normalizeForMatch('boneless skinless chicken tenderloins')).toBe('chicken tenderloin');
  });

  it('removes parentheticals and punctuation', () => {
    expect(normalizeForMatch('flour (all-purpose)')).toBe('flour');
  });
});

describe('namesMatch', () => {
  // The exact pairs measured on a real reel: caption stage vs video stage.
  it.each([
    ['large eggs', 'eggs'],
    ['garlic cloves, minced', 'garlic'],
    ['fresh dill, chopped', 'fresh dill'],
    ['chipotle peppers in adobo, finely chopped', 'chipotle peppers in adobo'],
  ])('matches %s ↔ %s', (video, caption) => {
    expect(namesMatch(video, caption)).toBe(true);
  });

  it('does not match different ingredients', () => {
    expect(namesMatch('garlic', 'garlic powder')).toBe(false);
    expect(namesMatch('honey', 'hot sauce')).toBe(false);
    expect(namesMatch('chicken breast', 'chicken broth')).toBe(false);
  });

  it('is false when either name is empty after normalising', () => {
    expect(namesMatch('', 'garlic')).toBe(false);
    expect(namesMatch('minced', 'garlic')).toBe(false);
  });
});

describe('reconcileIngredientNames', () => {
  const video = [
    { name: 'large eggs', quantity: 2, unit: 'piece' },
    { name: 'garlic cloves, minced', quantity: 2, unit: 'clove' },
    { name: 'honey', quantity: 0.25, unit: 'cup' },
  ];
  const caption = [
    { name: 'eggs', quantity: 2, unit: 'piece' },
    { name: 'garlic', quantity: 2, unit: 'clove' },
    { name: 'honey', quantity: 0.25, unit: 'cup' },
  ];

  it("adopts the caption's cleaner names", () => {
    const { ingredients, renames } = reconcileIngredientNames(video, caption);
    expect(ingredients.map((i) => i.name)).toEqual(['eggs', 'garlic', 'honey']);
    expect(renames).toEqual(['"large eggs" → "eggs"', '"garlic cloves, minced" → "garlic"']);
  });

  it('leaves quantities and units untouched', () => {
    const { ingredients } = reconcileIngredientNames(video, caption);
    expect(ingredients[1]).toMatchObject({ quantity: 2, unit: 'clove' });
  });

  it('keeps the video name when the caption name is more specific', () => {
    // "chipotle" would lose the "in adobo" distinction — never trade down.
    const { ingredients, renames } = reconcileIngredientNames(
      [{ name: 'chipotle peppers', quantity: 5, unit: 'piece' }],
      [{ name: 'chipotle peppers in adobo', quantity: 5, unit: 'piece' }],
    );
    expect(ingredients[0]?.name).toBe('chipotle peppers');
    expect(renames).toEqual([]);
  });

  it('is a no-op when the caption stage produced nothing', () => {
    const { ingredients, renames } = reconcileIngredientNames(video, []);
    expect(ingredients).toEqual(video);
    expect(renames).toEqual([]);
  });
});
