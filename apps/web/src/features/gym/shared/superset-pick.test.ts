import { describe, expect, it } from 'vitest';
import { MAX_SUPERSET_SIZE } from '@chefer/utils';
import { canGroupPicks, isPickLocked, SUPERSET_SHEET_HINT, togglePick } from './superset-pick';

describe('superset picks', () => {
  it('ticks and unticks', () => {
    expect(togglePick([], 'a')).toEqual(['a']);
    expect(togglePick(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('stops at the maximum and locks the other rows', () => {
    const full = ['a', 'b', 'c', 'd'];
    expect(MAX_SUPERSET_SIZE).toBe(4);
    expect(togglePick(full, 'e')).toEqual(full);
    expect(isPickLocked(full, 'e')).toBe(true);
    expect(isPickLocked(full, 'a')).toBe(false);
    expect(isPickLocked(['a'], 'e')).toBe(false);
  });

  it('groups 2 to 4 picks only', () => {
    expect(canGroupPicks(['a'])).toBe(false);
    expect(canGroupPicks(['a', 'b'])).toBe(true);
    expect(canGroupPicks(['a', 'b', 'c', 'd'])).toBe(true);
    expect(canGroupPicks(['a', 'b', 'c', 'd', 'e'])).toBe(false);
  });

  it('uses the same copy as the phone app', () => {
    expect(SUPERSET_SHEET_HINT).toBe(
      'Pick 2 to 4 exercises to do back to back. You rest after the round.',
    );
  });
});
