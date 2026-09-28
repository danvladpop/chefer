import { describe, expect, it } from 'vitest';
import type { StreakInfo, Suggestion, WeekSummary } from '@chefer/types';
import { sessionDeletePreview, targetDiff, type ProgressionTargetSnapshot } from './session-edit';
import { addDaysLocal, weekStartOf } from './weeks';

const TODAY = '2026-09-24';
const CURRENT_WEEK = weekStartOf(TODAY);
const WEEK_MINUS_1 = addDaysLocal(CURRENT_WEEK, -7);
const WEEK_MINUS_2 = addDaysLocal(CURRENT_WEEK, -14);

describe('sessionDeletePreview (T-44.2, UX-44 AC4)', () => {
  it("this week 5 → 4, streak 3 → 2: deleting one of the 5 sessions that already met the current week's goal drops it out of the streak", () => {
    const weeks: WeekSummary[] = [
      { weekStart: WEEK_MINUS_2, goal: 2, sessions: 2, status: 'met', flexTokens: 0 },
      { weekStart: WEEK_MINUS_1, goal: 2, sessions: 2, status: 'met', flexTokens: 0 },
      { weekStart: CURRENT_WEEK, goal: 5, sessions: 5, status: 'met', flexTokens: 0 },
    ];
    const streak: StreakInfo = {
      current: 3,
      best: 3,
      flexTokens: 0,
      thisWeekSessions: 5,
      thisWeekGoal: 5,
    };

    const preview = sessionDeletePreview({
      weeks,
      streak,
      sessionLocalDate: TODAY,
      sessionStatus: 'COMPLETED',
      setsCount: 12,
      today: TODAY,
    });

    expect(preview.setsCount).toBe(12);
    expect(preview.weekChanged).toBe(true);
    expect(preview.thisWeekBefore).toBe(5);
    expect(preview.thisWeekAfter).toBe(4);
    expect(preview.streakChanged).toBe(true);
    expect(preview.streakBefore).toBe(3);
    expect(preview.streakAfter).toBe(2);
  });

  it('a paused week is unaffected by deleting its one session (the streak stays frozen)', () => {
    const weeks: WeekSummary[] = [
      { weekStart: WEEK_MINUS_1, goal: 3, sessions: 1, status: 'paused', flexTokens: 0 },
      { weekStart: CURRENT_WEEK, goal: 3, sessions: 0, status: 'current', flexTokens: 0 },
    ];
    const streak: StreakInfo = {
      current: 0,
      best: 0,
      flexTokens: 0,
      thisWeekSessions: 0,
      thisWeekGoal: 3,
    };

    const preview = sessionDeletePreview({
      weeks,
      streak,
      sessionLocalDate: WEEK_MINUS_1,
      sessionStatus: 'COMPLETED',
      setsCount: 5,
      today: TODAY,
    });

    expect(preview.weekChanged).toBe(false);
    expect(preview.streakChanged).toBe(false);
    expect(preview.thisWeekAfter).toBe(preview.thisWeekBefore);
    expect(preview.streakAfter).toBe(preview.streakBefore);
  });

  it('a non-COMPLETED session (IN_PROGRESS/DISCARDED) was never counted, so deleting it changes nothing', () => {
    const weeks: WeekSummary[] = [
      { weekStart: CURRENT_WEEK, goal: 3, sessions: 2, status: 'current', flexTokens: 0 },
    ];
    const streak: StreakInfo = {
      current: 1,
      best: 2,
      flexTokens: 0,
      thisWeekSessions: 2,
      thisWeekGoal: 3,
    };

    for (const sessionStatus of ['IN_PROGRESS', 'DISCARDED'] as const) {
      const preview = sessionDeletePreview({
        weeks,
        streak,
        sessionLocalDate: TODAY,
        sessionStatus,
        setsCount: 3,
        today: TODAY,
      });
      expect(preview.weekChanged, sessionStatus).toBe(false);
      expect(preview.streakChanged, sessionStatus).toBe(false);
      expect(preview.thisWeekAfter, sessionStatus).toBe(2);
      expect(preview.streakAfter, sessionStatus).toBe(1);
    }
  });
});

function suggestion(over: Partial<Suggestion> = {}): Suggestion {
  return {
    kind: 'hold',
    weightKg: 60,
    reps: [8, 8, 8],
    sets: 3,
    reasonCode: 'ADD_REPS',
    inputs: {},
    deltaKg: 0,
    engineVersion: 1,
    ...over,
  };
}

function snapshot(over: Partial<ProgressionTargetSnapshot> = {}): ProgressionTargetSnapshot {
  return { exerciseId: 'bench', repBucket: '6-10', suggestion: suggestion(), ...over };
}

describe('targetDiff (T-44.4, PAT-14)', () => {
  it('AC2 (part): an unchanged suggestion produces no row', () => {
    expect(targetDiff([snapshot()], [snapshot()])).toEqual([]);
  });

  it('AC2 (part): a weight change (600 → 60 kg style edit) produces one row with before/after', () => {
    const before = [snapshot({ suggestion: suggestion({ weightKg: 60 }) })];
    const after = [snapshot({ suggestion: suggestion({ weightKg: 65 }) })];

    const rows = targetDiff(before, after);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exerciseId: 'bench',
      repBucket: '6-10',
      before: { weightKg: 60 },
      after: { weightKg: 65 },
    });
  });

  it('a rep-target change is also detected even when weight and sets stay put', () => {
    const before = [snapshot({ suggestion: suggestion({ reps: [8, 8, 8] }) })];
    const after = [snapshot({ suggestion: suggestion({ reps: [10, 10, 10] }) })];
    expect(targetDiff(before, after)).toHaveLength(1);
  });

  it('a bucket missing from the "after" snapshot (e.g. the exercise was removed) is skipped, not reported', () => {
    const before = [snapshot({ exerciseId: 'squat' })];
    const after: ProgressionTargetSnapshot[] = [];
    expect(targetDiff(before, after)).toEqual([]);
  });

  it('a bucket only present in "after" (newly added) is not reported either — nothing to compare', () => {
    const before: ProgressionTargetSnapshot[] = [];
    const after = [snapshot({ exerciseId: 'squat' })];
    expect(targetDiff(before, after)).toEqual([]);
  });
});
