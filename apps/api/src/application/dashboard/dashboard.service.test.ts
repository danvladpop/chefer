import { describe, expect, it } from 'vitest';
import { getNextMealType, MEAL_ORDER, MEAL_WINDOW_END } from './dashboard.service.js';

const THREE_MEALS = ['breakfast', 'lunch', 'dinner'];
const FOUR_MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];

describe('getNextMealType', () => {
  describe('3-meal plan (the default — no snack)', () => {
    it('surfaces breakfast in the morning', () => {
      expect(getNextMealType(8, THREE_MEALS)).toBe('breakfast');
    });

    it('surfaces lunch before 14:00', () => {
      expect(getNextMealType(12, THREE_MEALS)).toBe('lunch');
    });

    it('skips the absent snack window and surfaces dinner at 15:00', () => {
      // The old index-based logic surfaced dinner here too, but labelled it
      // via a positional match that broke after 17:00 (below).
      expect(getNextMealType(15, THREE_MEALS)).toBe('dinner');
    });

    it('surfaces dinner at 19:00 — the bug this replaces returned nothing', () => {
      expect(getNextMealType(19, THREE_MEALS)).toBe('dinner');
    });

    it('returns null late in the evening', () => {
      expect(getNextMealType(22, THREE_MEALS)).toBeNull();
    });
  });

  describe('4-meal plan (snack present)', () => {
    it('surfaces the snack at 15:00', () => {
      expect(getNextMealType(15, FOUR_MEALS)).toBe('snack');
    });

    it('surfaces dinner once the snack window closes', () => {
      expect(getNextMealType(17, FOUR_MEALS)).toBe('dinner');
    });
  });

  describe('edge cases', () => {
    it('window ends are exclusive — 10:00 is lunch, not breakfast', () => {
      expect(getNextMealType(10, THREE_MEALS)).toBe('lunch');
    });

    it('handles a plan with no meals', () => {
      expect(getNextMealType(12, [])).toBeNull();
    });

    it('handles a dinner-only plan all day', () => {
      expect(getNextMealType(8, ['dinner'])).toBe('dinner');
      expect(getNextMealType(20, ['dinner'])).toBe('dinner');
      expect(getNextMealType(21, ['dinner'])).toBeNull();
    });

    it('every meal type in MEAL_ORDER has a window', () => {
      for (const type of MEAL_ORDER) {
        expect(MEAL_WINDOW_END[type]).toBeGreaterThan(0);
      }
    });
  });
});
