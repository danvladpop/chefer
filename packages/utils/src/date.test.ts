import { describe, expect, it } from 'vitest';
import { localDateStr } from './date';

describe('localDateStr (F-TRK-1-1)', () => {
  it("uses the device's calendar day, not the UTC one", () => {
    // 23:30 local on 25 Sep is still the 25th locally, whatever the UTC date.
    expect(localDateStr(new Date(2026, 8, 25, 23, 30))).toBe('2026-09-25');
    // 00:15 local on 26 Sep is the 26th locally.
    expect(localDateStr(new Date(2026, 8, 26, 0, 15))).toBe('2026-09-26');
  });

  it('pads month and day', () => {
    expect(localDateStr(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});
