// T-36.5 (Stats › History): week-grouped session history.
import { describe, expect, it } from 'vitest';
import type { SessionSummaryDto } from '@chefer/types';
import { groupSessionsByWeek } from './history';

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
