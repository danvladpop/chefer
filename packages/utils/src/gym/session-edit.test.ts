import { describe, expect, it } from 'vitest';
import type {
  GymBootstrap,
  SessionSummaryDto,
  StreakInfo,
  Suggestion,
  WeekSummary,
  WorkoutSessionDoc,
} from '@chefer/types';
import { applyExposure, initialState } from './progression';
import { exposuresFromSession } from './session';
import {
  applyPendingCorrections,
  applySessionDeleted,
  applySessionEdited,
  bumpClientUpdatedAt,
  completeLoggedSession,
  discardedTombstone,
  editSummary,
  hasEdits,
  hasLoggableSet,
  nothingTicked,
  replaceExerciseKeepingSets,
  rescheduleSession,
  retimeSession,
  sessionDeletePreview,
  sessionDurationMin,
  snapshotTargets,
  targetDiff,
  touchedExerciseIds,
  type ProgressionTargetSnapshot,
} from './session-edit';
import { KG_PROFILE, slotFor } from './test-fixtures';
import { addDaysLocal, weekStartOf } from './weeks';
import { workoutReducer } from './workout-reducer';

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

// ─── Optimistic apply + corrected-doc builders (T-44.2/T-44.3) ────────────────

function summary(over: Partial<SessionSummaryDto> = {}): SessionSummaryDto {
  return {
    id: 's1',
    name: 'Push',
    routineDayId: null,
    status: 'COMPLETED',
    localDate: TODAY,
    startedAt: `${TODAY}T18:00:00.000Z`,
    finishedAt: `${TODAY}T18:45:00.000Z`,
    isDeload: false,
    exercises: [],
    ...over,
  };
}

function bootstrapWith(sessions: SessionSummaryDto[], sessionsThisWeek: number): GymBootstrap {
  return {
    recentSessions: sessions,
    weeks: [
      { weekStart: WEEK_MINUS_1, goal: 2, sessions: 2, status: 'met', flexTokens: 0 },
      {
        weekStart: CURRENT_WEEK,
        goal: 2,
        sessions: sessionsThisWeek,
        status: sessionsThisWeek >= 2 ? 'met' : 'current',
        flexTokens: 0,
      },
    ],
    streak: {
      current: sessionsThisWeek >= 2 ? 2 : 1,
      best: 2,
      flexTokens: 0,
      thisWeekSessions: sessionsThisWeek,
      thisWeekGoal: 2,
    },
    progressions: [],
  } as unknown as GymBootstrap;
}

function doc(over: Partial<WorkoutSessionDoc> = {}): WorkoutSessionDoc {
  return {
    schemaVersion: 1,
    id: 's1',
    routineId: 'r1',
    routineDayId: 'd1',
    name: 'Push',
    status: 'COMPLETED',
    startedAt: `${TODAY}T18:00:00.000Z`,
    finishedAt: `${TODAY}T18:45:00.000Z`,
    localDate: TODAY,
    isDeload: false,
    notes: null,
    clientUpdatedAt: `${TODAY}T18:45:00.000Z`,
    engineVersion: 1,
    exercises: [
      {
        id: 'se1',
        exerciseId: 'bench',
        routineExerciseId: 're1',
        position: 0,
        repMin: 6,
        repMax: 10,
        targetRir: 2,
        restSec: 120,
        skipped: false,
        swappedFromId: null,
        lastSetRir: 2,
        prescription: {
          kind: 'hold',
          weightKg: 60,
          reps: [8, 8],
          sets: 2,
          reasonCode: 'ADD_REPS',
          inputs: {},
          deltaKg: 0,
          engineVersion: 1,
        },
        notes: null,
        sets: [
          {
            id: 'a',
            position: 0,
            weightKg: 60,
            reps: 8,
            isWarmup: false,
            completedAt: '2026-09-24T18:10:00.000Z',
          },
          {
            id: 'b',
            position: 1,
            weightKg: 600,
            reps: 8,
            isWarmup: false,
            completedAt: '2026-09-24T18:15:00.000Z',
          },
        ],
      },
    ],
    ...over,
  };
}

describe('applySessionDeleted / applySessionEdited / applyPendingCorrections', () => {
  it('delete drops the row and re-settles this week and the streak', () => {
    const b = bootstrapWith([summary()], 2);
    const next = applySessionDeleted(b, 's1', TODAY);
    expect(next.recentSessions).toHaveLength(0);
    expect(next.streak.thisWeekSessions).toBe(1);
    expect(next.streak.current).toBe(1);
  });

  it('delete of an unknown id is a no-op (same reference)', () => {
    const b = bootstrapWith([summary()], 2);
    expect(applySessionDeleted(b, 'nope', TODAY)).toBe(b);
  });

  it('edit replaces the summary and moves the count when the date moves to another week', () => {
    const b = bootstrapWith([summary()], 2);
    const moved = doc({
      localDate: addDaysLocal(TODAY, -7),
      startedAt: '2026-09-17T18:00:00.000Z',
      finishedAt: '2026-09-17T18:45:00.000Z',
    });
    const next = applySessionEdited(b, moved, TODAY);
    expect(next.recentSessions[0]?.localDate).toBe('2026-09-17');
    expect(next.streak.thisWeekSessions).toBe(1);
  });

  it('pending corrections re-apply a DISCARDED tombstone and an edited doc over a stale server list', () => {
    const b = bootstrapWith(
      [summary(), summary({ id: 's2', startedAt: `${TODAY}T10:00:00.000Z` })],
      2,
    );
    const tomb = discardedTombstone(summary(), { engineVersion: 1, at: `${TODAY}T19:00:00.000Z` });
    const next = applyPendingCorrections(b, [tomb], TODAY);
    expect(next.recentSessions.map((s) => s.id)).toEqual(['s2']);
    // A doc for a session the list doesn't hold is ignored.
    expect(applyPendingCorrections(b, [doc({ id: 'zzz' })], TODAY)).toBe(b);
  });
});

describe('discardedTombstone / bumpClientUpdatedAt', () => {
  it('is a childless DISCARDED doc that never carries an older clientUpdatedAt than the session end', () => {
    const t = discardedTombstone(summary(), { engineVersion: 3, at: `${TODAY}T00:00:00.000Z` });
    expect(t.status).toBe('DISCARDED');
    expect(t.exercises).toEqual([]);
    expect(Date.parse(t.clientUpdatedAt)).toBeGreaterThan(Date.parse(`${TODAY}T18:45:00.000Z`));
    expect(t.engineVersion).toBe(3);
  });

  it('bumps past the previous stamp when the clock is behind', () => {
    expect(bumpClientUpdatedAt('2026-09-24T10:00:00.000Z', '2026-09-24T09:00:00.000Z')).toBe(
      '2026-09-24T10:00:00.001Z',
    );
    expect(bumpClientUpdatedAt('2026-09-24T10:00:00.000Z', '2026-09-24T11:00:00.000Z')).toBe(
      '2026-09-24T11:00:00.000Z',
    );
  });
});

describe('edit-mode helpers', () => {
  it('replaceExerciseKeepingSets moves the logged numbers to the new exercise and never touches the routine link', () => {
    const original = doc();
    const next = replaceExerciseKeepingSets(
      original,
      'se1',
      'incline-press',
      '2026-09-24T19:00:00.000Z',
    );
    const se = next.exercises[0];
    expect(se?.exerciseId).toBe('incline-press');
    expect(se?.swappedFromId).toBe('bench');
    expect(se?.routineExerciseId).toBe('re1');
    expect(se?.sets).toEqual(original.exercises[0]?.sets);
  });

  it('rescheduleSession keeps the duration and never lands in the future (AC6)', () => {
    const now = '2026-09-24T20:00:00.000Z';
    const past = rescheduleSession(doc(), {
      localDate: '2026-09-22',
      startedAt: '2026-09-22T07:00:00.000Z',
      now,
      at: now,
    });
    expect(past.localDate).toBe('2026-09-22');
    expect(Date.parse(past.finishedAt ?? '') - Date.parse(past.startedAt)).toBe(45 * 60_000);

    const future = rescheduleSession(doc(), {
      localDate: TODAY,
      startedAt: '2026-09-24T23:00:00.000Z',
      now,
      at: now,
    });
    expect(Date.parse(future.startedAt)).toBeLessThanOrEqual(Date.parse(now));
    expect(Date.parse(future.finishedAt ?? '')).toBeLessThanOrEqual(Date.parse(now));
  });

  it('hasEdits ignores clientUpdatedAt; nothingTicked sees an all-unticked doc', () => {
    const a = doc();
    expect(hasEdits(a, { ...a, clientUpdatedAt: 'x' })).toBe(false);
    const edited = workoutReducer(a, {
      type: 'editSet',
      seId: 'se1',
      setId: 'b',
      weightKg: 60,
      at: '2026-09-24T19:00:00.000Z',
    });
    expect(hasEdits(a, edited)).toBe(true);
    expect(nothingTicked(a)).toBe(false);
    const cleared = workoutReducer(
      workoutReducer(a, { type: 'uncompleteSet', seId: 'se1', setId: 'a', at: 'x' }),
      { type: 'uncompleteSet', seId: 'se1', setId: 'b', at: 'x' },
    );
    expect(nothingTicked(cleared)).toBe(true);
  });

  it('editSummary counts sets, replacements, removals and a date change (counts only)', () => {
    const a = doc();
    const edited = workoutReducer(a, {
      type: 'editSet',
      seId: 'se1',
      setId: 'b',
      weightKg: 60,
      at: 'x',
    });
    expect(editSummary(a, edited)).toEqual({
      setsChanged: 1,
      exercisesReplaced: 0,
      exercisesRemoved: 0,
      dateChanged: false,
    });
    const removed = workoutReducer(a, { type: 'removeExercise', seId: 'se1', at: 'x' });
    expect(editSummary(a, removed).exercisesRemoved).toBe(1);
    expect(removed.exercises).toEqual([]);
    expect(touchedExerciseIds(a, removed)).toEqual(['bench']);
  });

  it('snapshotTargets keeps only the touched exercises', () => {
    const progressions = [
      { exerciseId: 'bench', repBucket: '6-10', suggestion: suggestion() },
      { exerciseId: 'squat', repBucket: '6-10', suggestion: suggestion() },
    ] as unknown as GymBootstrap['progressions'];
    expect(snapshotTargets(progressions, ['bench']).map((p) => p.exerciseId)).toEqual(['bench']);
  });
});

describe('UX-44 AC8 — a progression after an edit equals a fresh fold over the edited history', () => {
  const slot = slotFor('barbell-bench-press', 3, 6, 10);
  const fold = (docs: WorkoutSessionDoc[]) => {
    let state = initialState({
      slot,
      profile: KG_PROFILE,
      experience: 'INTERMEDIATE',
      knownWeightKg: 60,
    });
    for (const d of docs) {
      for (const { exposure } of exposuresFromSession(d)) {
        state = applyExposure({
          slot,
          state,
          exposure,
          profile: KG_PROFILE,
          experience: 'INTERMEDIATE',
        });
      }
    }
    return state;
  };
  it('600 → 60 kg edited in place folds like a history that always said 60', () => {
    const typo = doc({ id: 'h2', localDate: '2026-09-20', startedAt: '2026-09-20T18:00:00.000Z' });
    const fixedByEdit = workoutReducer(typo, {
      type: 'editSet',
      seId: 'se1',
      setId: 'b',
      weightKg: 60,
      at: '2026-09-24T19:00:00.000Z',
    });
    const base = doc().exercises[0];
    if (!base) throw new Error('fixture');
    const alwaysRight = doc({
      id: 'h2',
      localDate: '2026-09-20',
      startedAt: '2026-09-20T18:00:00.000Z',
      exercises: [
        {
          ...base,
          sets: [
            {
              id: 'a',
              position: 0,
              weightKg: 60,
              reps: 8,
              isWarmup: false,
              completedAt: '2026-09-24T18:10:00.000Z',
            },
            {
              id: 'b',
              position: 1,
              weightKg: 60,
              reps: 8,
              isWarmup: false,
              completedAt: '2026-09-24T18:15:00.000Z',
            },
          ],
        },
      ],
    });
    expect(fold([fixedByEdit])).toEqual(fold([alwaysRight]));
    expect(fold([typo])).not.toEqual(fold([alwaysRight]));
  });
});

describe('log mode + When fields (owner dogfood 2026-09-30)', () => {
  const NOW = `${TODAY}T20:00:00.000Z`;
  const noCardio = () => false;

  it('retimeSession sets the day and the length, keeping the chosen start', () => {
    const moved = retimeSession(doc(), {
      localDate: '2026-09-22',
      startedAt: '2026-09-22T17:00:00.000Z',
      durationMin: 70,
      now: NOW,
      at: NOW,
    });
    expect(moved.localDate).toBe('2026-09-22');
    expect(moved.startedAt).toBe('2026-09-22T17:00:00.000Z');
    expect(moved.finishedAt).toBe('2026-09-22T18:10:00.000Z');
    expect(sessionDurationMin(moved)).toBe(70);
  });

  it('retimeSession never ends in the future: a late start today is pulled back to end now', () => {
    const today = retimeSession(doc(), {
      localDate: TODAY,
      startedAt: `${TODAY}T19:30:00.000Z`,
      durationMin: 60,
      now: NOW,
      at: NOW,
    });
    expect(today.finishedAt).toBe(NOW);
    expect(today.startedAt).toBe(`${TODAY}T19:00:00.000Z`);
  });

  it('completeLoggedSession completes every listed set at the end time, leaving cardio and ticks alone', () => {
    const base = doc({ status: 'IN_PROGRESS' });
    const first = base.exercises[0];
    if (!first) throw new Error('fixture');
    const open = doc({
      status: 'IN_PROGRESS',
      exercises: [
        { ...first, sets: first.sets.map((s, i) => (i === 1 ? { ...s, completedAt: null } : s)) },
        {
          ...first,
          id: 'se2',
          exerciseId: 'bike',
          position: 1,
          sets: first.sets.map((s) => ({ ...s, id: `c-${s.id}`, completedAt: null })),
        },
      ],
    });
    const saved = completeLoggedSession(open, { isCardio: (id) => id === 'bike', at: NOW });
    expect(saved.status).toBe('COMPLETED');
    expect(saved.finishedAt).toBe(open.finishedAt);
    expect(saved.exercises[0]?.sets.map((s) => s.completedAt)).toEqual([
      '2026-09-24T18:10:00.000Z',
      open.finishedAt,
    ]);
    expect(saved.exercises[1]?.sets.every((s) => s.completedAt === null)).toBe(true);
  });

  it('hasLoggableSet needs a listed set (or a logged cardio entry)', () => {
    expect(hasLoggableSet(doc(), noCardio)).toBe(true);
    expect(hasLoggableSet(doc({ exercises: [] }), noCardio)).toBe(false);
    const first = doc().exercises[0];
    if (!first) throw new Error('fixture');
    const emptyCardio = doc({
      exercises: [{ ...first, sets: first.sets.map((s) => ({ ...s, completedAt: null })) }],
    });
    expect(hasLoggableSet(emptyCardio, () => true)).toBe(false);
    expect(hasLoggableSet(emptyCardio, noCardio)).toBe(true);
  });
});
