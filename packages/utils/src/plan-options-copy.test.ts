import { describe, expect, it } from 'vitest';
import { PLAN_MEAL_MENU_COPY, PLAN_WEEK_COPY } from './plan-options-copy';

describe('plan week copy (FB7-11)', () => {
  it('describes both week actions', () => {
    expect(PLAN_WEEK_COPY.optionsLabel).toBe('Week options');
    expect(PLAN_WEEK_COPY.regenerate.description).toBe('Keeps the meals you pinned.');
    expect(PLAN_WEEK_COPY.rebalance.description).toMatch(/up to 2 upcoming meals/);
  });
  it('names the meal in the accessible labels', () => {
    expect(PLAN_MEAL_MENU_COPY.moreActions('Chicken')).toBe('More actions for Chicken');
    expect(PLAN_MEAL_MENU_COPY.swap('Chicken')).toBe('Replace Chicken');
    expect(PLAN_MEAL_MENU_COPY.groupTotal('lunch')).toBe('Lunch total');
    expect(PLAN_MEAL_MENU_COPY.dishCount(2)).toBe('2 dishes');
  });
});
