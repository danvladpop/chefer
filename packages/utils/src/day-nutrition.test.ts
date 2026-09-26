import { describe, expect, it } from 'vitest';
import { dayNutritionCaption, planStatus } from './day-nutrition';

describe('home Today nutrition (audit F-DASH-1-2)', () => {
  it('judges the plan, not what was eaten', () => {
    expect(planStatus(1870, 2000)).toBe('on');
    expect(planStatus(1400, 2000)).toBe('under');
    expect(planStatus(2200, 2000)).toBe('over');
    expect(planStatus(0, 2000)).toBe('none');
  });
  it('captions eaten vs target with the plan alongside', () => {
    expect(dayNutritionCaption(800, 1870, 2000)).toBe('1,870 planned · 1,200 left');
    expect(dayNutritionCaption(6070, 1870, 2000)).toBe('1,870 planned · 4,070 over');
    expect(dayNutritionCaption(0, 0, 2000)).toBe('2,000 left');
  });
});
