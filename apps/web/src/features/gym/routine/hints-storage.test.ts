// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoutineHint } from '@chefer/types';
import { hintId, loadDismissedHints, saveDismissedHints, visibleHints } from './hints-storage';

const V1: RoutineHint = { rule: 'V1', level: 'info', group: 'chest', message: 'low chest volume' };
const V6: RoutineHint = { rule: 'V6', level: 'warning', dayIndex: 1, message: 'long session' };

beforeEach(() => {
  window.localStorage.clear();
});

describe('hintId', () => {
  it('is stable for the same hint and distinct across rule/group/day/exercise', () => {
    expect(hintId(V1)).toBe(hintId({ ...V1 }));
    expect(hintId(V1)).not.toBe(hintId(V6));
    expect(hintId({ ...V1, group: 'back' })).not.toBe(hintId(V1));
  });
});

describe('dismissed-hints storage', () => {
  it('round-trips through localStorage', () => {
    expect(loadDismissedHints('r1').size).toBe(0);
    saveDismissedHints('r1', new Set([hintId(V1)]));
    expect(loadDismissedHints('r1')).toEqual(new Set([hintId(V1)]));
  });

  it('is scoped per routine', () => {
    saveDismissedHints('r1', new Set([hintId(V1)]));
    expect(loadDismissedHints('r2').size).toBe(0);
  });

  it('never throws when localStorage is unavailable', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => loadDismissedHints('r1')).not.toThrow();
    expect(loadDismissedHints('r1').size).toBe(0);
    spy.mockRestore();

    const setSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => saveDismissedHints('r1', new Set(['x']))).not.toThrow();
    setSpy.mockRestore();
  });

  it('ignores malformed stored JSON', () => {
    window.localStorage.setItem('gym.routine.r1.dismissedHints', '{not json');
    expect(loadDismissedHints('r1').size).toBe(0);
  });
});

describe('visibleHints', () => {
  it('filters out dismissed hints', () => {
    const dismissed = new Set([hintId(V1)]);
    expect(visibleHints([V1, V6], dismissed)).toEqual([V6]);
  });
});
