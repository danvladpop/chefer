// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canOfferSnack,
  dismissChanges,
  dismissReplan,
  isChangesDismissed,
  isReplanDismissed,
  missDirection,
  missLines,
  scaleFactorFor,
  targetDrifted,
} from './plan-miss';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('missDirection', () => {
  it('is null inside the ±15 % band and names the direction outside it', () => {
    expect(missDirection(1900, 2000)).toBeNull();
    expect(missDirection(1600, 2000)).toBe('under');
    expect(missDirection(2400, 2000)).toBe('over');
    expect(missDirection(1000, 0)).toBeNull();
  });
});

describe('scaleFactorFor', () => {
  it('lands on the target, clamped to the API range', () => {
    expect(scaleFactorFor(1600, 2000)).toBe(1.25);
    expect(scaleFactorFor(800, 2000)).toBe(1.5);
    expect(scaleFactorFor(4000, 2000)).toBe(0.75);
    expect(scaleFactorFor(0, 2000)).toBe(1);
  });
});

describe('canOfferSnack', () => {
  it('never for LOSE_WEIGHT, hidden for an unknown goal, only when under', () => {
    expect(canOfferSnack('under', 'LOSE_WEIGHT')).toBe(false);
    expect(canOfferSnack('under', null)).toBe(false);
    expect(canOfferSnack('under', undefined)).toBe(false);
    expect(canOfferSnack('under', 'GAIN_MUSCLE')).toBe(true);
    expect(canOfferSnack('under', 'MAINTAIN')).toBe(true);
    expect(canOfferSnack('over', 'MAINTAIN')).toBe(false);
  });
});

describe('targetDrifted', () => {
  it('is true from a 5 % move', () => {
    expect(targetDrifted(2000, 2100)).toBe(true);
    expect(targetDrifted(2000, 2099)).toBe(false);
    expect(targetDrifted(2000, 1900)).toBe(true);
    expect(targetDrifted(undefined, 2000)).toBe(false);
  });
});

describe('dismissals (localStorage, per plan id)', () => {
  it('remembers per plan and survives unavailable storage', () => {
    expect(isReplanDismissed('p1')).toBe(false);
    dismissReplan('p1');
    expect(isReplanDismissed('p1')).toBe(true);
    expect(isReplanDismissed('p2')).toBe(false);
    dismissChanges('p1');
    expect(isChangesDismissed('p1')).toBe(true);

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isReplanDismissed('p1')).toBe(false);
    expect(() => dismissReplan('p3')).not.toThrow();
  });
});

describe('missLines', () => {
  it('groups days by direction with a rounded, about-n figure', () => {
    expect(
      missLines([
        { dayOfWeek: 3, deltaKcal: -304 },
        { dayOfWeek: 5, deltaKcal: -296 },
        { dayOfWeek: 1, deltaKcal: 410 },
      ]),
    ).toEqual([
      { text: 'Thu and Sat are about 300 kcal under', firstDay: 3 },
      { text: 'Tue is about 410 kcal over', firstDay: 1 },
    ]);
    expect(missLines([])).toEqual([]);
  });
});
