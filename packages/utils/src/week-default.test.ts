import { describe, expect, it } from 'vitest';
import { defaultWeekOffset } from './week-default';

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
