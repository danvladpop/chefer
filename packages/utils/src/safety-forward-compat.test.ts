import { describe, expect, it } from 'vitest';
import { classifySafetyValue, serialiseSafetyPickerValue } from './safety-classify';

// UX-ACC-06 is additive: a client (or taxonomy) that predates an allergen id
// meets it as an unknown key. It must render as its raw/humanised text and never
// throw. These stand in for a 1.0.1 binary, whose taxonomy lacks the new ids.

describe('unknown allergen keys', () => {
  it('an allergy this taxonomy does not know is kept as a visible note, not dropped or thrown on', () => {
    const classified = classifySafetyValue({
      allergies: ['Tree nuts', 'Zebra pollen'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    expect(classified.allergyIds).toEqual(['tree-nuts']);
    expect(classified.notes).toEqual(['Zebra pollen']);
  });

  it('an unknown allergy id serialises as its raw id', () => {
    const value = serialiseSafetyPickerValue({
      allergyIds: ['tree-nuts', 'future-allergen'],
      dietBaseId: null,
      dietModifierIds: [],
      dislikeIds: [],
      notes: [],
    });
    expect(value.allergies).toEqual(['Tree nuts', 'future-allergen']);
  });

  it('the new allergens round-trip by label', () => {
    const value = {
      allergies: ['Mustard', 'Molluscs'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    };
    const classified = classifySafetyValue(value);
    expect(classified.allergyIds).toEqual(['mustard', 'molluscs']);
    expect(serialiseSafetyPickerValue(classified).allergies).toEqual(['Mustard', 'Molluscs']);
  });
});
