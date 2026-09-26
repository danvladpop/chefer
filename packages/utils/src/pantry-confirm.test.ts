import { describe, expect, it } from 'vitest';
import { pantryConfirmWeekKey, pantryItemsToConfirm } from './pantry-confirm';

const NOW = new Date('2026-09-26T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

describe('pantryItemsToConfirm (F-PM-13)', () => {
  it('skips items checked off less than 3 days ago', () => {
    const items = [
      { id: 'minutes', updatedAt: daysAgo(0.01) },
      { id: 'two-days', updatedAt: daysAgo(2.9) },
      { id: 'three-days', updatedAt: daysAgo(3) },
      { id: 'week', updatedAt: daysAgo(7) },
    ];
    expect(pantryItemsToConfirm(items, NOW).map((i) => i.id)).toEqual(['week', 'three-days']);
  });

  it('accepts ISO strings (tRPC dates over the wire)', () => {
    const items = [{ id: 'a', updatedAt: daysAgo(5).toISOString() }];
    expect(pantryItemsToConfirm(items, NOW)).toHaveLength(1);
  });

  it('honours a custom minimum age', () => {
    const items = [{ id: 'a', updatedAt: daysAgo(1) }];
    expect(pantryItemsToConfirm(items, NOW, 1)).toHaveLength(1);
    expect(pantryItemsToConfirm(items, NOW, 2)).toHaveLength(0);
  });
});

describe('pantryConfirmWeekKey', () => {
  it('is the local Monday of the week', () => {
    expect(pantryConfirmWeekKey(new Date(2026, 8, 26, 12))).toBe('2026-09-21'); // Saturday
    expect(pantryConfirmWeekKey(new Date(2026, 8, 21, 0, 5))).toBe('2026-09-21'); // Monday
  });

  it('treats Sunday as the end of the week, not the start', () => {
    expect(pantryConfirmWeekKey(new Date(2026, 8, 27, 20))).toBe('2026-09-21');
  });

  it('crosses month boundaries', () => {
    expect(pantryConfirmWeekKey(new Date(2026, 9, 2, 9))).toBe('2026-09-28'); // Fri 2 Oct
  });
});
