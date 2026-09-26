import { describe, expect, it } from 'vitest';
import { daysFrom, firstShoppingDay } from './plan-window.js';

const MONDAY = new Date('2026-09-21T00:00:00');

describe('firstShoppingDay (audit F-PM-3)', () => {
  it('a plan made on Friday of its week shops from Friday', () => {
    expect(firstShoppingDay(MONDAY, new Date('2026-09-25T18:30:00'))).toBe(4);
  });
  it('a plan made before its week starts shops all 7 days', () => {
    expect(firstShoppingDay(MONDAY, new Date('2026-09-20T09:00:00'))).toBe(0);
  });
  it('clamps to Sunday and tolerates a missing createdAt', () => {
    expect(firstShoppingDay(MONDAY, new Date('2026-10-02T09:00:00'))).toBe(6);
    expect(firstShoppingDay(MONDAY, undefined)).toBe(0);
  });
  it('daysFrom keeps the remaining days only', () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek }));
    expect(daysFrom(days, 4).map((d) => d.dayOfWeek)).toEqual([4, 5, 6]);
    expect(daysFrom(days, 0)).toHaveLength(7);
  });
});
