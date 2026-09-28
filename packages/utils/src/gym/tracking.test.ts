// S18 (T-42.0): tracking-type derivation and reverse-legacy-flag helpers.
import { describe, expect, it } from 'vitest';
import { isStrengthTrackingType, isTimedFor, trackingTypeOf } from './tracking';

describe('trackingTypeOf', () => {
  it('returns the explicit trackingType when present', () => {
    expect(
      trackingTypeOf({ trackingType: 'DURATION_DISTANCE', isTimed: true, loadType: 'WEIGHTED' }),
    ).toBe('DURATION_DISTANCE');
  });

  it('derives DURATION for an old isTimed custom row with no trackingType', () => {
    expect(trackingTypeOf({ isTimed: true, loadType: 'WEIGHTED' })).toBe('DURATION');
  });

  it('derives BODYWEIGHT_REPS for an old BODYWEIGHT row with no trackingType', () => {
    expect(trackingTypeOf({ isTimed: false, loadType: 'BODYWEIGHT' })).toBe('BODYWEIGHT_REPS');
  });

  it('isTimed wins over loadType when both could apply', () => {
    expect(trackingTypeOf({ isTimed: true, loadType: 'BODYWEIGHT' })).toBe('DURATION');
  });

  it('falls back to WEIGHT_REPS for an ordinary weighted row', () => {
    expect(trackingTypeOf({ isTimed: false, loadType: 'WEIGHTED' })).toBe('WEIGHT_REPS');
  });

  it('an explicit trackingType is never overridden even when isTimed disagrees', () => {
    expect(
      trackingTypeOf({ trackingType: 'WEIGHT_REPS', isTimed: true, loadType: 'WEIGHTED' }),
    ).toBe('WEIGHT_REPS');
  });
});

describe('isTimedFor', () => {
  it.each([
    ['DURATION', true],
    ['DURATION_DISTANCE', true],
    ['INTERVALS', true],
    ['DISTANCE', false],
    ['WEIGHT_REPS', false],
    ['BODYWEIGHT_REPS', false],
  ] as const)('%s → isTimed %s', (trackingType, expected) => {
    expect(isTimedFor(trackingType)).toBe(expected);
  });
});

describe('isStrengthTrackingType', () => {
  it.each([
    ['WEIGHT_REPS', true],
    ['BODYWEIGHT_REPS', true],
    ['DURATION', false],
    ['DURATION_DISTANCE', false],
    ['DISTANCE', false],
    ['INTERVALS', false],
  ] as const)('%s → strength %s', (trackingType, expected) => {
    expect(isStrengthTrackingType(trackingType)).toBe(expected);
  });
});
