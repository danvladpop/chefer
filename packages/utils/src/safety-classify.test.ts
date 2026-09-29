import { describe, expect, it } from 'vitest';
import {
  classifySafetyValue,
  serialiseSafetyPickerValue,
  type SafetyPickerValue,
} from './safety-classify';

describe('classifySafetyValue (T-01.7)', () => {
  it('buckets a canonical allergy, base diet, modifier and dislike', () => {
    const value: SafetyPickerValue = {
      allergies: ['Tree nuts'],
      dietaryRestrictions: ['Vegetarian', 'Dairy-free'],
      dislikedIngredients: ['Fish'],
    };
    const classified = classifySafetyValue(value);
    expect(classified.allergyIds).toEqual(['tree-nuts']);
    expect(classified.dietBaseId).toBe('vegetarian');
    expect(classified.dietModifierIds).toEqual(['dairy-free']);
    expect(classified.dislikeIds).toEqual(['fish']);
    expect(classified.notes).toEqual([]);
  });

  it('recognises legacy free text via synonyms (AC2)', () => {
    const value: SafetyPickerValue = {
      allergies: ['nuts'],
      // A bare "no eggs" is itself a `vegetarian-no-eggs` synonym (bug B-03)
      // — a stored value already carries that intent, unlike a brand-new
      // "Something else" entry, whose base-diet-aware disambiguation
      // (AC2's "Vegetarian, no eggs" vs. the Egg-free modifier) is the
      // picker UI's job at add-time, not this loader.
      dietaryRestrictions: ['no eggs'],
      dislikedIngredients: ['green vegetables'],
    };
    const classified = classifySafetyValue(value);
    expect(classified.allergyIds).toEqual(['tree-nuts']);
    expect(classified.dietBaseId).toBe('vegetarian-no-eggs');
    expect(classified.dislikeIds).toEqual(['leafy-greens']);
  });

  it('maps coeliac to the gluten-free-coeliac diet automatically (T-22.1)', () => {
    const classified = classifySafetyValue({
      allergies: [],
      dietaryRestrictions: ['coeliac'],
      dislikedIngredients: [],
    });
    expect(classified.dietModifierIds).toEqual(['gluten-free-coeliac']);
    expect(classified.notes).toEqual([]);
  });

  it('keeps an unrecognised or other-condition term as a note, never dropped (C5e)', () => {
    const classified = classifySafetyValue({
      allergies: [],
      dietaryRestrictions: ['pre-diabetes'],
      dislikedIngredients: ['zzz'],
    });
    expect(classified.notes).toEqual(['pre-diabetes', 'zzz']);
  });

  it('never silently drops a recognised diet id the picker has no chip for (C5e)', () => {
    // Plain "Gluten-free" (not the coeliac-strength diet) has no dedicated
    // "Also:" chip in this picker, but must still round-trip.
    const value: SafetyPickerValue = {
      allergies: [],
      dietaryRestrictions: ['Gluten-free'],
      dislikedIngredients: [],
    };
    const classified = classifySafetyValue(value);
    expect(classified.dietModifierIds).toEqual(['gluten-free']);
    const serialised = serialiseSafetyPickerValue(classified);
    expect(serialised.dietaryRestrictions).toEqual(['Gluten-free']);
  });

  it('round-trips through serialiseSafetyPickerValue', () => {
    const value: SafetyPickerValue = {
      allergies: ['Tree nuts', 'Eggs'],
      dietaryRestrictions: ['Vegan'],
      dislikedIngredients: ['Fish', 'a note nobody recognises'],
    };
    const classified = classifySafetyValue(value);
    const serialised = serialiseSafetyPickerValue(classified);
    expect([...serialised.allergies].sort()).toEqual(['Eggs', 'Tree nuts'].sort());
    expect(serialised.dietaryRestrictions).toEqual(['Vegan']);
    expect(serialised.dislikedIngredients).toContain('Fish');
    expect(serialised.dislikedIngredients).toContain('a note nobody recognises');
    // Re-classifying the round-tripped value gives the same picker state.
    expect(classifySafetyValue(serialised)).toEqual(classified);
  });
});
