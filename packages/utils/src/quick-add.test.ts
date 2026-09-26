import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quick-add';

describe('parseQuickAdd', () => {
  it('accepts name + kcal, defaulting macros to 0', () => {
    expect(parseQuickAdd({ name: '  Birthday cake ', mealType: 'snack', kcal: '350' })).toEqual({
      ok: true,
      entry: { name: 'Birthday cake', mealType: 'snack', kcal: 350, protein: 0, carbs: 0, fat: 0 },
    });
  });

  it('rounds kcal to a whole number and macros to 0.1 g, accepting a comma decimal', () => {
    const parsed = parseQuickAdd({
      name: 'Wrap',
      mealType: 'lunch',
      kcal: '412.6',
      protein: '22,34',
      carbs: '40',
      fat: '9.96',
    });
    expect(parsed).toEqual({
      ok: true,
      entry: { name: 'Wrap', mealType: 'lunch', kcal: 413, protein: 22.3, carbs: 40, fat: 10 },
    });
  });

  it('requires a name and positive calories', () => {
    expect(parseQuickAdd({ name: ' ', mealType: 'snack', kcal: '' })).toEqual({
      ok: false,
      errors: { name: 'Name what you ate.', kcal: 'Enter the calories.' },
    });
    expect(parseQuickAdd({ name: 'Tea', mealType: 'snack', kcal: '0' })).toEqual({
      ok: false,
      errors: { kcal: 'Calories must be above 0.' },
    });
  });

  it('mirrors the API bounds', () => {
    const parsed = parseQuickAdd({
      name: 'x'.repeat(201),
      mealType: 'dinner',
      kcal: '5001',
      protein: '501',
      carbs: '1001',
      fat: '501',
    });
    expect(parsed).toEqual({
      ok: false,
      errors: {
        name: 'Keep it under 200 characters.',
        kcal: 'Max 5000 kcal.',
        protein: 'Max 500 g.',
        carbs: 'Max 1000 g.',
        fat: 'Max 500 g.',
      },
    });
  });

  it('rejects negatives and exponent notation', () => {
    expect(parseQuickAdd({ name: 'A', mealType: 'snack', kcal: '-5', fat: '1e3' })).toEqual({
      ok: false,
      errors: { kcal: 'Use a plain number.', fat: 'Use a plain number.' },
    });
  });
});
