// T-36.5 (Stats › History): week-grouped session history.
import { describe, expect, it } from 'vitest';
import type { SessionSummaryDto } from '@chefer/types';
import { formatLocalDateLong, groupSessionsByWeek, lastSessionsLabel } from './history';

function session(id: string, localDate: string): SessionSummaryDto {
  return {
    id,
    name: 'Upper A',
    routineDayId: null,
    status: 'COMPLETED',
    localDate,
    startedAt: `${localDate}T18:00:00.000Z`,
    finishedAt: `${localDate}T19:00:00.000Z`,
    isDeload: false,
    exercises: [],
  };
}

describe('groupSessionsByWeek', () => {
  it('groups consecutive sessions in the same ISO week (Monday start)', () => {
    const groups = groupSessionsByWeek([
      session('s1', '2026-09-10'), // Thu
      session('s2', '2026-09-08'), // Tue, same week as s1
      session('s3', '2026-09-01'), // Tue, prior week
    ]);
    expect(groups).toEqual([
      {
        weekStart: '2026-09-07',
        sessions: [expect.objectContaining({ id: 's1' }), expect.objectContaining({ id: 's2' })],
      },
      { weekStart: '2026-08-31', sessions: [expect.objectContaining({ id: 's3' })] },
    ]);
  });

  it('returns an empty array for no sessions', () => {
    expect(groupSessionsByWeek([])).toEqual([]);
  });

  it('starts a new group when the same week start recurs non-consecutively (caller keeps sessions ordered)', () => {
    // Pathological input (not newest-first) still groups correctly per-run,
    // it just won't merge a week that appears twice non-adjacently — the
    // caller's contract (newest-first) is what keeps that from happening.
    const groups = groupSessionsByWeek([
      session('a', '2026-09-08'),
      session('b', '2026-09-01'),
      session('c', '2026-09-09'),
    ]);
    expect(groups.map((g) => g.weekStart)).toEqual(['2026-09-07', '2026-08-31', '2026-09-07']);
  });
});

describe('formatLocalDateLong', () => {
  it('formats a local date without shifting the day', () => {
    expect(formatLocalDateLong('2026-09-24', 'en-US')).toBe('Sep 24, 2026');
    expect(formatLocalDateLong('2026-01-01', 'en-US')).toBe('Jan 1, 2026');
  });

  it('returns anything that is not a local date unchanged', () => {
    expect(formatLocalDateLong('not-a-date')).toBe('not-a-date');
    expect(formatLocalDateLong('2026-09-24T10:00:00Z')).toBe('2026-09-24T10:00:00Z');
  });
});

describe('lastSessionsLabel', () => {
  it('is singular for one session', () => {
    expect(lastSessionsLabel(1)).toBe('Last session');
    expect(lastSessionsLabel(5)).toBe('Last 5 sessions');
  });
});
