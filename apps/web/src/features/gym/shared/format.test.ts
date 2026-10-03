import { describe, expect, it } from 'vitest';
import { prescriptionText } from './format';

// UX-GYM-19: a dumbbell prescription says whose weight it is.
describe('prescriptionText', () => {
  const suggestion = { sets: 3, reps: [10, 10, 10], weightKg: 20 };

  it('a barbell target is a plain weight', () => {
    expect(prescriptionText(suggestion, 'KG')).toBe('3 × 10 @ 20 kg');
  });

  it('a per-hand target reads "each", in the user\'s unit', () => {
    expect(prescriptionText(suggestion, 'KG', 'WEIGHTED', false, true)).toBe('3 × 10 @ 20 kg each');
    expect(
      prescriptionText({ ...suggestion, weightKg: 22.68 }, 'LB', 'WEIGHTED', false, true),
    ).toBe('3 × 10 @ 50 lb each');
  });

  it('a bodyweight set stays bare', () => {
    expect(
      prescriptionText({ sets: 3, reps: [8, 8, 8], weightKg: 0 }, 'KG', 'BODYWEIGHT', false, true),
    ).toBe('3 × 8');
  });
});
