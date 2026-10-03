import type { RoutineDto, SessionSummaryDto } from '@chefer/types';
import {
  reminderHourOf,
  trainingLandingState,
} from '../../src/features/navigation/training-landing';
import { makeBootstrap, profile } from './gym-fixtures';

// UX-PO-10 (T-04.3 row 4): today's training state, from the gym bootstrap.

const MONDAY = '2026-09-28'; // weekday 0
const TUESDAY = '2026-09-29';

const routine = (plannedWeekday: number | null): RoutineDto => ({
  id: 'r1',
  name: 'Upper/Lower',
  templateKey: null,
  isActive: true,
  nextDayId: 'd1',
  version: 1,
  archived: false,
  updatedAt: '2026-09-01T00:00:00.000Z',
  days: [{ id: 'd1', position: 0, name: 'Upper A', plannedWeekday, exercises: [] }],
});

const doneToday = (localDate: string): SessionSummaryDto => ({
  id: 's1',
  name: 'Upper A',
  routineDayId: 'd1',
  status: 'COMPLETED',
  localDate,
  startedAt: `${localDate}T08:00:00.000Z`,
  finishedAt: `${localDate}T09:00:00.000Z`,
  isDeload: false,
  exercises: [],
});

describe('reminderHourOf', () => {
  it('turns HH:MM into decimal hours and rejects junk', () => {
    expect(reminderHourOf('17:30')).toBe(17.5);
    expect(reminderHourOf('7:00')).toBe(7);
    expect(reminderHourOf(null)).toBeUndefined();
    expect(reminderHourOf('25:00')).toBeUndefined();
    expect(reminderHourOf('noon')).toBeUndefined();
  });
});

describe('trainingLandingState', () => {
  it('has no training day without a gym profile', () => {
    expect(trainingLandingState(makeBootstrap({ profile: null }), MONDAY)).toEqual({
      date: MONDAY,
      isTrainingDay: false,
      workoutDone: false,
    });
  });

  it('a routine day pinned to today is a training day', () => {
    const state = trainingLandingState(makeBootstrap({ activeRoutine: routine(0) }), MONDAY);
    expect(state).toMatchObject({ isTrainingDay: true, workoutDone: false });
  });

  it('is not a training day when the pinned weekday is another day', () => {
    const state = trainingLandingState(makeBootstrap({ activeRoutine: routine(0) }), TUESDAY);
    expect(state.isTrainingDay).toBe(false);
  });

  it('an unpinned rotation has no planned weekdays, so no training day', () => {
    const state = trainingLandingState(makeBootstrap({ activeRoutine: routine(null) }), MONDAY);
    expect(state.isTrainingDay).toBe(false);
  });

  it('a workout already completed today marks it done', () => {
    const state = trainingLandingState(
      makeBootstrap({ activeRoutine: routine(0), recentSessions: [doneToday(MONDAY)] }),
      MONDAY,
    );
    expect(state).toMatchObject({ isTrainingDay: false, workoutDone: true });
  });

  it('a pause cancels the training day', () => {
    const state = trainingLandingState(
      makeBootstrap({
        activeRoutine: routine(0),
        activePause: { id: 'p1', startDate: MONDAY, endDate: '2026-10-05', reason: 'vacation' },
      }),
      MONDAY,
    );
    expect(state.isTrainingDay).toBe(false);
  });

  it('carries the reminder hour only when reminders are on', () => {
    const on = makeBootstrap({
      profile: { ...profile, reminderEnabled: true, reminderTime: '18:30' },
    });
    expect(trainingLandingState(on, MONDAY).reminderHour).toBe(18.5);
    const off = makeBootstrap({
      profile: { ...profile, reminderEnabled: false, reminderTime: '18:30' },
    });
    expect(trainingLandingState(off, MONDAY)).not.toHaveProperty('reminderHour');
  });
});
