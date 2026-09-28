// Δ2.1, T-42.0: which ExerciseTrackingType values a client at a given
// `x-chefer-api-level` may be sent. AC 10 (a level-0 bootstrap contains no
// cardio-typed exercise it cannot render) rests on this table.
import { describe, expect, it } from 'vitest';
import { isTrackingTypeRenderable, renderableTrackingTypes } from './client-level.js';

describe('renderableTrackingTypes', () => {
  it.each([0, 1])('level %i renders only strength types + DURATION', (level) => {
    expect(renderableTrackingTypes(level)).toEqual(['WEIGHT_REPS', 'BODYWEIGHT_REPS', 'DURATION']);
  });

  it('level 2 adds DURATION_DISTANCE and DISTANCE, not INTERVALS', () => {
    expect(renderableTrackingTypes(2)).toEqual([
      'WEIGHT_REPS',
      'BODYWEIGHT_REPS',
      'DURATION',
      'DURATION_DISTANCE',
      'DISTANCE',
    ]);
  });

  it('level 3 adds INTERVALS on top of level 2', () => {
    expect(renderableTrackingTypes(3)).toEqual([
      'WEIGHT_REPS',
      'BODYWEIGHT_REPS',
      'DURATION',
      'DURATION_DISTANCE',
      'DISTANCE',
      'INTERVALS',
    ]);
  });

  it('an unparseable/absent header parses to level 0 elsewhere, and 0 behaves like 1 here', () => {
    expect(renderableTrackingTypes(0)).toEqual(renderableTrackingTypes(1));
  });
});

describe('isTrackingTypeRenderable', () => {
  it('DURATION_DISTANCE is not renderable below level 2', () => {
    expect(isTrackingTypeRenderable('DURATION_DISTANCE', 1)).toBe(false);
    expect(isTrackingTypeRenderable('DURATION_DISTANCE', 2)).toBe(true);
  });

  it('INTERVALS is not renderable below level 3', () => {
    expect(isTrackingTypeRenderable('INTERVALS', 2)).toBe(false);
    expect(isTrackingTypeRenderable('INTERVALS', 3)).toBe(true);
  });

  it('DURATION (a timed hold) is renderable at every level, incl. 0', () => {
    expect(isTrackingTypeRenderable('DURATION', 0)).toBe(true);
  });
});
