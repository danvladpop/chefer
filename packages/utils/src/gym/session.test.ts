import { describe, expect, it } from 'vitest';
import type {
  GymBootstrap,
  GymProfileDto,
  RoutineDto,
  SessionSummaryDto,
  WorkoutSessionDoc,
} from '@chefer/types';
import { foldHistory, prescribe, progressionKey, repBucket } from './progression';
import {
  applyFinishedSession,
  buildNextWorkout,
  doneTodayCard,
  equipmentProfileOf,
  exposuresFromSession,
  missedPlannedDays,
  nextDayIdAfter,
  todayStatus,
  toSessionSummary,
  type ProgressionEntry,
} from './session';
import { KG_PROFILE, lookup, meta } from './test-fixtures';
import { summarizeWeeks } from './weeks';
import { startSession, workoutReducer } from './workout-reducer';

const facts = { experience: 'INTERMEDIATE' as const, ageYears: null };

const PROFILE_DTO: GymProfileDto = {
  experience: 'INTERMEDIATE',
  equipmentAccess: 'FULL_GYM',
  unit: 'KG',
  weeklyGoal: 2,
  barWeightKg: KG_PROFILE.barWeightKg,
  platePairsKg: KG_PROFILE.platePairsKg,
  dumbbellsKg: KG_PROFILE.dumbbellsKg,
  machineStepKg: 5,
  cableStepKg: 2.5,
  hasDipBelt: false,
  microPlates: false,
  reminderEnabled: false,
  reminderTime: null,
  setupCompletedAt: '2026-09-01T10:00:00.000Z',
  reminderTimes: {},
  quietNudgeDays: null,
};

function re(
  id: string,
  exerciseId: string,
  position: number,
  sets: number,
  repMin: number,
  repMax: number,
) {
  const m = lookup(exerciseId);
  return {
    id,
    exerciseId,
    position,
    sets,
    repMin,
    repMax,
    targetRir: m?.category === 'ISOLATION' ? 1 : 2,
    restSec: m?.restSec ?? 120,
    supersetGroup: null,
    notes: position === 0 ? 'Seat 4' : null,
  };
}

const ROUTINE: RoutineDto = {
  id: 'r1',
  name: 'Upper / Lower',
  templateKey: null,
  isActive: true,
  nextDayId: 'dA',
  version: 1,
  archived: false,
  updatedAt: '2026-09-01T10:00:00.000Z',
  days: [
    {
      id: 'dB',
      position: 1,
      name: 'Lower',
      plannedWeekday: 3,
      exercises: [re('e4', 'back-squat', 0, 3, 5, 8), re('e5', 'seated-leg-curl', 1, 2, 10, 15)],
    },
    {
      id: 'dA',
      position: 0,
      name: 'Upper',
      plannedWeekday: 0,
      exercises: [
        re('e2', 'dumbbell-bench-press', 1, 3, 8, 12),
        re('e1', 'barbell-bench-press', 0, 3, 6, 8),
        re('e3', 'mystery-exercise', 2, 3, 8, 12),
        re('e6', 'dumbbell-lateral-raise', 3, 2, 12, 20),
      ],
    },
  ],
};

function summary(
  id: string,
  localDate: string,
  exerciseId: string,
  sets: [number, number, boolean][],
  opts: Partial<SessionSummaryDto> & { skipped?: boolean } = {},
): SessionSummaryDto {
  return {
    id,
    name: 'Upper',
    routineDayId: 'dA',
    status: 'COMPLETED',
    localDate,
    startedAt: `${localDate}T18:00:00.000Z`,
    finishedAt: `${localDate}T19:00:00.000Z`,
    isDeload: false,
    exercises: [
      {
        exerciseId,
        skipped: opts.skipped ?? false,
        lastSetRir: 2,
        sets: sets.map(([weightKg, reps, completed]) => ({
          weightKg,
          reps,
          isWarmup: false,
          completed,
        })),
      },
    ],
    ...opts,
  };
}

describe('nextDayIdAfter', () => {
  it('rotates through days by position and wraps', () => {
    expect(nextDayIdAfter(ROUTINE, 'dA')).toBe('dB');
    expect(nextDayIdAfter(ROUTINE, 'dB')).toBe('dA');
    expect(nextDayIdAfter(ROUTINE, null)).toBe('dA');
    expect(nextDayIdAfter(ROUTINE, 'gone')).toBe('dA');
    expect(nextDayIdAfter({ ...ROUTINE, days: [] }, 'dA')).toBeNull();
  });
});

// T-05.9 (bug B-15): `bootstrap.nextWorkout` always points at the rotation's
// next day, which advances the instant Finish runs — `todayStatus` is what
// stops Gym Today offering that day, with a Start button, on the SAME day.
describe('todayStatus (bug B-15)', () => {
  const MONDAY = '2026-09-07'; // dA "Upper" (plannedWeekday 0)
  const TUESDAY = '2026-09-08';
  const THURSDAY = '2026-09-10'; // dB "Lower" (plannedWeekday 3)

  it('training: nothing done today and the next day is due today', () => {
    const boot = bootstrapFor(MONDAY);
    expect(todayStatus({ bootstrap: boot, today: MONDAY })).toEqual({ kind: 'training' });
  });

  it('rest: nothing done today, but the next day is due a different weekday', () => {
    const boot = bootstrapFor(TUESDAY);
    expect(todayStatus({ bootstrap: boot, today: TUESDAY })).toEqual({
      kind: 'rest',
      dayName: 'Upper',
      weekday: 0,
    });
  });

  it('done: a session was already finished today, even though the next day is due today', () => {
    const boot = bootstrapFor(MONDAY, {
      recentSessions: [summary('s1', MONDAY, 'barbell-bench-press', [[60, 8, true]])],
    });
    expect(todayStatus({ bootstrap: boot, today: MONDAY })).toEqual({
      kind: 'done',
      dayName: 'Upper',
      weekday: 0,
    });
  });

  it('done takes priority even on an otherwise-rest weekday', () => {
    const boot = bootstrapFor(THURSDAY, {
      recentSessions: [summary('s1', THURSDAY, 'barbell-bench-press', [[60, 8, true]])],
    });
    expect(todayStatus({ bootstrap: boot, today: THURSDAY }).kind).toBe('done');
  });

  it('training: no active routine day has a fixed weekday (flexible schedule)', () => {
    const flexible: RoutineDto = {
      ...ROUTINE,
      days: ROUTINE.days.map((d) => ({ ...d, plannedWeekday: null })),
    };
    const boot = bootstrapFor(TUESDAY, { activeRoutine: flexible });
    expect(todayStatus({ bootstrap: boot, today: TUESDAY })).toEqual({ kind: 'training' });
  });

  it('training: no nextWorkout at all (nothing planned)', () => {
    const boot = bootstrapFor(TUESDAY, { nextWorkout: null });
    expect(todayStatus({ bootstrap: boot, today: TUESDAY })).toEqual({ kind: 'training' });
  });
});

describe('missedPlannedDays (T-04.8, UX-04 §7)', () => {
  // ROUTINE: dA "Upper" plannedWeekday 0 (Mon), dB "Lower" plannedWeekday 3 (Thu).
  it('is empty before any planned day this week has passed', () => {
    expect(
      missedPlannedDays({ activeRoutine: ROUTINE, recentSessions: [], today: '2026-09-07' }),
    ).toEqual([]); // Monday itself — Monday's own day isn't "missed" yet
  });

  it('flags Monday once Thursday arrives and Monday was never trained', () => {
    expect(
      missedPlannedDays({ activeRoutine: ROUTINE, recentSessions: [], today: '2026-09-10' }),
    ).toEqual([{ dayId: 'dA', dayName: 'Upper', weekday: 0 }]);
  });

  it('is empty once the missed day was trained that week (any day)', () => {
    const trained = summary('s1', '2026-09-09', 'barbell-bench-press', [[60, 8, true]], {
      routineDayId: 'dA',
    });
    expect(
      missedPlannedDays({
        activeRoutine: ROUTINE,
        recentSessions: [trained],
        today: '2026-09-10',
      }),
    ).toEqual([]);
  });

  it("a session from last week does not excuse this week's missed day", () => {
    const lastWeek = summary('s0', '2026-08-31', 'barbell-bench-press', [[60, 8, true]], {
      routineDayId: 'dA',
    });
    expect(
      missedPlannedDays({
        activeRoutine: ROUTINE,
        recentSessions: [lastWeek],
        today: '2026-09-10',
      }),
    ).toEqual([{ dayId: 'dA', dayName: 'Upper', weekday: 0 }]);
  });

  it('on Sunday, every undone planned day of the week shows (the "Start it now" variant)', () => {
    expect(
      missedPlannedDays({ activeRoutine: ROUTINE, recentSessions: [], today: '2026-09-13' }),
    ).toEqual([
      { dayId: 'dA', dayName: 'Upper', weekday: 0 },
      { dayId: 'dB', dayName: 'Lower', weekday: 3 },
    ]);
  });

  it('is empty with no active routine, or when no day has a fixed weekday', () => {
    expect(
      missedPlannedDays({ activeRoutine: null, recentSessions: [], today: '2026-09-10' }),
    ).toEqual([]);
    const flexible: RoutineDto = {
      ...ROUTINE,
      days: ROUTINE.days.map((d) => ({ ...d, plannedWeekday: null })),
    };
    expect(
      missedPlannedDays({ activeRoutine: flexible, recentSessions: [], today: '2026-09-10' }),
    ).toEqual([]);
  });
});

describe('doneTodayCard (T-05.9)', () => {
  const MONDAY = '2026-09-07';
  const PRIOR_MONDAY = '2026-08-31';

  it('is null when nothing was finished today', () => {
    const boot = bootstrapFor(MONDAY);
    expect(doneTodayCard({ bootstrap: boot, today: MONDAY })).toBeNull();
  });

  it("summarises today's session (duration, working sets, PR count, next)", () => {
    const boot = bootstrapFor(MONDAY, {
      recentSessions: [
        summary('older', PRIOR_MONDAY, 'barbell-bench-press', [[60, 8, true]]),
        // Two completed working sets, the second beating the prior 60 kg — a PR.
        summary('s1', MONDAY, 'barbell-bench-press', [
          [60, 8, true],
          [70, 8, true],
        ]),
      ],
    });
    const card = doneTodayCard({ bootstrap: boot, today: MONDAY });
    expect(card?.session.id).toBe('s1');
    expect(card?.durationMin).toBe(60); // summary() finishes 1h after it starts
    expect(card?.workingSets).toBe(2);
    expect(card?.prCount).toBe(1);
    expect(card?.next).toEqual({ dayName: 'Upper', weekday: 0 });
  });
});

describe('buildNextWorkout', () => {
  const recent = [
    summary('old', '2026-09-01', 'barbell-bench-press', [[60, 8, true]]),
    summary('new', '2026-09-08', 'barbell-bench-press', [
      [62.5, 8, true],
      [62.5, 7, true],
      [62.5, 6, false],
    ]),
    summary('skip', '2026-09-10', 'barbell-bench-press', [[99, 9, true]], { skipped: true }),
    summary('gone', '2026-09-11', 'barbell-bench-press', [[99, 9, true]], { status: 'DISCARDED' }),
    summary('none', '2026-09-12', 'barbell-bench-press', [[99, 9, false]]),
  ];
  const progressions = new Map<string, ProgressionEntry>();
  const benchSlot = {
    exercise: meta('barbell-bench-press'),
    sets: 3,
    repMin: 6,
    repMax: 8,
    targetRir: 2,
    restSec: 180,
  };
  const benchState = foldHistory({
    slot: benchSlot,
    exposures: [],
    profile: KG_PROFILE,
    experience: 'INTERMEDIATE',
    knownWeightKg: 80,
  });
  progressions.set(progressionKey('barbell-bench-press', '6-8'), {
    state: benchState,
    override: null,
  });
  progressions.set(progressionKey('dumbbell-lateral-raise', '12-20'), {
    state: foldHistory({
      slot: {
        ...benchSlot,
        exercise: meta('dumbbell-lateral-raise'),
        sets: 2,
        repMin: 12,
        repMax: 20,
      },
      exposures: [],
      profile: KG_PROFILE,
      experience: 'INTERMEDIATE',
      knownWeightKg: 8,
    }),
    override: { weightKg: 10, reps: [12, 12], at: '2026-09-20T10:00:00.000Z' },
  });

  const workout = buildNextWorkout({
    routine: ROUTINE,
    dayId: 'dA',
    lookup,
    progressions,
    profile: KG_PROFILE,
    facts,
    today: '2026-09-15',
    recentSessions: recent,
    isDeload: false,
  });

  it('orders exercises by position, skipping unknown exercises, with contiguous positions', () => {
    expect(workout.exercises.map((e) => [e.exerciseId, e.position])).toEqual([
      ['barbell-bench-press', 0],
      ['dumbbell-bench-press', 1],
      ['dumbbell-lateral-raise', 2],
    ]);
    expect(workout).toMatchObject({
      routineId: 'r1',
      dayId: 'dA',
      dayName: 'Upper',
      isDeload: false,
    });
    expect(workout.estimatedMin).toBeGreaterThan(20);
  });

  it('prescribes from stored progressions (overrides win) or a fresh initial state', () => {
    const [bench, db, lateral] = workout.exercises;
    expect(bench?.suggestion).toMatchObject({ weightKg: 80, reasonCode: 'START' });
    expect(bench?.repBucket).toBe('6-8');
    expect(bench?.notes).toBe('Seat 4');
    expect(db?.suggestion).toMatchObject({ weightKg: 14, reasonCode: 'START_CALIBRATING' });
    expect(lateral?.suggestion).toMatchObject({ weightKg: 10, reasonCode: 'USER_OVERRIDE' });
  });

  it('ramps the first exercise of a movement pattern, then a single feeler', () => {
    const [bench, db] = workout.exercises;
    expect(bench?.warmups).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 40, reps: 8 },
      { weightKg: 55, reps: 5 },
      { weightKg: 67.5, reps: 2 },
    ]);
    expect(db?.warmups).toEqual([]); // 14 kg < 40 kg: no feeler set
  });

  it('shows the most recent completed working sets as "last time"', () => {
    expect(workout.exercises[0]?.lastTime).toEqual({
      localDate: '2026-09-08',
      sets: [
        { weightKg: 62.5, reps: 8 },
        { weightKg: 62.5, reps: 7 },
      ],
      lastSetRir: 2,
    });
    expect(workout.exercises[1]?.lastTime).toBeNull();
  });

  it('builds deload days and rejects unknown days', () => {
    const deload = buildNextWorkout({
      routine: ROUTINE,
      dayId: 'dA',
      lookup,
      progressions,
      profile: KG_PROFILE,
      facts,
      today: '2026-09-15',
      recentSessions: [],
      isDeload: true,
    });
    expect(deload.isDeload).toBe(true);
    expect(deload.exercises[0]?.suggestion).toMatchObject({
      reasonCode: 'DELOAD',
      sets: 2,
      weightKg: 70,
    });
    expect(deload.exercises[0]?.sets).toBe(2);
    expect(() =>
      buildNextWorkout({
        routine: ROUTINE,
        dayId: 'nope',
        lookup,
        progressions,
        profile: KG_PROFILE,
        facts,
        today: '2026-09-15',
        recentSessions: [],
        isDeload: false,
      }),
    ).toThrow(/has no day/);
  });
});

describe('buildNextWorkout carry-over (T-36.3, CI-49)', () => {
  it('prepends a carried-over exercise from another day, tagged fromLastTime, ahead of the day itself', () => {
    const carried = buildNextWorkout({
      routine: ROUTINE,
      dayId: 'dA',
      lookup,
      progressions: new Map(),
      profile: KG_PROFILE,
      facts,
      today: '2026-09-15',
      recentSessions: [],
      isDeload: false,
      carryOver: [{ exerciseId: 'seated-leg-curl', fromSessionId: 's0', routineDayId: 'dB' }],
    });
    expect(
      carried.exercises.map((e) => [e.exerciseId, e.position, e.fromLastTime ?? false]),
    ).toEqual([
      ['seated-leg-curl', 0, true],
      ['barbell-bench-press', 1, false],
      ['dumbbell-bench-press', 2, false],
      ['dumbbell-lateral-raise', 3, false],
    ]);
  });

  it('never duplicates an exercise already in the day itself', () => {
    const carried = buildNextWorkout({
      routine: ROUTINE,
      dayId: 'dA',
      lookup,
      progressions: new Map(),
      profile: KG_PROFILE,
      facts,
      today: '2026-09-15',
      recentSessions: [],
      isDeload: false,
      carryOver: [
        { exerciseId: 'dumbbell-lateral-raise', fromSessionId: 's0', routineDayId: 'dA' },
      ],
    });
    expect(carried.exercises).toHaveLength(3); // same as the base workout — no extra row
  });

  it('drops a stale carry-over item (routine day or exercise no longer exists) silently', () => {
    const carried = buildNextWorkout({
      routine: ROUTINE,
      dayId: 'dA',
      lookup,
      progressions: new Map(),
      profile: KG_PROFILE,
      facts,
      today: '2026-09-15',
      recentSessions: [],
      isDeload: false,
      carryOver: [
        { exerciseId: 'seated-leg-curl', fromSessionId: 's0', routineDayId: 'gone' },
        { exerciseId: 'never-existed', fromSessionId: 's0', routineDayId: 'dB' },
      ],
    });
    expect(carried.exercises.map((e) => e.exerciseId)).toEqual([
      'barbell-bench-press',
      'dumbbell-bench-press',
      'dumbbell-lateral-raise',
    ]);
  });

  it('omitting carryOver behaves exactly like an empty list (backward compatible)', () => {
    const args = {
      routine: ROUTINE,
      dayId: 'dA' as const,
      lookup,
      progressions: new Map(),
      profile: KG_PROFILE,
      facts,
      today: '2026-09-15',
      recentSessions: [],
      isDeload: false,
    };
    expect(buildNextWorkout(args)).toEqual(buildNextWorkout({ ...args, carryOver: [] }));
  });
});

let idn = 0;
const newId = () => `00000000-0000-4000-8000-${String(++idn).padStart(12, '0')}`;

function bootstrapFor(today: string, overrides: Partial<GymBootstrap> = {}): GymBootstrap {
  const nextWorkout = buildNextWorkout({
    routine: ROUTINE,
    dayId: 'dA',
    lookup,
    progressions: new Map(),
    profile: KG_PROFILE,
    facts,
    today,
    recentSessions: [],
    isDeload: false,
  });
  const { weeks, streak } = summarizeWeeks({
    sessionDates: [],
    goalHistory: [{ fromWeek: '2026-09-07', goal: 2 }],
    pauses: [],
    today: '2026-09-14',
    firstWeek: '2026-09-07',
  });
  return {
    profile: PROFILE_DTO,
    activeRoutine: ROUTINE,
    nextWorkout,
    library: [],
    libraryCursor: '',
    progressions: [],
    recentSessions: [],
    weeks,
    streak,
    offers: [],
    activePause: null,
    carryOver: [],
    bodyweightKg: null,
    serverTime: `${today}T08:00:00.000Z`,
    engineVersion: 1,
    ...overrides,
  };
}

/** Start the planned day, tick every set as prescribed, answer RIR, finish. */
function doWorkout(boot: GymBootstrap, localDate: string, isDeload = false): WorkoutSessionDoc {
  const nw = boot.nextWorkout;
  if (!nw) {
    throw new Error('no next workout');
  }
  let doc = startSession({
    id: newId(),
    newId,
    now: `${localDate}T18:00:00.000Z`,
    localDate,
    routineId: nw.routineId,
    routineDayId: nw.dayId,
    name: nw.dayName,
    isDeload,
    exercises: nw.exercises,
  });
  for (const se of doc.exercises) {
    for (const set of se.sets) {
      doc = workoutReducer(doc, {
        type: 'completeSet',
        seId: se.id,
        setId: set.id,
        reps: set.isWarmup ? set.reps : se.repMax,
        at: `${localDate}T18:30:00.000Z`,
      });
    }
    doc = workoutReducer(doc, {
      type: 'setRir',
      seId: se.id,
      rir: 2,
      at: `${localDate}T18:31:00.000Z`,
    });
  }
  return workoutReducer(doc, { type: 'finish', at: `${localDate}T19:00:00.000Z` });
}

describe('exposuresFromSession / toSessionSummary', () => {
  const boot = bootstrapFor('2026-09-15');
  const doc = doWorkout(boot, '2026-09-15');

  it('maps completed, non-skipped exercises to exposures', () => {
    const skipped = workoutReducer(doc, {
      type: 'skipExercise',
      seId: doc.exercises[1]?.id ?? '',
      skipped: true,
      at: '2026-09-15T19:01:00.000Z',
    });
    const exposures = exposuresFromSession(skipped);
    expect(exposures.map((e) => e.exerciseId)).toEqual([
      'barbell-bench-press',
      'dumbbell-lateral-raise',
    ]);
    const bench = exposures[0]?.exposure;
    expect(bench).toMatchObject({
      sessionId: doc.id,
      localDate: '2026-09-15',
      performedAt: '2026-09-15T18:00:00.000Z',
      sets: 3,
      repMin: 6,
      repMax: 8,
      lastSetRir: 2,
      wasDeload: false,
      skipped: false,
    });
    expect(bench?.loggedSets.filter((s) => !s.isWarmup).map((s) => s.reps)).toEqual([8, 8, 8]);
    expect(bench?.loggedSets.every((s) => s.completed)).toBe(true);
  });

  it('ignores unfinished sessions and flags deload sessions', () => {
    expect(exposuresFromSession({ ...doc, status: 'IN_PROGRESS' })).toEqual([]);
    expect(exposuresFromSession({ ...doc, isDeload: true })[0]?.exposure.wasDeload).toBe(true);
  });

  it('summarises a session for history and PR detection', () => {
    const s = toSessionSummary(doc);
    expect(s).toMatchObject({ id: doc.id, name: 'Upper', routineDayId: 'dA', status: 'COMPLETED' });
    expect(s.exercises).toHaveLength(3);
    expect(s.exercises[0]?.sets.some((x) => x.isWarmup)).toBe(true);
    expect(s.exercises[0]?.notes).toBe('Seat 4');
    expect(s.exercises[1]?.notes).toBeNull();
    const firstEx = doc.exercises[0];
    if (!firstEx) {
      throw new Error('no exercises');
    }
    const odd = toSessionSummary({ ...doc, exercises: [{ ...firstEx, lastSetRir: 7 }] });
    expect(odd.exercises[0]?.lastSetRir).toBeNull();
  });
});

describe('applyFinishedSession — the offline optimistic fold', () => {
  it('updates progressions, rotation, next workout, history and the week ring', () => {
    const boot = bootstrapFor('2026-09-15');
    const doc = doWorkout(boot, '2026-09-15');
    const next = applyFinishedSession({ bootstrap: boot, doc, lookup, facts, today: '2026-09-15' });

    expect(next.activeRoutine?.nextDayId).toBe('dB');
    expect(next.nextWorkout?.dayId).toBe('dB');
    expect(next.recentSessions[0]?.id).toBe(doc.id);
    expect(next.streak.thisWeekSessions).toBe(1);
    expect(next.weeks[next.weeks.length - 1]).toMatchObject({
      weekStart: '2026-09-14',
      sessions: 1,
    });
    expect(next.progressions.map((p) => [p.exerciseId, p.repBucket])).toEqual([
      ['barbell-bench-press', '6-8'],
      ['dumbbell-bench-press', '8-12'],
      ['dumbbell-lateral-raise', '12-20'],
    ]);
    // The server re-folds history from scratch: the optimistic state must match it.
    for (const { exerciseId, exposure } of exposuresFromSession(doc)) {
      const p = next.progressions.find((x) => x.exerciseId === exerciseId);
      const slot = {
        exercise: meta(exerciseId),
        sets: exposure.sets,
        repMin: exposure.repMin,
        repMax: exposure.repMax,
        targetRir: exposure.targetRir,
        restSec: 90,
      };
      const server = foldHistory({
        slot,
        exposures: [exposure],
        profile: KG_PROFILE,
        experience: 'INTERMEDIATE',
      });
      expect(p?.state).toEqual(server);
      expect(p?.suggestion).toEqual(
        prescribe({
          slot,
          state: server,
          override: null,
          profile: KG_PROFILE,
          facts,
          today: '2026-09-15',
          deload: false,
        }),
      );
    }
  });

  it('T-36.3: carries an explicitly-moved exercise into the next workout, then consumes it', () => {
    const boot = bootstrapFor('2026-09-15');
    const nw = boot.nextWorkout;
    if (!nw) throw new Error('no next workout');
    // Log every exercise except the last one (dumbbell-lateral-raise) —
    // "Move them to your next session" on Finish.
    let doc = startSession({
      id: newId(),
      newId,
      now: '2026-09-15T18:00:00.000Z',
      localDate: '2026-09-15',
      routineId: nw.routineId,
      routineDayId: nw.dayId,
      name: nw.dayName,
      isDeload: false,
      exercises: nw.exercises,
    });
    for (const se of doc.exercises) {
      if (se.exerciseId === 'dumbbell-lateral-raise') continue;
      for (const set of se.sets) {
        doc = workoutReducer(doc, {
          type: 'completeSet',
          seId: se.id,
          setId: set.id,
          reps: set.isWarmup ? set.reps : se.repMax,
          at: '2026-09-15T18:30:00.000Z',
        });
      }
    }
    doc = workoutReducer(doc, {
      type: 'finish',
      at: '2026-09-15T19:00:00.000Z',
      carryOverExerciseIds: ['dumbbell-lateral-raise'],
    });

    const afterFinish = applyFinishedSession({
      bootstrap: boot,
      doc,
      lookup,
      facts,
      today: '2026-09-15',
    });
    expect(afterFinish.carryOver).toEqual([
      { exerciseId: 'dumbbell-lateral-raise', fromSessionId: doc.id, routineDayId: 'dA' },
    ]);
    // The rotation moved on to Lower (dB), which doesn't include the lateral
    // raise itself — it's prepended, tagged `fromLastTime`.
    expect(afterFinish.nextWorkout?.dayId).toBe('dB');
    expect(afterFinish.nextWorkout?.exercises[0]).toMatchObject({
      exerciseId: 'dumbbell-lateral-raise',
      fromLastTime: true,
    });

    // Finishing THAT session (touching the lateral raise again) consumes it.
    const secondDoc = doWorkout(afterFinish, '2026-09-17');
    const afterSecond = applyFinishedSession({
      bootstrap: afterFinish,
      doc: secondDoc,
      lookup,
      facts,
      today: '2026-09-17',
    });
    expect(afterSecond.carryOver).toEqual([]);
  });

  it('leaves progressions alone for a backfilled session older than the last exposure', () => {
    const boot = bootstrapFor('2026-09-15');
    const today = doWorkout(boot, '2026-09-15');
    const afterToday = applyFinishedSession({
      bootstrap: boot,
      doc: today,
      lookup,
      facts,
      today: '2026-09-15',
    });
    // Streak repair: log a workout for the 13th AFTER the 15th was folded.
    const past = { ...doWorkout(boot, '2026-09-13'), id: 'backfill-1' };
    const afterBackfill = applyFinishedSession({
      bootstrap: afterToday,
      doc: past,
      lookup,
      facts,
      today: '2026-09-15',
    });
    // Chronological fold can't be done incrementally — the server re-folds;
    // the cached prescriptions must not be corrupted meanwhile.
    expect(afterBackfill.progressions).toEqual(afterToday.progressions);
    // …while history and the week ring still count it.
    expect(afterBackfill.recentSessions.map((s) => s.id)).toContain('backfill-1');
  });

  it('is idempotent for a session that is already in the history', () => {
    const boot = bootstrapFor('2026-09-15');
    const doc = doWorkout(boot, '2026-09-15');
    const once = applyFinishedSession({ bootstrap: boot, doc, lookup, facts, today: '2026-09-15' });
    const twice = applyFinishedSession({
      bootstrap: once,
      doc,
      lookup,
      facts,
      today: '2026-09-15',
    });
    expect(twice.progressions).toEqual(once.progressions);
    expect(twice.recentSessions).toHaveLength(1);
    expect(twice.streak.thisWeekSessions).toBe(1);
  });

  it('folds into existing progressions and consumes overrides set before the session', () => {
    const boot = bootstrapFor('2026-09-15');
    const first = applyFinishedSession({
      bootstrap: boot,
      doc: doWorkout(boot, '2026-09-15'),
      lookup,
      facts,
      today: '2026-09-15',
    });
    const withOverrides: GymBootstrap = {
      ...first,
      activeRoutine: first.activeRoutine ? { ...first.activeRoutine, nextDayId: 'dA' } : null,
      nextWorkout: bootstrapFor('2026-09-18').nextWorkout,
      progressions: first.progressions.map((p) => ({
        ...p,
        override:
          p.exerciseId === 'barbell-bench-press'
            ? { weightKg: 90, reps: [5], at: '2026-09-17T10:00:00.000Z' }
            : { weightKg: 50, reps: [5], at: '2026-09-19T10:00:00.000Z' },
      })),
    };
    const doc = doWorkout(withOverrides, '2026-09-18');
    const next = applyFinishedSession({
      bootstrap: withOverrides,
      doc,
      lookup,
      facts,
      today: '2026-09-18',
    });
    const bench = next.progressions.find((p) => p.exerciseId === 'barbell-bench-press');
    const db = next.progressions.find((p) => p.exerciseId === 'dumbbell-bench-press');
    expect(bench?.override).toBeNull();
    expect(bench?.state.lastExposureDate).toBe('2026-09-18');
    expect(db?.override).not.toBeNull();
    expect(db?.suggestion.reasonCode).toBe('USER_OVERRIDE');
  });

  it('extends the week list into a new week and keeps the best streak', () => {
    const boot = bootstrapFor('2026-09-15', {
      streak: { current: 0, best: 9, flexTokens: 0, thisWeekSessions: 0, thisWeekGoal: 2 },
    });
    const doc = doWorkout(boot, '2026-09-22');
    const next = applyFinishedSession({ bootstrap: boot, doc, lookup, facts, today: '2026-09-22' });
    expect(next.weeks.map((w) => [w.weekStart, w.sessions, w.status])).toEqual([
      ['2026-09-07', 0, 'empty'],
      ['2026-09-14', 0, 'empty'],
      ['2026-09-21', 1, 'current'],
    ]);
    expect(next.streak.best).toBe(9);
  });

  it('keeps the deload flag for the rest of the deload week', () => {
    const boot = bootstrapFor('2026-09-15');
    const deloadBoot: GymBootstrap = {
      ...boot,
      nextWorkout: boot.nextWorkout ? { ...boot.nextWorkout, isDeload: true } : null,
    };
    const doc = doWorkout(deloadBoot, '2026-09-15', true);
    const next = applyFinishedSession({
      bootstrap: deloadBoot,
      doc,
      lookup,
      facts,
      today: '2026-09-15',
    });
    expect(next.nextWorkout?.isDeload).toBe(true);
    expect(next.progressions).toHaveLength(3);
    expect(next.progressions.every((p) => p.state.next.reasonCode === 'DELOAD_DONE')).toBe(true);
  });

  it('leaves the rotation alone for sessions outside the active routine', () => {
    const boot = bootstrapFor('2026-09-15');
    const doc = { ...doWorkout(boot, '2026-09-15'), routineDayId: 'other-day' };
    const next = applyFinishedSession({ bootstrap: boot, doc, lookup, facts, today: '2026-09-15' });
    expect(next.activeRoutine?.nextDayId).toBe('dA');
    const noRoutine = applyFinishedSession({
      bootstrap: { ...boot, activeRoutine: null, nextWorkout: null },
      doc,
      lookup: (id) => (id === 'dumbbell-bench-press' ? undefined : lookup(id)),
      facts,
      today: '2026-09-15',
    });
    expect(noRoutine.nextWorkout).toBeNull();
    expect(noRoutine.progressions.map((p) => p.exerciseId)).toEqual([
      'barbell-bench-press',
      'dumbbell-lateral-raise',
    ]);
  });

  it('does nothing for unfinished sessions or before setup', () => {
    const boot = bootstrapFor('2026-09-15');
    const doc = doWorkout(boot, '2026-09-15');
    expect(
      applyFinishedSession({
        bootstrap: boot,
        doc: { ...doc, status: 'DISCARDED' },
        lookup,
        facts,
        today: '2026-09-15',
      }),
    ).toBe(boot);
    const noProfile = { ...boot, profile: null };
    expect(
      applyFinishedSession({ bootstrap: noProfile, doc, lookup, facts, today: '2026-09-15' }),
    ).toBe(noProfile);
  });

  it('exposes the equipment profile of a GymProfileDto', () => {
    expect(equipmentProfileOf(PROFILE_DTO)).toEqual(KG_PROFILE);
    expect(repBucket(6, 8)).toBe('6-8');
  });
});
