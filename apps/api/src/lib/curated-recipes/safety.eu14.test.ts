import { describe, expect, it } from 'vitest';
import { safetyTaxonomyEntriesByGroup } from '@chefer/types';
import { recogniseSafetyTerm } from '@chefer/utils';
import type { RecipeData } from '../ai/types.js';
import { findSafetyBlockers, isRecipeSafe, type SafetyPrefs } from './safety.js';

// UX-ACC-06: the five EU-14 allergens the picker could not store (mustard,
// celery, lupin, sulphites, molluscs) plus crustaceans split out of shellfish.

const prefs = (allergies: string[]): SafetyPrefs => ({
  allergies,
  dietaryRestrictions: [],
  dislikedIngredients: [],
});

const withIngredient = (name: string): RecipeData => ({
  id: 'r',
  name: 'Test Recipe',
  description: 'd',
  ingredients: [{ name, quantity: 10, unit: 'g' }],
  instructions: ['Cook it.'],
  nutritionInfo: { calories: 500, protein: 30, carbs: 40, fat: 20, fiber: 5 },
  cuisineType: 'generic',
  dietaryTags: [],
  prepTimeMins: 10,
  cookTimeMins: 10,
  servings: 1,
  imageUrl: null,
});

const TRIGGERS: Record<string, string> = {
  mustard: 'Dijon mustard',
  celery: 'celery stalks',
  lupin: 'lupin flour',
  sulphites: 'dried apricots',
  molluscs: 'fresh mussels',
  crustaceans: 'king prawns',
};

describe('EU-14 allergens', () => {
  it('every taxonomy allergy blocks a recipe holding its trigger ingredient (no dangling pattern set)', () => {
    for (const entry of safetyTaxonomyEntriesByGroup('allergy')) {
      const trigger = TRIGGERS[entry.id];
      if (!trigger) continue;
      expect(isRecipeSafe(withIngredient(trigger), prefs([entry.label])), entry.id).toBe(false);
    }
  });

  it('all 14 EU allergen groups are selectable', () => {
    const ids = safetyTaxonomyEntriesByGroup('allergy').map((e) => e.id);
    for (const id of [
      'gluten',
      'crustaceans',
      'egg',
      'fish',
      'peanuts',
      'soy',
      'dairy',
      'tree-nuts',
      'celery',
      'mustard',
      'sesame',
      'sulphites',
      'lupin',
      'molluscs',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('a clean recipe stays safe for every new allergy', () => {
    const clean = withIngredient('chicken breast');
    for (const label of ['Mustard', 'Celery', 'Lupin', 'Sulphites', 'Molluscs', 'Crustaceans']) {
      expect(isRecipeSafe(clean, prefs([label])), label).toBe(true);
    }
  });

  it('Molluscs and Crustaceans are separate: each blocks only its own', () => {
    const mussels = withIngredient('fresh mussels');
    const prawns = withIngredient('king prawns');
    expect(isRecipeSafe(mussels, prefs(['Molluscs']))).toBe(false);
    expect(isRecipeSafe(prawns, prefs(['Molluscs']))).toBe(true);
    expect(isRecipeSafe(prawns, prefs(['Crustaceans']))).toBe(false);
    expect(isRecipeSafe(mussels, prefs(['Crustaceans']))).toBe(true);
  });

  it('the existing Shellfish allergy still blocks both (nobody who ticked it loses protection)', () => {
    expect(isRecipeSafe(withIngredient('fresh mussels'), prefs(['Shellfish']))).toBe(false);
    expect(isRecipeSafe(withIngredient('king prawns'), prefs(['Shellfish']))).toBe(false);
    expect(isRecipeSafe(withIngredient('squid rings'), prefs(['shellfish']))).toBe(false);
  });

  it('free-text variants resolve to the same rule', () => {
    expect(isRecipeSafe(withIngredient('wholegrain mustard'), prefs(['mustard allergy']))).toBe(
      false,
    );
    expect(isRecipeSafe(withIngredient('white wine'), prefs(['sulfites']))).toBe(false);
    expect(isRecipeSafe(withIngredient('celeriac'), prefs(['celery']))).toBe(false);
    expect(isRecipeSafe(withIngredient('lupini beans'), prefs(['lupine']))).toBe(false);
    expect(isRecipeSafe(withIngredient('oysters'), prefs(['mollusks']))).toBe(false);
    expect(recogniseSafetyTerm('Mustard')).toMatchObject({ kind: 'allergy', id: 'mustard' });
    expect(recogniseSafetyTerm('crustacean')).toMatchObject({ id: 'crustaceans' });
  });

  it('names the offending ingredient when a plan is checked', () => {
    const blockers = findSafetyBlockers(withIngredient('Dijon mustard'), {
      allergies: ['Mustard'],
      dietaryRestrictions: [],
    });
    expect(blockers).toEqual([{ term: 'Mustard', ingredients: ['Dijon mustard'] }]);
  });
});
