import { describe, expect, it } from 'vitest';
import { WORKOUT_TYPES } from '@chefer/types';
import {
  buildLoggedWorkoutDoc,
  startSimpleWorkout,
  toSessionSummary,
  workoutReducer,
  workoutTypeOptions,
} from '@chefer/utils';
import { createMemoryStorage } from '../workout/storage';
import {
  doneTodayLine,
  groupWorkoutTypes,
  isExerciseTicked,
  liveWorkoutKcal,
  MY_WEEK_CONFLICT_MESSAGE,
  myWeekReturnPath,
  myWeekSaveError,
  readSimpleSkip,
  simpleWeekLine,
  tickedExercises,
  writeSimpleSkip,
} from './simple-helpers';

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const START = '2026-10-13T17:00:00.000Z';

function yoga() {
  return startSimpleWorkout({
    id: newId(),
    newId,
    now: START,
    localDate: '2026-10-13',
    workoutType: 'YOGA',
    name: 'Yoga',
  });
}

describe('groupWorkoutTypes', () => {
  it('groups chips under their headings in catalogue order', () => {
    const sections = groupWorkoutTypes(WORKOUT_TYPES);
    expect(sections.map((s) => s.label)).toEqual(['Strength', 'Cardio', 'Classes', 'Other']);
    expect(sections[0]?.types.map((t) => t.label)).toContain('Upper body');
  });

  it('drops a group with nothing in it (strength hidden without simple training)', () => {
    const sections = groupWorkoutTypes(workoutTypeOptions({ includeStrength: false }));
    expect(sections.map((s) => s.group)).not.toContain('strength');
  });
});

describe('simpleWeekLine', () => {
  it('shows kcal only when there is an estimate', () => {
    expect(simpleWeekLine({ minutes: 45, kcal: 280 })).toBe('45 min · ~280 kcal');
    expect(simpleWeekLine({ minutes: 45, kcal: null })).toBe('45 min');
  });
});

describe('liveWorkoutKcal', () => {
  it('bills the running time by the type, and says nothing without a body weight', () => {
    const doc = yoga();
    const later = '2026-10-13T17:46:00.000Z';
    expect(liveWorkoutKcal(doc, later, 70)).toBeGreaterThan(0);
    expect(liveWorkoutKcal(doc, later, null)).toBeNull();
  });
});

describe('doneTodayLine', () => {
  it('reads the finished workout back with its minutes and ~kcal', () => {
    const done = workoutReducer(yoga(), { type: 'finish', at: '2026-10-13T17:45:00.000Z' });
    const line = doneTodayLine(toSessionSummary(done), 70);
    expect(line).toMatch(/^Done today · Yoga · 45 min · ~\d+ kcal$/);
    expect(doneTodayLine(toSessionSummary(done), null)).toBe('Done today · Yoga · 45 min');
  });
});

describe('ticks', () => {
  it('an exercise is ticked when all its working sets are, and a logged entry is never listed', () => {
    const doc = startSimpleWorkout({
      id: newId(),
      newId,
      now: START,
      localDate: '2026-10-13',
      workoutType: 'UPPER_BODY',
      name: 'Upper body',
    });
    const withExercise = workoutReducer(doc, {
      type: 'addExercise',
      newSeId: 'se-1',
      exerciseId: 'barbell-bench-press',
      repMin: 8,
      repMax: 12,
      targetRir: 2,
      restSec: 90,
      prescription: {
        kind: 'start',
        weightKg: 40,
        reps: [10, 10],
        sets: 2,
        reasonCode: 'START',
        inputs: {},
        deltaKg: 0,
        engineVersion: 1,
      },
      warmups: [],
      newSetIds: ['s-1', 's-2'],
      at: START,
    });
    const se = withExercise.exercises[0];
    if (!se) throw new Error('no exercise');
    expect(isExerciseTicked(se)).toBe(false);
    const ticked = workoutReducer(withExercise, {
      type: 'tickExercise',
      seId: 'se-1',
      done: true,
      at: START,
    });
    expect(tickedExercises(ticked).map((e) => e.id)).toEqual(['se-1']);

    const logged = buildLoggedWorkoutDoc({
      input: { workoutType: 'YOGA', localDate: '2026-10-13', durationMin: 30 },
      id: newId(),
      newId,
      startAt: START,
      now: '2026-10-13T20:00:00.000Z',
    });
    expect(tickedExercises(logged)).toEqual([]);
  });
});

describe('skip storage', () => {
  it('remembers Skip for that day only', () => {
    const storage = createMemoryStorage();
    expect(readSimpleSkip(storage, '2026-10-13')).toBe(false);
    writeSimpleSkip(storage, '2026-10-13');
    expect(readSimpleSkip(storage, '2026-10-13')).toBe(true);
    expect(readSimpleSkip(storage, '2026-10-14')).toBe(false);
  });
});

describe('myWeekReturnPath', () => {
  it('returns to settings only when it came from there', () => {
    expect(myWeekReturnPath('?from=settings')).toBe('/gym/settings');
    expect(myWeekReturnPath('')).toBe('/gym');
    expect(myWeekReturnPath('?from=elsewhere')).toBe('/gym');
  });
});

describe('myWeekSaveError', () => {
  const describeError = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

  it('reloads on a stale version and says so plainly', () => {
    const conflict = Object.assign(new Error('stale'), { data: { code: 'CONFLICT' } });
    expect(myWeekSaveError(conflict, describeError)).toEqual({
      message: MY_WEEK_CONFLICT_MESSAGE,
      refetch: true,
    });
  });

  it("shows the server's own words for anything else", () => {
    const tooMany = Object.assign(new Error('A routine holds up to 7 days.'), {
      data: { code: 'BAD_REQUEST' },
    });
    expect(myWeekSaveError(tooMany, describeError)).toEqual({
      message: 'A routine holds up to 7 days.',
      refetch: false,
    });
  });
});
