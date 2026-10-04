// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { isRoutineChangeUnseen, markRoutineSeen } from './routine-seen';

beforeEach(() => window.localStorage.clear());

describe('routine seen marker', () => {
  it('is unseen until the routine is opened, then hidden', () => {
    expect(isRoutineChangeUnseen('r1', '2026-10-02T10:00:00.000Z')).toBe(true);
    markRoutineSeen('r1', '2026-10-02T10:00:00.000Z');
    expect(isRoutineChangeUnseen('r1', '2026-10-02T10:00:00.000Z')).toBe(false);
  });

  it('shows again for a newer change and is per routine', () => {
    markRoutineSeen('r1', '2026-10-02T10:00:00.000Z');
    expect(isRoutineChangeUnseen('r1', '2026-10-03T08:00:00.000Z')).toBe(true);
    expect(isRoutineChangeUnseen('r2', '2026-10-02T10:00:00.000Z')).toBe(true);
  });
});
