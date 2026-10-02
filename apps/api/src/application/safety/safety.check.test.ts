import { describe, expect, it } from 'vitest';
import type { TableSafety } from '@chefer/types';
import type { SafetyCheckable } from '../../lib/curated-recipes/safety.js';
import { SafetyService } from './safety.service.js';

// UX-REC-01 / UX-PLAN-06: `check()` judges diets on ingredients, says when a
// pass rests on the tag alone, and explains each conflict.

const service = new SafetyService();

const tableOf = (...labels: string[]): TableSafety => ({
  people: [
    {
      who: 'you',
      isOwner: true,
      items: labels.map((label, i) => ({ id: `i${i}`, label, kind: 'diet' as const })),
      notes: [],
    },
  ],
  hasRules: true,
  needsReview: false,
});

const recipe = (over: Partial<SafetyCheckable>): SafetyCheckable => ({
  name: 'Test',
  ingredients: [],
  instructions: ['cook'],
  dietaryTags: [],
  ...over,
});
const line = (name: string) => ({ name, quantity: 100, unit: 'g' });

describe('SafetyService.check — diets read the ingredients', () => {
  it('a quinoa salad tagged paleo is a conflict that names the grain, not "Checked"', () => {
    const checks = service.check(
      recipe({
        name: 'Mexican Quinoa Salad',
        dietaryTags: ['vegetarian', 'paleo'],
        ingredients: [line('quinoa'), line('black beans'), line('avocado')],
      }),
      tableOf('Vegetarian', 'Paleo'),
    );
    expect(checks.checked.map((c) => c.label)).toEqual(['Vegetarian']);
    expect(checks.conflicts).toEqual(['Paleo']);
    expect(checks.conflictDetails).toEqual([
      { label: 'Paleo', kind: 'diet', ingredients: ['quinoa', 'black beans'] },
    ]);
  });

  it('plain oats are vegetarian (verified from the ingredients) and a paleo conflict', () => {
    const checks = service.check(
      recipe({ name: 'Porridge', ingredients: [line('rolled oats')] }),
      tableOf('Vegetarian', 'Paleo'),
    );
    expect(checks.checked).toEqual([{ label: 'Vegetarian', who: 'you' }]);
    expect(checks.taggedOnly).toBeUndefined();
    expect(checks.conflicts).toEqual(['Paleo']);
    expect(checks.conflictDetails?.[0]?.ingredients).toEqual(['rolled oats']);
  });

  it('a pass that rests on the tag alone is listed as taggedOnly (still in `checked` for old clients)', () => {
    const checks = service.check(
      recipe({
        dietaryTags: ['paleo'],
        ingredients: [],
      }),
      tableOf('Paleo'),
    );
    expect(checks.checked).toEqual([{ label: 'Paleo', who: 'you' }]);
    expect(checks.taggedOnly).toEqual([{ label: 'Paleo', who: 'you' }]);
    expect(checks.conflicts).toEqual([]);
  });

  it('a diet nothing can verify and nothing tags is "can\'t check", not a conflict or a claim', () => {
    const checks = service.check(
      recipe({
        ingredients: [line('salmon')],
        nutritionInfo: { calories: 0, carbs: 0 },
      }),
      tableOf('Keto'),
    );
    expect(checks.checked).toEqual([]);
    expect(checks.conflicts).toEqual([]);
    expect(checks.unchecked).toEqual(['Keto']);
  });

  it('a keto limit failure carries its reason', () => {
    const checks = service.check(
      recipe({
        dietaryTags: ['keto'],
        ingredients: [line('chicken')],
        nutritionInfo: { calories: 600, carbs: 110, fiber: 6 },
      }),
      tableOf('Keto'),
    );
    expect(checks.conflicts).toEqual(['Keto']);
    expect(checks.conflictDetails).toEqual([
      { label: 'Keto', kind: 'diet', ingredients: [], reason: '110 g net carbs per serving' },
    ]);
  });

  it('allergy conflicts name the offending ingredient too', () => {
    const table: TableSafety = {
      people: [
        {
          who: 'you',
          isOwner: true,
          items: [{ id: 'a', label: 'Peanut', kind: 'allergy' }],
          notes: [],
        },
      ],
      hasRules: true,
      needsReview: false,
    };
    const checks = service.check(recipe({ ingredients: [line('peanut butter')] }), table);
    expect(checks.conflictDetails).toEqual([
      { label: 'Peanut', kind: 'allergy', ingredients: ['peanut butter'] },
    ]);
  });
});
