import { describe, expect, it } from 'vitest';
import {
  intervalsOverlap,
  isValidTimeZone,
  utcToZoned,
  weeklyDates,
  weeklyOccurrences,
  zonedToUtc,
  zoneOffsetMinutes,
} from './booking-time';

const BUC = 'Europe/Bucharest';

describe('zonedToUtc / utcToZoned', () => {
  it('converts a Bucharest wall-clock time both ways, summer and winter', () => {
    // EEST (+3) until 25 Oct 2026, EET (+2) after.
    expect(zonedToUtc('2026-10-20', '18:00', BUC).toISOString()).toBe('2026-10-20T15:00:00.000Z');
    expect(zonedToUtc('2026-10-27', '18:00', BUC).toISOString()).toBe('2026-10-27T16:00:00.000Z');
    expect(utcToZoned('2026-10-27T16:00:00.000Z', BUC)).toEqual({
      date: '2026-10-27',
      time: '18:00',
      weekday: 1,
      minuteOfDay: 18 * 60,
    });
  });

  it('a late-evening time keeps its local date (never the UTC day)', () => {
    // 01:30 local on 21 Oct is still 20 Oct in UTC.
    const at = zonedToUtc('2026-10-21', '01:30', BUC);
    expect(at.toISOString()).toBe('2026-10-20T22:30:00.000Z');
    expect(utcToZoned(at, BUC).date).toBe('2026-10-21');
  });

  it('handles the spring gap and the autumn repeat', () => {
    // 29 Mar 2026: 03:00 → 04:00 in Bucharest. 03:30 does not exist.
    const gap = zonedToUtc('2026-03-29', '03:30', BUC);
    expect(utcToZoned(gap, BUC).time).toBe('04:30');
    // 25 Oct 2026: 04:00 → 03:00. 03:30 happens twice: the first one.
    expect(zonedToUtc('2026-10-25', '03:30', BUC).toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('works in other zones, including half-hour offsets and UTC', () => {
    expect(zonedToUtc('2026-10-20', '09:00', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-20T03:30:00.000Z',
    );
    expect(zonedToUtc('2026-10-20', '09:00', 'UTC').toISOString()).toBe('2026-10-20T09:00:00.000Z');
    expect(zoneOffsetMinutes('America/New_York', new Date('2026-07-01T12:00:00Z'))).toBe(-240);
  });

  it('knows valid zones', () => {
    expect(isValidTimeZone(BUC)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('weekly repeats across the late-October DST change', () => {
  it('keeps 18:00 at 18:00 local: the UTC hour moves', () => {
    const occ = weeklyOccurrences({
      first: '2026-10-13',
      until: '2026-11-03',
      time: '18:00',
      timeZone: BUC,
      max: 52,
    });
    expect(occ.map((d) => d.toISOString())).toEqual([
      '2026-10-13T15:00:00.000Z',
      '2026-10-20T15:00:00.000Z',
      '2026-10-27T16:00:00.000Z',
      '2026-11-03T16:00:00.000Z',
    ]);
    expect(occ.every((d) => utcToZoned(d, BUC).time === '18:00')).toBe(true);
  });

  it('caps the count and includes the end date', () => {
    expect(weeklyDates('2026-01-05', '2026-01-19', 52)).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
    ]);
    expect(weeklyDates('2026-01-05', '2027-12-31', 52)).toHaveLength(52);
  });
});

describe('intervalsOverlap', () => {
  const at = (iso: string, durationMin: number) => ({ startsAt: iso, durationMin });
  it('is half-open: back-to-back slots do not overlap', () => {
    expect(intervalsOverlap(at('2026-10-20T15:00:00Z', 60), at('2026-10-20T16:00:00Z', 30))).toBe(
      false,
    );
    expect(intervalsOverlap(at('2026-10-20T15:00:00Z', 61), at('2026-10-20T16:00:00Z', 30))).toBe(
      true,
    );
    expect(intervalsOverlap(at('2026-10-20T15:30:00Z', 15), at('2026-10-20T15:00:00Z', 60))).toBe(
      true,
    );
  });
});
