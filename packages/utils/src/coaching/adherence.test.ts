import { describe, expect, it } from 'vitest';
import { COACHING_LIMITS } from '@chefer/types';
import { buildAdherence } from './adherence';

// 2026-10-07 is a Wednesday (weekday index 2).
const TODAY = '2026-10-07';

describe('buildAdherence', () => {
  it('builds the 14-day strip ending today with planned / trained / paused', () => {
    const out = buildAdherence({
      today: TODAY,
      sessionDates: ['2026-10-05', '2026-10-02', '2026-09-30'],
      goalHistory: [{ fromWeek: '2026-08-31', goal: 3 }],
      pauses: [{ startDate: '2026-09-28', endDate: '2026-09-29' }],
      plannedWeekdays: [0, 2, 4, null],
      setupDate: '2026-08-31',
    });
    expect(out.days).toHaveLength(COACHING_LIMITS.adherenceDays);
    expect(out.days[0]?.localDate).toBe('2026-09-24');
    expect(out.days.at(-1)?.localDate).toBe(TODAY);
    const byDate = Object.fromEntries(out.days.map((d) => [d.localDate, d]));
    // Monday 5 Oct: planned (0) and trained.
    expect(byDate['2026-10-05']).toEqual({
      localDate: '2026-10-05',
      planned: true,
      trained: true,
      paused: false,
    });
    // Wednesday 30 Sep: planned (2) and trained; Friday 2 Oct: planned (4) and trained.
    expect(byDate['2026-09-30']?.trained).toBe(true);
    // Tuesday 6 Oct: not planned, not trained.
    expect(byDate['2026-10-06']).toMatchObject({ planned: false, trained: false });
    // Monday 28 Sep: planned but paused.
    expect(byDate['2026-09-28']).toMatchObject({ planned: true, trained: false, paused: true });
  });

  it('exposes pause DATES only: no reason anywhere in the output', () => {
    const out = buildAdherence({
      today: TODAY,
      sessionDates: [],
      goalHistory: [{ fromWeek: '2026-09-28', goal: 2 }],
      pauses: [{ startDate: '2026-09-28', endDate: '2026-10-04' }],
      plannedWeekdays: [],
      setupDate: '2026-09-28',
    });
    expect(JSON.stringify(out)).not.toMatch(/reason|injury|illness|vacation/i);
    expect(out.weeks.find((w) => w.weekStart === '2026-09-28')?.status).toBe('paused');
  });

  it('returns at most 8 weeks, oldest first, the last being the current week', () => {
    const out = buildAdherence({
      today: TODAY,
      sessionDates: ['2026-06-01', '2026-10-05', '2026-10-06'],
      goalHistory: [{ fromWeek: '2026-06-01', goal: 2 }],
      pauses: [],
      plannedWeekdays: [0],
      setupDate: '2026-06-01',
    });
    expect(out.weeks).toHaveLength(COACHING_LIMITS.adherenceWeeks);
    expect(out.weeks.at(-1)).toMatchObject({
      weekStart: '2026-10-05',
      sessions: 2,
      goal: 2,
      status: 'met',
    });
    expect(out.weeks.map((w) => w.weekStart)).toEqual(
      [...out.weeks.map((w) => w.weekStart)].sort(),
    );
  });

  it('a client who just started has fewer than 8 weeks', () => {
    const out = buildAdherence({
      today: TODAY,
      sessionDates: [],
      goalHistory: [{ fromWeek: '2026-10-05', goal: 3 }],
      pauses: [],
      plannedWeekdays: [],
      setupDate: '2026-10-05',
    });
    expect(out.weeks).toEqual([
      { weekStart: '2026-10-05', goal: 3, sessions: 0, status: 'current' },
    ]);
  });
});
