// UX-36 amendment A2 (T-36.A2.1, O-10/O-11): pure day-grouping for Gym
// Today's `Recent` section.
import { describe, expect, it } from 'vitest';
import type { SessionSummaryDto } from '@chefer/types';
import { dayHeading, groupRecentSessions, sessionStatsText } from './recent';

function session(
  id: string,
  localDate: string,
  startedAt: string,
  finishedAt: string,
  name = 'Full Body A',
): SessionSummaryDto {
  return {
    id,
    name,
    routineDayId: null,
    status: 'COMPLETED',
    localDate,
    startedAt,
    finishedAt,
    isDeload: false,
    exercises: [
      {
        exerciseId: 'barbell-bench-press',
        skipped: false,
        lastSetRir: null,
        sets: [
          { weightKg: 80, reps: 10, isWarmup: true, completed: true },
          { weightKg: 80, reps: 10, isWarmup: false, completed: true },
          { weightKg: 80, reps: 9, isWarmup: false, completed: true },
          { weightKg: 80, reps: 5, isWarmup: false, completed: false },
        ],
      },
    ],
  };
}

const TODAY = '2026-09-27';

describe('dayHeading', () => {
  it('is "Today" / "Yesterday", then "{weekday d Mon}" — never an ISO date', () => {
    expect(dayHeading('2026-09-27', TODAY)).toBe('Today');
    expect(dayHeading('2026-09-26', TODAY)).toBe('Yesterday');
    expect(dayHeading('2026-09-24', TODAY)).toBe('Thu 24 Sep');
    expect(dayHeading('2026-09-24', TODAY)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('groupRecentSessions', () => {
  it('groups 5 sessions this week (two on one day) into day headers, 3 by default, times only on the shared day', () => {
    const sessions: SessionSummaryDto[] = [
      session(
        's1',
        '2026-09-27',
        '2026-09-27T18:10:00.000Z',
        '2026-09-27T18:52:00.000Z',
        'Full Body A',
      ),
      session(
        's2',
        '2026-09-27',
        '2026-09-27T07:30:00.000Z',
        '2026-09-27T07:55:00.000Z',
        'Evening ride',
      ),
      session(
        's3',
        '2026-09-26',
        '2026-09-26T18:00:00.000Z',
        '2026-09-26T18:46:00.000Z',
        'Full Body B',
      ),
      session(
        's4',
        '2026-09-24',
        '2026-09-24T18:00:00.000Z',
        '2026-09-24T18:40:00.000Z',
        'Full Body A',
      ),
      session(
        's5',
        '2026-09-22',
        '2026-09-22T18:00:00.000Z',
        '2026-09-22T18:40:00.000Z',
        'Full Body B',
      ),
    ];
    const groups = groupRecentSessions(sessions, TODAY);
    // 3 sessions total (default limit), grouped: Today (2), Yesterday (1).
    expect(groups.map((g) => g.heading)).toEqual(['Today', 'Yesterday']);
    expect(groups[0]?.rows).toHaveLength(2);
    // startTime is the device's local wall clock, whatever the test runner's zone.
    const hhmm = (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    expect(groups[0]?.rows.map((r) => r.startTime)).toEqual([
      hhmm('2026-09-27T18:10:00.000Z'),
      hhmm('2026-09-27T07:30:00.000Z'),
    ]);
    expect(groups[1]?.rows).toHaveLength(1);
    expect(groups.flatMap((g) => g.rows)).toHaveLength(3);
    expect(groups.some((g) => /\d{4}-\d{2}-\d{2}/.test(g.heading))).toBe(false);
  });

  it('durationMin and workingSets (warmups + unticked sets excluded)', () => {
    const s = session('s1', TODAY, '2026-09-27T18:10:00.000Z', '2026-09-27T18:52:00.000Z');
    const [group] = groupRecentSessions([s], TODAY, { limit: 1 });
    expect(group?.rows[0]).toMatchObject({ durationMin: 42, workingSets: 2 });
  });

  it('limit controls how many sessions are taken (Show more)', () => {
    const sessions = Array.from({ length: 6 }, (_, i) =>
      session(
        `s${i}`,
        `2026-09-2${1 + i}`,
        `2026-09-2${1 + i}T18:00:00.000Z`,
        `2026-09-2${1 + i}T18:40:00.000Z`,
      ),
    ).reverse();
    expect(groupRecentSessions(sessions, TODAY, { limit: 3 }).flatMap((g) => g.rows)).toHaveLength(
      3,
    );
    expect(groupRecentSessions(sessions, TODAY, { limit: 8 }).flatMap((g) => g.rows)).toHaveLength(
      6,
    );
  });

  it('marks a PR row when its id is in prSessionIds', () => {
    const s = session('s1', TODAY, '2026-09-27T18:10:00.000Z', '2026-09-27T18:52:00.000Z');
    const [group] = groupRecentSessions([s], TODAY, { prSessionIds: new Set(['s1']) });
    expect(group?.rows[0]?.hasPr).toBe(true);
  });

  it('no sessions → no groups (the section is hidden, P6)', () => {
    expect(groupRecentSessions([], TODAY)).toEqual([]);
  });
});

describe('startTime (local wall clock)', () => {
  it('is not the UTC hour when the device is ahead of UTC', () => {
    const iso = '2026-09-27T18:10:00.000Z';
    const [row] = groupRecentSessions(
      [session('s1', TODAY, iso, '2026-09-27T18:52:00.000Z')],
      TODAY,
    ).flatMap((g) => g.rows);
    const local = new Date(iso);
    expect(row?.startTime).toBe(
      `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`,
    );
  });
});

describe('sessionStatsText (activities)', () => {
  it('omits kcal when none or zero was entered', () => {
    const base = { durationMin: 45, workingSets: 1, hasPr: false, activity: true };
    expect(sessionStatsText({ ...base, caloriesKcal: 400 }).text).toBe('45 min · ~400 kcal');
    expect(sessionStatsText({ ...base, caloriesKcal: 0 }).text).toBe('45 min');
    expect(sessionStatsText({ ...base, caloriesKcal: null }).text).toBe('45 min');
  });
});
