import { describe, expect, it } from 'vitest';
import { dayNutritionCaption, dayStatus, planStatus, remainingPlannedKcal } from './day-nutrition';

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

describe('dayStatus (UX-FOOD-05)', () => {
  it('is not "on track" at 871 kcal over the target', () => {
    // 2,572 eaten against a 1,701 target, a dinner still planned.
    const result = dayStatus(2572, 759, 1701);
    expect(result.status).toBe('over');
    expect(result.overByKcal).toBe(871);
    expect(result.label).toBe('Over by 871 kcal');
  });

  it('warns that the day is heading over when a planned dinner tips it', () => {
    // 1,672 eaten at 10:50 with a 759 kcal dinner still planned vs 1,701.
    expect(dayStatus(1672, 759, 1701)).toMatchObject({
      status: 'heading_over',
      label: 'Heading over',
    });
  });

  it('is on track when eaten + remaining lands within the band', () => {
    expect(dayStatus(800, 1100, 2000)).toMatchObject({ status: 'on', label: 'On track' });
    expect(dayStatus(0, 2050, 2000).status).toBe('on'); // +2.5%
  });

  it('says there is room when the day projects well under target', () => {
    expect(dayStatus(600, 600, 2000)).toMatchObject({ status: 'under', label: 'Room for more' });
  });

  it('reports an unplanned, untouched day as nothing planned', () => {
    expect(dayStatus(0, 0, 2000)).toMatchObject({ status: 'none', label: 'Nothing planned' });
  });

  it('counts exactly-at-target as not over', () => {
    expect(dayStatus(2000, 0, 2000).status).toBe('on');
  });

  it('survives a zero target without dividing by zero', () => {
    expect(dayStatus(100, 0, 0).status).toBe('over');
  });
});

describe('remainingPlannedKcal', () => {
  it('sums the next meal and the rest of today', () => {
    expect(remainingPlannedKcal({ recipe: { kcal: 400 } }, [{ kcal: 300 }, { kcal: 150 }])).toBe(
      850,
    );
    expect(remainingPlannedKcal(null, undefined)).toBe(0);
  });
});
