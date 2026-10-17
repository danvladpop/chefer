import type { RoutineDto, SessionSummaryDto, WorkoutSessionDoc } from '@chefer/types';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import {
  clampWeeklyGoal,
  isExerciseTicked,
  liveKcalSoFar,
  myWeekGoalShown,
  myWeekSummaryOf,
  onboardingWeeklyGoal,
  simpleDayStart,
  simpleDoneLine,
  simpleTypeStart,
  simpleWeekLine,
  styleOfAnswer,
} from '../../src/features/gym/simple/simple-helpers';
import {
  isSimpleSkipped,
  skipSimpleDay,
  unskipSimpleDay,
} from '../../src/features/gym/simple/simple-skip';
import { startWorkout } from '../../src/features/gym/use-active-workout';
import { makeDoc } from './gym-fixtures';

// "Keep it simple" (simple training mode §6, phase 1) — the mobile pure
// helpers behind simple Train/Today, the live logger, My week and the style
// question, plus the device-local Skip and the engine's typed start.

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const ROUTINE: Pick<RoutineDto, 'id' | 'days'> = {
  id: 'r1',
  days: [
    { id: 'd1', position: 0, name: 'Yoga', plannedWeekday: 0, workoutType: 'YOGA', exercises: [] },
    { id: 'd2', position: 1, name: 'Push A', plannedWeekday: 2, exercises: [] },
  ],
};

function finished(overrides: Partial<SessionSummaryDto> = {}): SessionSummaryDto {
  return {
    id: 's1',
    name: 'Yoga',
    workoutType: 'YOGA',
    routineDayId: null,
    status: 'COMPLETED',
    localDate: '2026-10-12',
    startedAt: '2026-10-12T17:00:00.000Z',
    finishedAt: '2026-10-12T17:45:00.000Z',
    isDeload: false,
    exercises: [],
    ...overrides,
  };
}

describe('simple starts', () => {
  it('a type alone starts under its label, with no routine day', () => {
    expect(simpleTypeStart('UPPER_BODY')).toEqual({
      kind: 'simple',
      workoutType: 'UPPER_BODY',
      name: 'Upper body',
    });
  });

  it('a routine day brings its type, label, day and exercises; an untyped day is Strength (other)', () => {
    const [yoga, push] = ROUTINE.days;
    if (!yoga || !push) throw new Error('fixture');
    expect(simpleDayStart(ROUTINE, yoga, [])).toEqual({
      kind: 'simple',
      workoutType: 'YOGA',
      name: 'Yoga',
      routine: { routineId: 'r1', dayId: 'd1' },
      exercises: [],
    });
    expect(simpleDayStart(ROUTINE, push, []).workoutType).toBe('STRENGTH_OTHER');
  });
});

describe('week and done lines', () => {
  it('shows ~kcal only when there is an estimate', () => {
    expect(simpleWeekLine({ minutes: 95, kcal: 412.4 })).toBe('95 min · ~412 kcal');
    expect(simpleWeekLine({ minutes: 0, kcal: null })).toBe('0 min');
  });

  it('done today names the workout and its minutes, plus ~kcal with a weigh-in', () => {
    expect(simpleDoneLine(finished(), null)).toBe('Done today · Yoga · 45 min');
    expect(simpleDoneLine(finished(), 70)).toMatch(/^Done today · Yoga · 45 min · ~\d+ kcal$/);
  });
});

describe('live ~kcal so far', () => {
  const live: WorkoutSessionDoc = makeDoc(1, {
    status: 'IN_PROGRESS',
    finishedAt: null,
    startedAt: '2026-10-12T17:00:00.000Z',
    workoutType: 'RUNNING',
  });

  it('bills the running workout as if it finished now', () => {
    const kcal = liveKcalSoFar(live, '2026-10-12T17:30:00.000Z', 70);
    expect(kcal).toBeGreaterThan(0);
    expect(liveKcalSoFar(live, '2026-10-12T18:00:00.000Z', 70)).toBeGreaterThan(kcal ?? 0);
  });

  it('says nothing without a body weight', () => {
    expect(liveKcalSoFar(live, '2026-10-12T17:30:00.000Z', null)).toBeNull();
  });
});

describe('exercise Done tick', () => {
  it('is ticked when every set is done, never with no sets', () => {
    expect(isExerciseTicked({ sets: [{ completedAt: 'x' }, { completedAt: 'y' }] })).toBe(true);
    expect(isExerciseTicked({ sets: [{ completedAt: 'x' }, { completedAt: null }] })).toBe(false);
    expect(isExerciseTicked({ sets: [] })).toBe(false);
  });
});

describe('My week and goals', () => {
  it('summarises the active routine as My week', () => {
    expect(myWeekSummaryOf(ROUTINE)).toBe('Mon · Yoga, Wed · Strength (other)');
    expect(myWeekSummaryOf(null)).toBe('No workouts planned');
  });

  it('the goal follows the planned days until touched, inside 1..7', () => {
    expect(myWeekGoalShown(3, null)).toBe(3);
    expect(myWeekGoalShown(0, null)).toBe(1);
    expect(myWeekGoalShown(3, 5)).toBe(5);
    expect(clampWeeklyGoal(9)).toBe(7);
    expect(clampWeeklyGoal(0)).toBe(1);
  });

  it("onboarding's goal is the number of picked training days, if any", () => {
    expect(onboardingWeeklyGoal([0, 2, 4])).toBe(3);
    expect(onboardingWeeklyGoal([])).toBeUndefined();
  });
});

describe('"How do you like to train?"', () => {
  it('maps the program answer to PROGRESSIVE and the other two to SIMPLE', () => {
    expect(styleOfAnswer('program')).toBe('PROGRESSIVE');
    expect(styleOfAnswer('workout')).toBe('SIMPLE');
    expect(styleOfAnswer('classes')).toBe('SIMPLE');
  });
});

describe('Skip (device-local, one day)', () => {
  beforeEach(() => setKvBackendForTests(createMemoryKvBackend()));

  it('skips one day, undoes, and prunes older days on the next skip', () => {
    skipSimpleDay('2026-10-12');
    expect(isSimpleSkipped('2026-10-12')).toBe(true);
    expect(isSimpleSkipped('2026-10-13')).toBe(false);
    skipSimpleDay('2026-10-13');
    expect(isSimpleSkipped('2026-10-12')).toBe(false);
    expect(kv.keys().filter((k) => k.includes('simple-skip'))).toHaveLength(1);
    unskipSimpleDay('2026-10-13');
    expect(isSimpleSkipped('2026-10-13')).toBe(false);
  });
});

describe('startWorkout — simple', () => {
  beforeEach(() => {
    setKvBackendForTests(createMemoryKvBackend());
    resetGymOwnerForTests();
    activeSessionStore.clear();
  });

  it('starts and persists a typed live workout (one tap, zero exercises)', () => {
    const doc = startWorkout({
      kind: 'simple',
      workoutType: 'YOGA',
      name: 'Yoga',
      routine: { routineId: 'r1', dayId: 'd1' },
    });
    expect(doc).toMatchObject({
      status: 'IN_PROGRESS',
      name: 'Yoga',
      workoutType: 'YOGA',
      routineId: 'r1',
      routineDayId: 'd1',
      exercises: [],
    });
    expect(activeSessionStore.get()?.doc.id).toBe(doc.id);
  });
});
