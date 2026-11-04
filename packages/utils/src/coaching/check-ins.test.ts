import { describe, expect, it } from 'vitest';
import { checkInAnswersLine, checkInPeriodStart, isCompleteCheckIn } from './check-ins';

describe('checkInPeriodStart', () => {
  // 2026-10-25 is a Sunday (day 6); 2026-10-22 a Thursday.
  it('opens on the check-in weekday and stays open for the week', () => {
    expect(checkInPeriodStart('2026-10-25', 6, null)).toBe('2026-10-25');
    expect(checkInPeriodStart('2026-10-28', 6, null)).toBe('2026-10-25');
    expect(checkInPeriodStart('2026-10-31', 6, null)).toBe('2026-10-25');
    expect(checkInPeriodStart('2026-11-01', 6, null)).toBe('2026-11-01');
    expect(checkInPeriodStart('2026-10-22', 0, null)).toBe('2026-10-19');
  });

  it('nothing is open before the first check-in day after the coaching started', () => {
    expect(checkInPeriodStart('2026-10-23', 6, '2026-10-22')).toBeNull();
    expect(checkInPeriodStart('2026-10-25', 6, '2026-10-22')).toBe('2026-10-25');
    expect(checkInPeriodStart('2026-10-25', 6, '2026-10-25')).toBe('2026-10-25');
  });
});

describe('isCompleteCheckIn', () => {
  it('needs every asked question answered 1–5 and nothing extra', () => {
    expect(isCompleteCheckIn(['ENERGY', 'SLEEP'], { ENERGY: 3, SLEEP: 5 })).toBe(true);
    expect(isCompleteCheckIn(['ENERGY', 'SLEEP'], { ENERGY: 3 })).toBe(false);
    expect(isCompleteCheckIn(['ENERGY'], { ENERGY: 3, SLEEP: 4 })).toBe(false);
    expect(isCompleteCheckIn(['ENERGY'], { ENERGY: 6 })).toBe(false);
  });
});

describe('checkInAnswersLine', () => {
  it('reads the answers in the asked order with the catalogue labels', () => {
    expect(checkInAnswersLine(['SLEEP', 'ADHERENCE'], { ADHERENCE: 5, SLEEP: 2 })).toBe(
      'Sleep 2/5 · Sticking to the plan 5/5',
    );
  });
});
