import { describe, expect, it } from 'vitest';
import type { RoutineDto, SessionSummaryDto, StreakInfo } from '@chefer/types';
import { buildLoggedWorkoutDoc } from './logged-workout';
import { toSessionSummary } from './session';
import {
  isSimpleTraining,
  lastWorkoutType,
  simpleToday,
  startSimpleWorkout,
  workoutMinutes,
} from './simple-today';
import { workoutReducer } from './workout-reducer';

const TUESDAY = '2026-10-13';
let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const routine: RoutineDto = {
  id: 'r1',
  name: 'My week',
  templateKey: null,
  isActive: true,
  nextDayId: null,
  version: 1,
  archived: false,
  updatedAt: '2026-10-01T10:00:00.000Z',
  days: [
    {
      id: 'yoga',
      position: 0,
      name: 'Yoga',
      plannedWeekday: 1,
      workoutType: 'YOGA',
      exercises: [],
    },
    { id: 'push', position: 1, name: 'Push A', plannedWeekday: null, exercises: [] },
  ],
};
const streak: StreakInfo = {
  current: 4,
  best: 4,
  flexTokens: 0,
  thisWeekSessions: 1,
  thisWeekGoal: 3,
};

function logged(
  localDate: string,
  workoutType: 'UPPER_BODY' | 'SPIN',
  minutes: number,
): SessionSummaryDto {
  return toSessionSummary(
    buildLoggedWorkoutDoc({
      input: { workoutType, localDate, durationMin: minutes },
      id: newId(),
      newId,
      startAt: `${localDate}T07:00:00.000Z`,
      now: `${localDate}T20:00:00.000Z`,
    }),
  );
}

describe('simpleToday', () => {
  const monday = logged('2026-10-12', 'UPPER_BODY', 45);
  const base = { activeRoutine: routine, recentSessions: [monday], streak, bodyweightKg: 80 };

  it("shows today's planned workout, the shortcuts, and this week's minutes + ~kcal", () => {
    const view = simpleToday({ bootstrap: base, today: TUESDAY });
    expect(view.weekdayLabel).toBe('Tuesday');
    expect(view.plan).toMatchObject({ kind: 'planned', label: 'Yoga', workoutType: 'YOGA' });
    expect(view.unscheduled.map((d) => d.id)).toEqual(['push']);
    // 45 min upper body at 3.5 MET × 80 kg = 210 kcal.
    expect(view.week).toEqual({ done: 1, goal: 3, minutes: 45, kcal: 210 });
    expect(view.defaultType).toBe('YOGA');
  });

  it('Skip turns a planned day into "Start a workout" with the last used type', () => {
    const view = simpleToday({ bootstrap: { ...base, activeRoutine: null }, today: TUESDAY });
    expect(view.plan.kind).toBe('open');
    expect(view.defaultType).toBe('UPPER_BODY');
    expect(simpleToday({ bootstrap: base, today: TUESDAY, skipped: true }).plan.kind).toBe('open');
  });

  it('is done once any workout finished today, a logged class included', () => {
    const spin = logged(TUESDAY, 'SPIN', 45);
    const view = simpleToday({
      bootstrap: { ...base, recentSessions: [spin, monday] },
      today: TUESDAY,
    });
    expect(view.plan).toMatchObject({ kind: 'done', session: { name: 'Spin' } });
    expect(lastWorkoutType([spin, monday])).toBe('SPIN');
  });

  it('says nothing about kcal without a weigh-in', () => {
    expect(
      simpleToday({ bootstrap: { ...base, bodyweightKg: null }, today: TUESDAY }).week.kcal,
    ).toBeNull();
  });
});

describe('startSimpleWorkout', () => {
  it('is one tap to start and one to finish: a typed workout with no exercises', () => {
    const doc = startSimpleWorkout({
      id: newId(),
      newId,
      now: `${TUESDAY}T18:00:00.000Z`,
      localDate: TUESDAY,
      workoutType: 'UPPER_BODY',
      name: 'Upper body',
    });
    expect(doc).toMatchObject({ workoutType: 'UPPER_BODY', routineDayId: null, exercises: [] });
    const done = workoutReducer(doc, { type: 'finish', at: `${TUESDAY}T18:46:00.000Z` });
    expect(done.status).toBe('COMPLETED');
    expect(workoutMinutes(toSessionSummary(done))).toBe(46);
  });
});

describe('isSimpleTraining', () => {
  it('needs both the flag and a SIMPLE profile', () => {
    expect(isSimpleTraining({ trainingStyle: 'SIMPLE' }, { simpleTraining: true })).toBe(true);
    expect(isSimpleTraining({ trainingStyle: 'SIMPLE' }, { simpleTraining: false })).toBe(false);
    expect(isSimpleTraining({ trainingStyle: 'PROGRESSIVE' }, { simpleTraining: true })).toBe(
      false,
    );
    expect(isSimpleTraining({}, { simpleTraining: true })).toBe(false);
    expect(isSimpleTraining(null, null)).toBe(false);
  });
});
