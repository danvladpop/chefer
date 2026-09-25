import { describe, expect, it } from 'vitest';
import { EMPTY_WIZARD_DATA, wizardDataFromPreferences } from './types';

describe('wizardDataFromPreferences', () => {
  it('starts blank when nothing is saved', () => {
    expect(wizardDataFromPreferences(null)).toEqual(EMPTY_WIZARD_DATA);
    expect(wizardDataFromPreferences({ chefProfile: null, dietaryPreferences: null })).toEqual(
      EMPTY_WIZARD_DATA,
    );
  });

  it('carries saved allergies into the wizard so Finish never blanks them (F-ONB-1-1)', () => {
    const data = wizardDataFromPreferences({
      chefProfile: null,
      dietaryPreferences: {
        dietaryRestrictions: ['Vegetarian'],
        allergies: ['Peanuts', 'Shellfish'],
        dislikedIngredients: ['Olives'],
        cuisinePreferences: ['Thai'],
        mealsPerDay: 4,
        servingSize: 2,
      },
    });
    expect(data.allergies).toEqual(['Peanuts', 'Shellfish']);
    expect(data.dietaryRestrictions).toEqual(['Vegetarian']);
    expect(data.mealsPerDay).toBe(4);
    expect(data.goal).toBeNull();
  });

  it('pre-fills goal and body metrics from a saved profile', () => {
    const data = wizardDataFromPreferences({
      chefProfile: {
        goal: 'MAINTAIN',
        biologicalSex: 'FEMALE',
        age: 34,
        heightCm: 168,
        weightKg: 62,
        activityLevel: 'LIGHTLY_ACTIVE',
      },
      dietaryPreferences: null,
    });
    expect(data).toMatchObject({ goal: 'MAINTAIN', age: 34, activityLevel: 'LIGHTLY_ACTIVE' });
    expect(data.allergies).toEqual([]);
  });
});
