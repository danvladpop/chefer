import { describe, expect, it } from 'vitest';
import { recapWeekFor } from './recap';

describe('recapWeekFor', () => {
  it('Sunday recaps the current week', () => {
    expect(recapWeekFor('2026-10-25')).toBe('2026-10-19');
  });

  it('Monday and Tuesday recap the previous week', () => {
    expect(recapWeekFor('2026-10-26')).toBe('2026-10-19');
    expect(recapWeekFor('2026-10-27')).toBe('2026-10-19');
  });

  it('is null Wednesday to Saturday', () => {
    for (const d of ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']) {
      expect(recapWeekFor(d)).toBeNull();
    }
  });

  it('crosses a month and year boundary', () => {
    expect(recapWeekFor('2027-01-03')).toBe('2026-12-28');
    expect(recapWeekFor('2027-01-05')).toBe('2026-12-28');
  });
});
