import { describe, expect, it } from 'vitest';
import { defaultMealSlot } from './meal-slot';

describe('defaultMealSlot', () => {
  it('maps early morning to breakfast', () => {
    expect(defaultMealSlot(7)).toBe('breakfast');
    expect(defaultMealSlot(10)).toBe('breakfast');
  });

  it('maps midday to lunch', () => {
    expect(defaultMealSlot(12)).toBe('lunch');
    expect(defaultMealSlot(14)).toBe('lunch');
  });

  it('maps evening to dinner', () => {
    expect(defaultMealSlot(15)).toBe('dinner');
    expect(defaultMealSlot(20)).toBe('dinner');
  });

  it('maps late night to snack, small hours to dinner (bug B-36)', () => {
    expect(defaultMealSlot(22)).toBe('snack');
    expect(defaultMealSlot(2)).toBe('dinner');
  });
});
