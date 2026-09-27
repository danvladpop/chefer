import { describe, expect, it } from 'vitest';
import {
  isValidPlanShape,
  planShapeSummary,
  resolvePlanDays,
  resolvePlanSlots,
} from './plan-shape';

describe('resolvePlanSlots / resolvePlanDays', () => {
  it('resolves an empty array to the legacy default', () => {
    expect(resolvePlanSlots([])).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(resolvePlanDays([])).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('passes through a stored, non-empty value', () => {
    expect(resolvePlanSlots(['dinner'])).toEqual(['dinner']);
    expect(resolvePlanDays([0, 2, 4])).toEqual([0, 2, 4]);
  });
});

describe('isValidPlanShape', () => {
  it('accepts a well-formed shape', () => {
    expect(
      isValidPlanShape({
        slots: ['breakfast', 'dinner'],
        days: [0, 1, 2, 3, 4],
        timeCapMins: 30,
        weekendNoLimit: true,
        cookingFor: 2,
      }),
    ).toBe(true);
  });

  it('rejects a malformed shape', () => {
    expect(
      isValidPlanShape({
        slots: [],
        days: [0],
        timeCapMins: 20,
        weekendNoLimit: false,
        cookingFor: null,
      }),
    ).toBe(false);
  });
});

describe('planShapeSummary', () => {
  it('summarises every day, no cap', () => {
    expect(
      planShapeSummary({
        slots: ['breakfast', 'lunch', 'dinner'],
        days: [0, 1, 2, 3, 4, 5, 6],
        timeCapMins: null,
        weekendNoLimit: false,
        cookingFor: null,
      }),
    ).toBe('Breakfast, Lunch, Dinner · every day');
  });

  it('summarises a capped weekday plan for two', () => {
    expect(
      planShapeSummary({
        slots: ['dinner'],
        days: [0, 1, 2, 3, 4],
        timeCapMins: 30,
        weekendNoLimit: false,
        cookingFor: 2,
      }),
    ).toBe('Dinner · Mon–Fri · 30 min or less · cooking for 2');
  });
});
