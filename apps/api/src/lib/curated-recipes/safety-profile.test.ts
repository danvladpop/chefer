import { describe, expect, it } from 'vitest';
import {
  curatedSafetyProfile,
  deriveCuratedDietTags,
  finaliseDietaryTags,
  findHiddenAllergens,
} from './safety-profile.js';
import type { SafetyCheckable } from './safety.js';

// Market review F1: an ingested recipe's diet tags are proven from its
// ingredients, and a line whose name hides an allergen blocks approval.

function recipe(name: string, lines: string[], dietaryTags: string[] = []): SafetyCheckable {
  return {
    name,
    instructions: ['Cook everything.'],
    dietaryTags,
    ingredients: lines.map((n) => ({ name: n, quantity: 100, unit: 'g' })),
  };
}

describe('deriveCuratedDietTags', () => {
  it('proves vegan for a plant dish and drops pescatarian as redundant', () => {
    const tags = deriveCuratedDietTags(recipe('Bean stew', ['white beans', 'carrot', 'onion']));
    expect(tags).toEqual(expect.arrayContaining(['vegan', 'vegetarian', 'dairy-free', 'egg-free']));
    expect(tags).not.toContain('pescatarian');
  });

  it('never proves vegan or vegetarian for a dish with meat', () => {
    const tags = deriveCuratedDietTags(recipe('Sarmale', ['pork mince', 'cabbage', 'rice']));
    expect(tags).not.toContain('vegan');
    expect(tags).not.toContain('vegetarian');
    expect(tags).not.toContain('pescatarian');
  });

  it('marks a fish dish pescatarian', () => {
    expect(deriveCuratedDietTags(recipe('Baked trout', ['trout', 'lemon']))).toContain(
      'pescatarian',
    );
  });
});

describe('finaliseDietaryTags', () => {
  it("replaces every claimed diet tag with the proven ones and keeps the admin's other tags", () => {
    expect(finaliseDietaryTags(['Vegan', 'high-protein', 'gluten-free'], ['vegetarian'])).toEqual([
      'vegetarian',
      'high-protein',
    ]);
  });
});

describe('findHiddenAllergens', () => {
  it('flags a line the matcher cannot read when the recipe as written looks safe', () => {
    const r = recipe('Weeknight tomato bowl', ['spaghetti', 'tomato']);
    expect(curatedSafetyProfile(r).freeFrom).toContain('gluten');
    const hidden = findHiddenAllergens(r, ['Pasta, dry (wheat)', 'Tomato, raw']);
    expect(hidden).toEqual([
      { line: 'spaghetti', catalogName: 'Pasta, dry (wheat)', term: 'Gluten' },
    ]);
  });

  it('flags an opaque name hiding pine nuts (the matcher reads "pesto" itself)', () => {
    const hidden = findHiddenAllergens(recipe('Green bowl', ['green sauce', 'rice']), [
      'Pesto, basil, with pine nuts',
      'Rice, white',
    ]);
    expect(hidden.map((h) => h.term)).toContain('Tree nuts');
  });

  it('flags nothing when the written recipe already shows the conflict', () => {
    const r = recipe('Spaghetti with tomato pasta sauce', ['spaghetti', 'tomato']);
    expect(findHiddenAllergens(r, ['Pasta, dry (wheat)', 'Tomato, raw'])).toEqual([]);
  });

  it('skips unmatched lines', () => {
    expect(findHiddenAllergens(recipe('Bowl', ['spaghetti']), [null])).toEqual([]);
  });
});
