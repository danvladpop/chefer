import { describe, expect, it } from 'vitest';
import { formatDayWithWeekday, formatShortDay, weekdayIndexOf, weekdayName } from './dates';

describe('coaching dates', () => {
  it('formats a local date without a timezone shift and without "Sept"', () => {
    expect(formatShortDay('2026-10-02')).toBe('2 Oct');
    expect(formatShortDay('2026-09-30')).toBe('30 Sep');
    expect(formatDayWithWeekday('2026-09-30')).toBe('Wed 30 Sep');
  });

  it('formats an ISO date-time in local time', () => {
    expect(formatShortDay('2026-10-02T12:00:00.000Z')).toBe('2 Oct');
  });

  it('numbers weekdays from Monday like RoutineDay.plannedWeekday', () => {
    expect(weekdayName(0)).toBe('Mon');
    expect(weekdayName(3)).toBe('Thu');
    expect(weekdayIndexOf('2026-10-04')).toBe(6); // Sunday
  });

  it('returns the input when it is not a date', () => {
    expect(formatShortDay('soon')).toBe('soon');
  });
});
