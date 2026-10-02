import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultWeekOffset, getWeekStartDate, weekStartForDate } from './week-default';

describe('defaultWeekOffset', () => {
  it('is 0 on a plain weekday', () => {
    expect(defaultWeekOffset(new Date(2026, 8, 23, 10, 0))).toBe(0); // Wed
  });

  it('is 0 on Friday before 15:00', () => {
    expect(defaultWeekOffset(new Date(2026, 8, 25, 14, 59))).toBe(0); // Fri
  });

  it('is 1 on Friday at/after 15:00', () => {
    expect(defaultWeekOffset(new Date(2026, 8, 25, 15, 0))).toBe(1);
    expect(defaultWeekOffset(new Date(2026, 8, 25, 23, 0))).toBe(1);
  });

  it('is 1 all day Saturday (DST weekend safe)', () => {
    expect(defaultWeekOffset(new Date(2026, 8, 26, 0, 0))).toBe(1);
    expect(defaultWeekOffset(new Date(2026, 8, 26, 23, 59))).toBe(1);
  });

  it('is 0 on Sunday', () => {
    expect(defaultWeekOffset(new Date(2026, 8, 27, 12, 0))).toBe(0);
  });
});

describe('getWeekStartDate', () => {
  it('returns the Monday of the current week at local midnight', () => {
    const monday = getWeekStartDate(0, new Date(2026, 8, 23, 14, 30)); // Wed
    expect(monday.getFullYear()).toBe(2026);
    expect(monday.getMonth()).toBe(8);
    expect(monday.getDate()).toBe(21);
    expect([monday.getHours(), monday.getMinutes(), monday.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('adds/subtracts whole weeks for a non-zero offset', () => {
    const wed = new Date(2026, 8, 23, 9, 0);
    expect(getWeekStartDate(1, wed).getDate()).toBe(28);
    expect(getWeekStartDate(-1, wed).getDate()).toBe(14);
  });

  it('is correct on Sunday (rolls back to the Monday that just ended)', () => {
    const monday = getWeekStartDate(0, new Date(2026, 8, 27, 23, 59)); // Sun
    expect(monday.getDate()).toBe(21);
  });

  // T-08.1 AC1: correct across DST — EU clocks spring forward on the last
  // Sunday of March and fall back on the last Sunday of October. A UTC-based
  // "midnight" (rather than `setHours(0,0,0,0)` in local time) would land on
  // 23:00 or 01:00 the wrong side of the transition.
  describe('DST', () => {
    const originalTz = process.env['TZ'];
    beforeEach(() => {
      process.env['TZ'] = 'Europe/Bucharest';
    });
    afterEach(() => {
      if (originalTz === undefined) {
        delete process.env['TZ'];
      } else {
        process.env['TZ'] = originalTz;
      }
    });

    it('lands on local midnight on the spring-forward day itself (2026-03-29)', () => {
      const monday = getWeekStartDate(0, new Date(2026, 2, 29, 10, 0)); // Sun, DST starts
      expect([monday.getMonth(), monday.getDate()]).toEqual([2, 23]);
      expect(monday.getHours()).toBe(0);
    });

    it('lands on local midnight on the fall-back day itself (2026-10-25)', () => {
      const monday = getWeekStartDate(0, new Date(2026, 9, 25, 10, 0)); // Sun, DST ends
      expect([monday.getMonth(), monday.getDate()]).toEqual([9, 19]);
      expect(monday.getHours()).toBe(0);
    });

    it('is exact when the requested week crosses the spring-forward transition', () => {
      // "now" (27 Mar, Fri) is before the jump; the offset-1 week start
      // (30 Mar) is after it.
      const monday = getWeekStartDate(1, new Date(2026, 2, 27, 9, 0));
      expect([monday.getMonth(), monday.getDate()]).toEqual([2, 30]);
      expect(monday.getHours()).toBe(0);
    });

    it('is exact when the requested week crosses the fall-back transition', () => {
      const monday = getWeekStartDate(-1, new Date(2026, 9, 29, 9, 0)); // Thu, after the jump
      expect([monday.getMonth(), monday.getDate()]).toEqual([9, 19]);
      expect(monday.getHours()).toBe(0);
    });
  });
});

describe('weekStartForDate (UX-FOOD-02)', () => {
  it('maps every day of a week to its Monday', () => {
    // 2026-10-05 is a Monday.
    for (const d of ['05', '06', '07', '08', '09', '10', '11']) {
      expect(weekStartForDate(`2026-10-${d}`).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    }
  });

  it('puts Sunday in the week that started the Monday before, and Monday in the next', () => {
    expect(weekStartForDate('2026-10-04').toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(weekStartForDate('2026-10-12').toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });

  it('crosses month and year boundaries', () => {
    expect(weekStartForDate('2027-01-01').toISOString()).toBe('2026-12-28T00:00:00.000Z');
  });
});
