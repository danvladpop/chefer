import { describe, expect, it } from 'vitest';
import type { GymBootstrap, NextWorkoutDto, RoutineDto, SessionSummaryDto } from '@chefer/types';
import { selectTodaysSession } from './todays-session';

// UX-FOOD-19: Today's workout card and the Plan's training-day marker must name
// the same session. Routine: Upper pinned to Monday, Lower to Thursday, Pull has
// no weekday.
const day = (id: string, position: number, name: string, plannedWeekday: number | null) => ({
  id,
  position,
  name,
  plannedWeekday,
  exercises: [],
});
const ROUTINE: RoutineDto = {
  id: 'r1',
  name: 'Split',
  templateKey: null,
  isActive: true,
  nextDayId: 'dA',
  version: 1,
  archived: false,
  updatedAt: '2026-09-01T10:00:00.000Z',
  days: [day('dB', 1, 'Lower', 3), day('dA', 0, 'Upper', 0), day('dC', 2, 'Pull', null)],
};
const next = (dayId: string, dayName: string): NextWorkoutDto => ({
  routineId: 'r1',
  dayId,
  dayName,
  isDeload: false,
  estimatedMin: 45,
  exercises: [],
});
const completed = (localDate: string, name: string, routineDayId: string): SessionSummaryDto => ({
  id: `s-${localDate}`,
  name,
  routineDayId,
  status: 'COMPLETED',
  localDate,
  startedAt: `${localDate}T18:00:00.000Z`,
  finishedAt: `${localDate}T19:00:00.000Z`,
  isDeload: false,
  exercises: [],
});
const boot = (
  nextWorkout: NextWorkoutDto | null,
  recentSessions: SessionSummaryDto[] = [],
  activeRoutine: RoutineDto | null = ROUTINE,
): Pick<GymBootstrap, 'recentSessions' | 'nextWorkout' | 'activeRoutine'> => ({
  recentSessions,
  nextWorkout,
  activeRoutine,
});

const MONDAY = '2026-09-07';
const TUESDAY = '2026-09-08';
const THURSDAY = '2026-09-10';

describe('selectTodaysSession', () => {
  it('names the day pinned to today even when the rotation points elsewhere', () => {
    // The rotation moved on to Pull, but Thursday is Lower's day: Plan says Lower.
    expect(selectTodaysSession({ bootstrap: boot(next('dC', 'Pull')), today: THURSDAY })).toEqual({
      kind: 'planned',
      dayId: 'dB',
      dayName: 'Lower',
    });
  });

  it('a session completed today wins over the pin, under the name it was trained as', () => {
    expect(
      selectTodaysSession({
        bootstrap: boot(next('dB', 'Lower'), [completed(MONDAY, 'Upper (short)', 'dA')]),
        today: MONDAY,
      }),
    ).toEqual({ kind: 'completed', dayId: 'dA', dayName: 'Upper (short)' });
  });

  it('with no pin today, falls back to the rotation when its day is due or overdue', () => {
    // Tuesday: Upper (pinned Monday) was missed, so it is today's workout.
    expect(selectTodaysSession({ bootstrap: boot(next('dA', 'Upper')), today: TUESDAY })).toEqual({
      kind: 'rotation',
      dayId: 'dA',
      dayName: 'Upper',
      overdueFrom: 0,
    });
  });

  it('is none on a genuine rest day', () => {
    // Tuesday, the next day (Lower) is pinned to Thursday and nothing is overdue.
    expect(
      selectTodaysSession({
        bootstrap: boot(next('dB', 'Lower'), [completed(MONDAY, 'Upper', 'dA')]),
        today: TUESDAY,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('is none without a routine', () => {
    expect(selectTodaysSession({ bootstrap: boot(null, [], null), today: MONDAY })).toEqual({
      kind: 'none',
    });
  });
});
