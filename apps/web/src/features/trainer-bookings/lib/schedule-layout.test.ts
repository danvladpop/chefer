import { describe, expect, it } from 'vitest';
import { minuteToTime, slotSelection, snapMinute } from './schedule-layout';

// The shared layout rules (columns, DST placement, windows) are tested in
// @chefer/utils (coaching/bookings.test.ts); these are the web grid's own.

describe('slot helpers', () => {
  it('a click opens an hour from the slot; a drag picks the duration', () => {
    expect(slotSelection(1085, 1088)).toEqual({ start: 1080, durationMin: 60 });
    expect(slotSelection(1080, 1170)).toEqual({ start: 1080, durationMin: 90 });
    expect(slotSelection(1170, 1080)).toEqual({ start: 1080, durationMin: 90 });
    expect(slotSelection(600, 1200).durationMin).toBe(240);
  });

  it('snaps and formats', () => {
    expect(snapMinute(1088)).toBe(1095);
    expect(snapMinute(-20)).toBe(0);
    expect(minuteToTime(1085)).toBe('18:05');
  });
});
