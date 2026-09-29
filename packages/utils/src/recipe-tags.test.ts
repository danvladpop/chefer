import { describe, expect, it } from 'vitest';
import { tagConflicts } from './recipe-tags';

describe('tagConflicts (T-01.6, bug B-01)', () => {
  it('flags an ingredient that contradicts a ticked tag', () => {
    const conflicts = tagConflicts([{ name: 'Chicken breast' }, { name: 'Rice' }], ['vegetarian']);
    expect(conflicts).toEqual([{ tag: 'vegetarian', ingredients: ['chicken breast'] }]);
  });

  it('is case-insensitive on both the ingredient and the tag', () => {
    const conflicts = tagConflicts([{ name: 'WHOLE MILK' }], ['Dairy-Free']);
    expect(conflicts).toHaveLength(1);
  });

  it('reports nothing for a clean match', () => {
    expect(tagConflicts([{ name: 'chickpeas' }, { name: 'rice' }], ['vegan'])).toEqual([]);
  });

  it('ignores unknown tags (nothing to check them against)', () => {
    expect(tagConflicts([{ name: 'chicken' }], ['low-carb'])).toEqual([]);
  });

  it('can flag several tags independently', () => {
    const conflicts = tagConflicts(
      [{ name: 'butter' }, { name: 'wheat flour' }],
      ['dairy-free', 'gluten-free'],
    );
    expect(conflicts.map((c) => c.tag).sort()).toEqual(['dairy-free', 'gluten-free']);
  });
});
