// "Log a workout" (simple training mode, unifying WP-20) — the pure rules shared by mobile and web.
import { describe, expect, it } from 'vitest';
import {
  WORKOUT_TYPES,
  workoutSessionDocSchema,
  type GymBootstrap,
  type SessionSummaryDto,
} from '@chefer/types';
import {
  buildLoggedWorkoutDoc,
  isLoggedWorkout,
  loggedWorkoutFacts,
  loggedWorkoutMinDate,
  loggedWorkoutName,
  loggedWorkoutSummaryLine,
  validateLoggedWorkout,
  workoutTypeOf,
  workoutTypeOptions,
} from './logged-workout';
import { sessionStatsOf, sessionStatsText } from './recent';
import { doneTodayCard, todayStatus, toSessionSummary } from './session';
import { selectTodaysSession } from './todays-session';
import { summarizeWeeks } from './weeks';

const TODAY = '2026-10-07'; // a Wednesday
const NOW = '2026-10-07T20:00:00.000Z';

let counter = 0;
const newId = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

const base = {
  workoutType: 'SPIN',
  localDate: TODAY,
  durationMin: 45,
} as const;

function build(over: Partial<Parameters<typeof buildLoggedWorkoutDoc>[0]['input']> = {}) {
  return buildLoggedWorkoutDoc({
    input: { ...base, ...over },
    id: newId(),
    newId,
    startAt: `${over.localDate ?? TODAY}T18:00:00.000Z`,
    now: NOW,
  });
}

describe('buildLoggedWorkoutDoc', () => {
  it('is a finished, routine-less session with one DURATION entry that passes the wire schema', () => {
    const doc = build({ caloriesKcal: 400, effort: 7 });
    expect(workoutSessionDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.status).toBe('COMPLETED');
    expect(doc.routineId).toBeNull();
    expect(doc.routineDayId).toBeNull();
    expect(doc.name).toBe('Spin');
    expect(doc.workoutType).toBe('SPIN');
    expect(doc.exercises).toHaveLength(1);
    const ex = doc.exercises[0];
    expect(ex?.exerciseId).toBe('spin-class');
    expect(ex?.sets).toHaveLength(1);
    const set = ex?.sets[0];
    expect(set).toMatchObject({
      weightKg: 0,
      reps: 0,
      isWarmup: false,
      durationSec: 2700,
      caloriesKcal: 400,
      intensityRpe: 7,
    });
    expect(set?.completedAt).toBe(doc.finishedAt);
  });

  it('omits kcal and effort when not given (optional, never zero-filled)', () => {
    const set = build().exercises[0]?.sets[0];
    expect(set).not.toHaveProperty('caloriesKcal');
    expect(set).not.toHaveProperty('intensityRpe');
  });

  it('lasts durationMin and never ends after now', () => {
    // Start 18:00Z, 45 min → ends 18:45Z, before now (20:00Z).
    const past = build();
    expect(Date.parse(past.finishedAt ?? '') - Date.parse(past.startedAt)).toBe(45 * 60_000);
    // A 3 h activity from 18:00 would end at 21:00Z > now → pulled back to end at now.
    const long = build({ durationMin: 180 });
    expect(long.finishedAt).toBe(NOW);
    expect(Date.parse(long.finishedAt ?? '') - Date.parse(long.startedAt)).toBe(180 * 60_000);
  });

  it('keeps the picked day (yesterday) and names Other after what the user typed', () => {
    const doc = build({
      workoutType: 'OTHER',
      customName: '  Rock climbing ',
      localDate: '2026-10-06',
    });
    expect(doc.localDate).toBe('2026-10-06');
    expect(doc.name).toBe('Rock climbing');
    expect(doc.exercises[0]?.exerciseId).toBe('other-activity');
  });

  it('maps every workout type to its catalogue entry, and the type round-trips', () => {
    for (const t of WORKOUT_TYPES) {
      const doc = build({ workoutType: t.type });
      expect(doc.exercises[0]?.exerciseId).toBe(t.exerciseId);
      expect(workoutTypeOf(doc)).toBe(t.type);
      expect(workoutSessionDocSchema.safeParse(doc).success).toBe(true);
    }
  });

  it('logs a strength focus too ("60 min upper body")', () => {
    const doc = build({ workoutType: 'UPPER_BODY', durationMin: 60 });
    expect(doc.name).toBe('Upper body');
    expect(isLoggedWorkout(doc)).toBe(true);
  });
});

describe('loggedWorkoutName', () => {
  it('uses the type label, ignores a stray custom name, and falls back for an empty Other', () => {
    expect(loggedWorkoutName({ workoutType: 'YOGA', customName: 'ignored' })).toBe('Yoga');
    expect(loggedWorkoutName({ workoutType: 'OTHER', customName: '' })).toBe('Other');
    expect(loggedWorkoutName({ workoutType: 'OTHER_CLASS', customName: 'Barre' })).toBe('Barre');
  });
});

describe('workoutTypeOptions / workoutTypeOf', () => {
  it('hides the strength focuses unless simple training is on', () => {
    expect(workoutTypeOptions({ includeStrength: false }).some((t) => t.group === 'strength')).toBe(
      false,
    );
    expect(workoutTypeOptions({ includeStrength: true })).toHaveLength(WORKOUT_TYPES.length);
  });

  it('reads a WP-20 log from before the field existed by its entry', () => {
    const { workoutType: _dropped, ...legacy } = build({ workoutType: 'YOGA' });
    expect(workoutTypeOf(legacy)).toBe('YOGA');
    expect(workoutTypeOf({ routineDayId: 'd1', exercises: [] })).toBeNull();
  });
});

describe('validateLoggedWorkout', () => {
  it('accepts the common case: a chip and minutes', () => {
    expect(validateLoggedWorkout({ ...base, today: TODAY })).toEqual({});
  });

  it('asks for the minutes, with a plain message', () => {
    expect(validateLoggedWorkout({ ...base, durationMin: 0, today: TODAY }).duration).toMatch(
      /minutes/,
    );
    expect(
      validateLoggedWorkout({ ...base, durationMin: Number.NaN, today: TODAY }).duration,
    ).toBeTruthy();
    expect(validateLoggedWorkout({ ...base, durationMin: 181, today: TODAY }).duration).toMatch(
      /180/,
    );
  });

  it('needs a workout type; a name is optional but bounded', () => {
    expect(validateLoggedWorkout({ ...base, workoutType: 'OTHER', today: TODAY })).toEqual({});
    expect(
      validateLoggedWorkout({
        ...base,
        workoutType: 'OTHER',
        customName: 'x'.repeat(41),
        today: TODAY,
      }).name,
    ).toBeTruthy();
    expect(
      validateLoggedWorkout({ localDate: TODAY, durationMin: 30, today: TODAY }).type,
    ).toBeTruthy();
  });

  it('allows yesterday and earlier this fortnight, never the future or too far back', () => {
    expect(validateLoggedWorkout({ ...base, localDate: '2026-10-06', today: TODAY })).toEqual({});
    expect(loggedWorkoutMinDate(TODAY)).toBe('2026-09-28');
    expect(validateLoggedWorkout({ ...base, localDate: '2026-09-28', today: TODAY })).toEqual({});
    expect(
      validateLoggedWorkout({ ...base, localDate: '2026-09-27', today: TODAY }).date,
    ).toBeTruthy();
    expect(
      validateLoggedWorkout({ ...base, localDate: '2026-10-08', today: TODAY }).date,
    ).toBeTruthy();
  });

  it('keeps kcal optional but bounded, and effort 1-10', () => {
    expect(validateLoggedWorkout({ ...base, caloriesKcal: 400, today: TODAY })).toEqual({});
    expect(
      validateLoggedWorkout({ ...base, caloriesKcal: -1, today: TODAY }).calories,
    ).toBeTruthy();
    expect(
      validateLoggedWorkout({ ...base, caloriesKcal: 9000, today: TODAY }).calories,
    ).toBeTruthy();
    expect(validateLoggedWorkout({ ...base, effort: 0, today: TODAY }).effort).toBeTruthy();
    expect(validateLoggedWorkout({ ...base, effort: 11, today: TODAY }).effort).toBeTruthy();
    expect(validateLoggedWorkout({ ...base, effort: 10, today: TODAY })).toEqual({});
  });
});

describe('isLoggedWorkout', () => {
  it('is true for a routine-less session of logged-workout entries only', () => {
    expect(isLoggedWorkout(build())).toBe(true);
    expect(isLoggedWorkout(toSessionSummary(build()))).toBe(true);
  });

  it('is false for a routine day, a strength session, a mixed one and an empty one', () => {
    const doc = build();
    expect(isLoggedWorkout({ ...doc, routineDayId: 'd1' })).toBe(false);
    expect(
      isLoggedWorkout({
        routineDayId: null,
        exercises: [{ exerciseId: 'barbell-bench-press' }],
      }),
    ).toBe(false);
    expect(
      isLoggedWorkout({
        routineDayId: null,
        exercises: [{ exerciseId: 'spin-class' }, { exerciseId: 'barbell-bench-press' }],
      }),
    ).toBe(false);
    expect(isLoggedWorkout({ routineDayId: null, exercises: [] })).toBe(false);
  });
});

describe('what a logged workout reads back as', () => {
  it('reads minutes and kcal from the sets', () => {
    expect(loggedWorkoutFacts(build({ caloriesKcal: 400 }))).toEqual({
      durationSec: 2700,
      caloriesKcal: 400,
    });
    expect(loggedWorkoutFacts(build())).toEqual({ durationSec: 2700, caloriesKcal: null });
  });

  it('builds the detail line: name · minutes · ~kcal (from your watch)', () => {
    expect(loggedWorkoutSummaryLine('Spin', { durationSec: 2700, caloriesKcal: 400 })).toBe(
      'Spin · 45 min · ~400 kcal (from your watch)',
    );
    expect(loggedWorkoutSummaryLine('Yoga class', { durationSec: 3600, caloriesKcal: null })).toBe(
      'Yoga class · 1 h',
    );
  });

  it('shows a logged workout row as "45 min · ~400 kcal", never "1 sets"', () => {
    const summary = toSessionSummary(build({ caloriesKcal: 400 }));
    expect(sessionStatsOf(summary, false).text).toBe('45 min · ~400 kcal');
    expect(sessionStatsOf(toSessionSummary(build()), false).text).toBe('45 min');
    expect(
      sessionStatsText({
        durationMin: 52,
        workingSets: 12,
        hasPr: true,
        activity: false,
        caloriesKcal: null,
      }).text,
    ).toBe('52 min · 12 sets · PR');
  });
});

// F-1 (2026-10-17): a logged workout counts for the week AND as today's
// workout done, like any other workout (this reversed WP-20's exclusion).
describe('a logged workout counts as done today', () => {
  const routineDay = {
    id: 'dA',
    position: 0,
    name: 'Upper',
    plannedWeekday: 2,
    exercises: [],
  };
  const boot: Pick<
    GymBootstrap,
    'recentSessions' | 'nextWorkout' | 'activeRoutine' | 'olderBests'
  > = {
    activeRoutine: {
      id: 'r1',
      name: 'Split',
      templateKey: null,
      isActive: true,
      nextDayId: 'dA',
      version: 1,
      archived: false,
      updatedAt: '2026-09-01T10:00:00.000Z',
      days: [routineDay],
    },
    nextWorkout: {
      routineId: 'r1',
      dayId: 'dA',
      dayName: 'Upper',
      isDeload: false,
      estimatedMin: 45,
      exercises: [],
    },
    recentSessions: [toSessionSummary(build({ caloriesKcal: 400 }))],
    olderBests: {},
  };

  it("makes today done and names it today's session", () => {
    expect(todayStatus({ bootstrap: boot, today: TODAY }).kind).toBe('done');
    expect(doneTodayCard({ bootstrap: boot, today: TODAY })?.session.name).toBe('Spin');
    expect(selectTodaysSession({ bootstrap: boot, today: TODAY })).toMatchObject({
      kind: 'completed',
      dayName: 'Spin',
    });
  });

  it('and so does a routine workout the same day', () => {
    const strength: SessionSummaryDto = {
      ...toSessionSummary(build()),
      id: 'strength',
      name: 'Upper',
      routineDayId: 'dA',
      exercises: [
        {
          exerciseId: 'barbell-bench-press',
          skipped: false,
          lastSetRir: 2,
          sets: [{ weightKg: 60, reps: 8, isWarmup: false, completed: true }],
        },
      ],
    };
    const withStrength = { ...boot, recentSessions: [strength, ...boot.recentSessions] };
    expect(todayStatus({ bootstrap: withStrength, today: TODAY }).kind).toBe('done');
  });

  it('still counts toward the weekly goal like any finished session', () => {
    const { weeks } = summarizeWeeks({
      sessionDates: [TODAY],
      goalHistory: [{ fromWeek: '2026-10-05', goal: 3 }],
      pauses: [],
      today: TODAY,
      firstWeek: '2026-10-05',
    });
    expect(weeks.at(-1)?.sessions).toBe(1);
  });
});
