import { describe, expect, it } from 'vitest';
import { buildOverridePayload } from './override-payload';

describe('buildOverridePayload', () => {
  it('passes a kg weight through unchanged', () => {
    const payload = buildOverridePayload({
      weightDisplay: 62.5,
      repsDisplay: 8,
      unit: 'KG',
      sets: 3,
    });
    expect(payload).toEqual({ weightKg: 62.5, reps: [8, 8, 8] });
  });

  it('converts a lb weight to kg (setOverride always takes kg)', () => {
    const payload = buildOverridePayload({
      weightDisplay: 135,
      repsDisplay: 5,
      unit: 'LB',
      sets: 1,
    });
    expect(payload?.weightKg).toBeCloseTo(61.23, 1);
    expect(payload?.reps).toEqual([5]);
  });

  it('repeats the same rep target once per working set', () => {
    const payload = buildOverridePayload({
      weightDisplay: 100,
      repsDisplay: 10,
      unit: 'KG',
      sets: 5,
    });
    expect(payload?.reps).toEqual([10, 10, 10, 10, 10]);
  });

  it('clamps an out-of-range set count into the schema bounds (1..10)', () => {
    expect(
      buildOverridePayload({ weightDisplay: 20, repsDisplay: 12, unit: 'KG', sets: 0 })?.reps,
    ).toHaveLength(1);
    expect(
      buildOverridePayload({ weightDisplay: 20, repsDisplay: 12, unit: 'KG', sets: 99 })?.reps,
    ).toHaveLength(10);
  });

  it('rejects a negative or non-finite weight', () => {
    expect(
      buildOverridePayload({ weightDisplay: -5, repsDisplay: 8, unit: 'KG', sets: 3 }),
    ).toBeNull();
    expect(
      buildOverridePayload({ weightDisplay: NaN, repsDisplay: 8, unit: 'KG', sets: 3 }),
    ).toBeNull();
  });

  it('rejects a negative or non-finite rep target', () => {
    expect(
      buildOverridePayload({ weightDisplay: 20, repsDisplay: -1, unit: 'KG', sets: 3 }),
    ).toBeNull();
    expect(
      buildOverridePayload({ weightDisplay: 20, repsDisplay: NaN, unit: 'KG', sets: 3 }),
    ).toBeNull();
  });

  it('allows a zero weight (bodyweight exercises)', () => {
    expect(
      buildOverridePayload({ weightDisplay: 0, repsDisplay: 12, unit: 'KG', sets: 3 }),
    ).toEqual({
      weightKg: 0,
      reps: [12, 12, 12],
    });
  });
});
