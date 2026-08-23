import { describe, expect, it } from 'vitest';
import { buildLeftoversSection, buildMealPlanUserPrompt, buildUseFirstSection } from './prompts.js';
import type { MealPlanInput } from './types.js';

// F3-owned prompt sections (feat/pantry) — the household section has its own
// coverage in prompts.test.ts.

const baseInput: MealPlanInput = {
  userId: 'u1',
  goal: 'MAINTAIN',
  biologicalSex: 'MALE',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'MODERATELY_ACTIVE',
  dailyCalorieTarget: 2400,
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
  cuisinePreferences: [],
  mealsPerDay: 3,
  servingSize: 1,
};

describe('buildUseFirstSection (F3)', () => {
  it('returns empty without the seam field — base prompt stays byte-identical', () => {
    expect(buildUseFirstSection(baseInput)).toBe('');
    expect(buildUseFirstSection({ ...baseInput, useFirstIngredients: [] })).toBe('');
  });

  it('lists items with quantity, unit and reason, oldest-first urgency spelled out', () => {
    const section = buildUseFirstSection({
      ...baseInput,
      useFirstIngredients: [
        { name: 'lentils', quantity: 400, unit: 'g', reason: 'in the kitchen for 3 weeks' },
        { name: 'feta', quantity: 200, unit: 'g', reason: 'bought last week' },
      ],
    });
    expect(section).toContain('lentils (400 g — in the kitchen for 3 weeks)');
    expect(section).toContain('feta (200 g — bought last week)');
    expect(section).toContain('oldest first');
    expect(section).toContain('soft constraint');
  });

  it('renders the quantity-0 "some" state as words, never "0 g"', () => {
    const section = buildUseFirstSection({
      ...baseInput,
      useFirstIngredients: [
        { name: 'rice', quantity: 0, unit: 'g', reason: 'some left — use it up' },
      ],
    });
    expect(section).toContain('rice (some — some left — use it up)');
    expect(section).not.toContain('0 g');
  });

  it('lands in the full user prompt via the seam loop', () => {
    const prompt = buildMealPlanUserPrompt({
      ...baseInput,
      useFirstIngredients: [{ name: 'lentils', quantity: 400, unit: 'g', reason: 'old' }],
    });
    expect(prompt).toContain('Pantry (soft constraint');
  });
});

describe('buildLeftoversSection (F3)', () => {
  it('returns empty unless leftoversMode is set', () => {
    expect(buildLeftoversSection(baseInput)).toBe('');
    expect(buildLeftoversSection({ ...baseInput, leftoversMode: false })).toBe('');
  });

  it('steers toward double-batch-friendly dinners when enabled', () => {
    const section = buildLeftoversSection({ ...baseInput, leftoversMode: true });
    expect(section).toContain('Cook-once-eat-twice');
    expect(section).toContain('reheat');
    const prompt = buildMealPlanUserPrompt({ ...baseInput, leftoversMode: true });
    expect(prompt).toContain('Cook-once-eat-twice');
  });
});
