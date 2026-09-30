// Δ2.1, T-42.0, revised 2026-09-28 (cardio moved level 2 → 3, INTERVALS
// 3 → 4 — wave 1 already claimed level 2 for an unrelated fix, incl. the
// live App Store build 1.0.0 (5)): which ExerciseTrackingType values a
// client at a given `x-chefer-api-level` may be sent. AC 10 (a level-0/1/2
// bootstrap contains no cardio-typed exercise it cannot render) rests on
// this table.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  effectiveLevel,
  isTrackingTypeRenderable,
  renderableTrackingTypes,
} from './client-level.js';

let flagsEnabled: Record<string, boolean> = {};
vi.mock('../../lib/flags.js', () => ({
  isFlagEnabled: (key: string) => flagsEnabled[key] === true,
}));

beforeEach(() => {
  flagsEnabled = {};
});

describe('renderableTrackingTypes', () => {
  it.each([0, 1, 2])('level %i renders only strength types + DURATION', (level) => {
    expect(renderableTrackingTypes(level)).toEqual(['WEIGHT_REPS', 'BODYWEIGHT_REPS', 'DURATION']);
  });

  it('level 3 adds DURATION_DISTANCE and DISTANCE, not INTERVALS', () => {
    expect(renderableTrackingTypes(3)).toEqual([
      'WEIGHT_REPS',
      'BODYWEIGHT_REPS',
      'DURATION',
      'DURATION_DISTANCE',
      'DISTANCE',
    ]);
  });

  it('level 4 (health consent, W3) renders the same as level 3', () => {
    expect(renderableTrackingTypes(4)).toEqual(renderableTrackingTypes(3));
  });

  it('level 5 adds INTERVALS on top of level 3', () => {
    expect(renderableTrackingTypes(5)).toEqual([
      'WEIGHT_REPS',
      'BODYWEIGHT_REPS',
      'DURATION',
      'DURATION_DISTANCE',
      'DISTANCE',
      'INTERVALS',
    ]);
  });

  it('an unparseable/absent header parses to level 0 elsewhere, and 0 behaves like 1 and 2 here', () => {
    expect(renderableTrackingTypes(0)).toEqual(renderableTrackingTypes(1));
    expect(renderableTrackingTypes(1)).toEqual(renderableTrackingTypes(2));
  });

  it('the live App Store build (1.0.0 (5), sends level 2) never renders cardio', () => {
    expect(renderableTrackingTypes(2)).not.toContain('DURATION_DISTANCE');
    expect(renderableTrackingTypes(2)).not.toContain('DISTANCE');
  });
});

describe('effectiveLevel (cardioLogging gate, 2026-09-28 follow-up)', () => {
  it('cardioLogging off: caps at 2 regardless of what the client sends', () => {
    flagsEnabled = {};
    expect(effectiveLevel(0)).toBe(0);
    expect(effectiveLevel(2)).toBe(2);
    expect(effectiveLevel(3)).toBe(2);
    expect(effectiveLevel(4)).toBe(2);
  });

  it('cardioLogging on: passes the client level through unchanged', () => {
    flagsEnabled = { cardioLogging: true };
    expect(effectiveLevel(0)).toBe(0);
    expect(effectiveLevel(2)).toBe(2);
    expect(effectiveLevel(3)).toBe(3);
    expect(effectiveLevel(4)).toBe(4);
  });

  it('cardioLogging off: a level-3 client (T-42.3 OTA) still renders no cardio', () => {
    flagsEnabled = {};
    expect(renderableTrackingTypes(effectiveLevel(3))).not.toContain('DURATION_DISTANCE');
  });

  it('cardioLogging on: a level-3 client renders cardio', () => {
    flagsEnabled = { cardioLogging: true };
    expect(renderableTrackingTypes(effectiveLevel(3))).toContain('DURATION_DISTANCE');
  });
});

describe('isTrackingTypeRenderable', () => {
  it('DURATION_DISTANCE is not renderable below level 3', () => {
    expect(isTrackingTypeRenderable('DURATION_DISTANCE', 2)).toBe(false);
    expect(isTrackingTypeRenderable('DURATION_DISTANCE', 3)).toBe(true);
  });

  it('INTERVALS is not renderable below level 5', () => {
    expect(isTrackingTypeRenderable('INTERVALS', 4)).toBe(false);
    expect(isTrackingTypeRenderable('INTERVALS', 5)).toBe(true);
  });

  it('DURATION (a timed hold) is renderable at every level, incl. 0', () => {
    expect(isTrackingTypeRenderable('DURATION', 0)).toBe(true);
  });
});
