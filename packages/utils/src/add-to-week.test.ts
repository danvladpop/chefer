import { describe, expect, it } from 'vitest';
import { FRIENDS_COPY } from '@chefer/types';
import {
  addToWeekSlotRows,
  canPickNextWeek,
  dayOfMonth,
  defaultDay,
  isPastDay,
  readAddToWeekFailure,
} from './add-to-week';

// 2026-10-07 is a Wednesday (Mon-first index 2); 2026-10-08 a Thursday (3).
const WED = new Date(2026, 9, 7, 12);
const THU = new Date(2026, 9, 8, 12);

describe('add to week rules', () => {
  it('offers next week from Thursday on', () => {
    expect(canPickNextWeek(WED)).toBe(false);
    expect(canPickNextWeek(THU)).toBe(true);
  });

  it('disables past days of this week only, and defaults to today / Monday', () => {
    expect(isPastDay(0, 1, WED)).toBe(true);
    expect(isPastDay(0, 2, WED)).toBe(false);
    expect(isPastDay(1, 0, WED)).toBe(false);
    expect(defaultDay(0, WED)).toBe(2);
    expect(defaultDay(1, WED)).toBe(0);
  });

  it('numbers the days of the chosen week', () => {
    expect(dayOfMonth(0, 0, WED)).toBe(5);
    expect(dayOfMonth(0, 2, WED)).toBe(7);
    expect(dayOfMonth(1, 0, WED)).toBe(12);
  });
});

describe('addToWeekSlotRows', () => {
  const plan = {
    days: [
      {
        dayOfWeek: 2,
        meals: [
          { type: 'lunch', recipe: { name: 'Soup' } },
          { type: 'snack', recipe: { name: 'Nuts' } },
          { type: 'snack', recipe: { name: 'Fruit' } },
        ],
      },
    ],
  };

  it('adds into empty planned slots and replaces filled ones, in meal order', () => {
    const rows = addToWeekSlotRows(plan, 2, ['breakfast', 'lunch', 'dinner']);
    expect(rows.map((r) => [r.key, r.mode, r.currentName])).toEqual([
      ['breakfast-add', 'add', null],
      ['lunch-0', 'replace', 'Soup'],
      ['dinner-add', 'add', null],
      ['snack-1', 'replace', 'Nuts'],
      ['snack-2', 'replace', 'Fruit'],
    ]);
    expect(rows.find((r) => r.key === 'snack-2')?.slotIndex).toBe(2);
  });

  it('a day with no meals still offers every planned slot', () => {
    expect(addToWeekSlotRows(plan, 4, ['lunch']).map((r) => r.key)).toEqual(['lunch-add']);
  });
});

describe('readAddToWeekFailure', () => {
  it('reads a safety conflict, acknowledgeable only when the server flagged it', () => {
    expect(
      readAddToWeekFailure({
        message: 'UNSAFE_FOR_TABLE: contains peanuts',
        data: { unsafeForTable: { issues: ['peanuts'] } },
      }),
    ).toEqual({ kind: 'conflict', message: 'contains peanuts', canAcknowledge: true });
    expect(readAddToWeekFailure({ message: 'UNSAFE_FOR_TABLE: x', data: {} })).toMatchObject({
      kind: 'conflict',
      canAcknowledge: false,
    });
  });

  it('reads no plan and falls back to a generic error', () => {
    expect(readAddToWeekFailure(new Error(FRIENDS_COPY.addToWeek.noPlan))).toEqual({
      kind: 'noPlan',
    });
    expect(readAddToWeekFailure(new Error('boom'))).toEqual({ kind: 'error' });
    expect(readAddToWeekFailure(null)).toEqual({ kind: 'error' });
  });
});
