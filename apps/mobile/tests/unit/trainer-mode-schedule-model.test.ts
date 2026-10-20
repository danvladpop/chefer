import { clockOf, slotTimeAt } from '../../src/features/trainer-mode/bookings/booking-model';

// Trainer mode M3 (docs/prd-2026-10/trainer-mode.md §6.2): the touch grid's own helpers. The shared
// booking rules (layout, labels, windows, drafts) are tested in @chefer/utils coaching/bookings.test.ts.

describe('schedule grid helpers', () => {
  it('a long-press snaps to the 15-minute grid', () => {
    expect(slotTimeAt(18 * 60 + 7)).toBe('18:00');
    expect(slotTimeAt(18 * 60 + 52)).toBe('18:45');
    expect(slotTimeAt(24 * 60 + 30)).toBe('23:45');
    expect(slotTimeAt(-5)).toBe('00:00');
  });

  it('hour labels read HH:MM', () => {
    expect(clockOf(6 * 60)).toBe('06:00');
    expect(clockOf(24 * 60)).toBe('24:00');
  });
});
