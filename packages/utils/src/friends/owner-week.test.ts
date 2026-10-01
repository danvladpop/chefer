import { describe, expect, it } from 'vitest';
import { localDateMinusDays, mondayUtcOf, ownerLocalDate, weekdayIndex } from './owner-week';

describe('ownerLocalDate', () => {
  it('reads the owner’s calendar date in their zone', () => {
    // Pacific/Auckland is UTC+13 in NZDT (from 2026-09-27).
    const sunday2330 = new Date('2026-10-04T10:30:00Z'); // Sunday 23:30 in Auckland
    const monday0030 = new Date('2026-10-04T11:30:00Z'); // Monday 00:30 in Auckland
    expect(ownerLocalDate(sunday2330, 'Pacific/Auckland')).toBe('2026-10-04');
    expect(ownerLocalDate(monday0030, 'Pacific/Auckland')).toBe('2026-10-05');
    // …while UTC (and so a viewer/server in UTC) still says Sunday.
    expect(ownerLocalDate(monday0030, null)).toBe('2026-10-04');
    expect(ownerLocalDate(monday0030, 'UTC')).toBe('2026-10-04');
  });

  it('handles zones behind UTC', () => {
    // Sunday 23:00 in Los Angeles (PDT, UTC-7) is already Monday in UTC.
    const t = new Date('2026-10-05T06:00:00Z');
    expect(ownerLocalDate(t, 'America/Los_Angeles')).toBe('2026-10-04');
    expect(ownerLocalDate(t, null)).toBe('2026-10-05');
  });

  it('falls back to UTC for a missing or unknown zone', () => {
    const t = new Date('2026-10-04T23:59:59Z');
    expect(ownerLocalDate(t, undefined)).toBe('2026-10-04');
    expect(ownerLocalDate(t, '')).toBe('2026-10-04');
    expect(ownerLocalDate(t, 'Not/AZone')).toBe('2026-10-04');
  });

  it('follows daylight-saving changes', () => {
    // US fall back: Sunday 2026-11-01 02:00 EDT → 01:00 EST.
    expect(ownerLocalDate(new Date('2026-11-01T05:30:00Z'), 'America/New_York')).toBe('2026-11-01');
    expect(ownerLocalDate(new Date('2026-11-02T04:59:00Z'), 'America/New_York')).toBe('2026-11-01');
    expect(ownerLocalDate(new Date('2026-11-02T05:00:00Z'), 'America/New_York')).toBe('2026-11-02');
    // Romania spring forward: Sunday 2026-03-29 03:00 → 04:00 (EET → EEST).
    expect(ownerLocalDate(new Date('2026-03-28T21:59:00Z'), 'Europe/Bucharest')).toBe('2026-03-28');
    expect(ownerLocalDate(new Date('2026-03-28T22:00:00Z'), 'Europe/Bucharest')).toBe('2026-03-29');
    expect(ownerLocalDate(new Date('2026-03-29T20:59:00Z'), 'Europe/Bucharest')).toBe('2026-03-29');
    expect(ownerLocalDate(new Date('2026-03-29T21:00:00Z'), 'Europe/Bucharest')).toBe('2026-03-30');
  });
});

describe('week helpers', () => {
  it('weekdayIndex is 0 = Monday … 6 = Sunday', () => {
    expect(weekdayIndex('2026-09-28')).toBe(0);
    expect(weekdayIndex('2026-10-04')).toBe(6);
    expect(weekdayIndex('2026-10-05')).toBe(0);
  });

  it('mondayUtcOf gives the UTC midnight of the week’s Monday', () => {
    expect(mondayUtcOf('2026-10-04').toISOString()).toBe('2026-09-28T00:00:00.000Z'); // Sunday
    expect(mondayUtcOf('2026-09-28').toISOString()).toBe('2026-09-28T00:00:00.000Z'); // Monday
    expect(mondayUtcOf('2026-10-05').toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(mondayUtcOf('2026-01-01').toISOString()).toBe('2025-12-29T00:00:00.000Z'); // year edge
  });

  it('an Auckland owner rolls into the next week before a UTC reader does', () => {
    const t = new Date('2026-10-04T11:30:00Z');
    const auckland = ownerLocalDate(t, 'Pacific/Auckland');
    const utc = ownerLocalDate(t, null);
    expect(mondayUtcOf(auckland).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(mondayUtcOf(utc).toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(weekdayIndex(auckland)).toBe(0);
  });

  it('localDateMinusDays builds the 7-day window (today − 6 … today)', () => {
    expect(localDateMinusDays('2026-10-04', 6)).toBe('2026-09-28');
    expect(localDateMinusDays('2026-03-03', 6)).toBe('2026-02-25'); // month edge
    expect(localDateMinusDays('2026-11-02', 6)).toBe('2026-10-27'); // across US DST end
    expect(localDateMinusDays('2026-03-30', 6)).toBe('2026-03-24'); // across RO DST start
    expect(localDateMinusDays('2026-01-03', 6)).toBe('2025-12-28'); // year edge
    expect(localDateMinusDays('2026-10-04', 0)).toBe('2026-10-04');
  });
});
