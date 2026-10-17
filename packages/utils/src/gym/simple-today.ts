// ─── "Keep it simple" Today (simple training mode §6.4 / §6.7) ────────────────
// What simple mode's Train/Today shows, derived once for web and mobile:
//  - today's planned workout from My week ("Tuesday · Yoga": Start, Log a
//    workout, Skip), or "Start a workout" on an unplanned or skipped day;
//  - the routine's unscheduled days as one-tap shortcuts;
//  - the week ring (workouts vs the weekly goal) and minutes + ~kcal this week.
// Missing a planned day is not a failure state: nothing here is ever "missed".
// Pure: no I/O, no clock.

import type {
  GymBootstrap,
  NextWorkoutExerciseDto,
  RoutineDayDto,
  SessionSummaryDto,
  WorkoutSessionDoc,
  WorkoutType,
} from '@chefer/types';
import { estimateSessionKcal, MAX_ACTIVE_SEC } from './burn';
import { workoutTypeOf } from './logged-workout';
import { myWeekOf, routineDayLabel, WEEKDAY_LONG } from './my-week';
import { weekdayOf, weekStartOf } from './weeks';
import { startSession } from './workout-reducer';

export type SimpleTodayPlan =
  /** A workout was finished today (the latest one). */
  | { kind: 'done'; session: SessionSummaryDto }
  /** My week plans a workout today and it was not skipped. */
  | { kind: 'planned'; day: RoutineDayDto; workoutType: WorkoutType | null; label: string }
  /** Nothing planned (or skipped): "Start a workout". */
  | { kind: 'open' };

export interface SimpleWeek {
  done: number;
  goal: number;
  minutes: number;
  /** Rounded estimate, or null when nothing can be said (no weigh-in, nothing logged). */
  kcal: number | null;
}

export interface SimpleToday {
  plan: SimpleTodayPlan;
  /** "Tuesday". */
  weekdayLabel: string;
  /** Routine days with no weekday — shortcuts under "Start a workout". */
  unscheduled: RoutineDayDto[];
  week: SimpleWeek;
  /** The workout-type picker's preselection: today's planned type, else the last one used. */
  defaultType: WorkoutType | null;
}

/** Wall-clock minutes of a finished workout (capped like the burn estimate). */
export function workoutMinutes(
  session: Pick<SessionSummaryDto, 'startedAt' | 'finishedAt'>,
): number {
  if (!session.finishedAt) return 0;
  const sec = (Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 1000;
  if (!Number.isFinite(sec)) return 0;
  return Math.round(Math.max(0, Math.min(sec, MAX_ACTIVE_SEC)) / 60);
}

/** Minutes and ~kcal of this week's finished workouts. */
export function simpleWeekTotals(input: {
  sessions: readonly SessionSummaryDto[];
  today: string;
  bodyweightKg: number | null;
}): { minutes: number; kcal: number | null } {
  const from = weekStartOf(input.today);
  let minutes = 0;
  let kcal: number | null = null;
  for (const s of input.sessions) {
    if (s.status !== 'COMPLETED' || s.localDate < from || s.localDate > input.today) continue;
    minutes += workoutMinutes(s);
    const burn = estimateSessionKcal({ session: s, bodyweightKg: input.bodyweightKg });
    if (burn) kcal = (kcal ?? 0) + burn.kcal;
  }
  return { minutes, kcal };
}

/** The last workout type used, newest first (the picker's fallback preselection). */
export function lastWorkoutType(sessions: readonly SessionSummaryDto[]): WorkoutType | null {
  for (const s of sessions) {
    if (s.status !== 'COMPLETED') continue;
    const type = workoutTypeOf(s);
    if (type) return type;
  }
  return null;
}

export function simpleToday(input: {
  bootstrap: Pick<GymBootstrap, 'activeRoutine' | 'recentSessions' | 'streak' | 'bodyweightKg'>;
  today: string;
  /** The user tapped Skip on today's planned workout (device-local, per day). */
  skipped?: boolean;
}): SimpleToday {
  const { bootstrap, today } = input;
  const weekday = weekdayOf(today);
  const view = myWeekOf(bootstrap.activeRoutine);
  const row = view.rows[weekday];

  const doneToday = bootstrap.recentSessions
    .filter((s) => s.status === 'COMPLETED' && s.localDate === today)
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))[0];

  let plan: SimpleTodayPlan = { kind: 'open' };
  if (doneToday) plan = { kind: 'done', session: doneToday };
  else if (row?.day && !input.skipped) {
    plan = {
      kind: 'planned',
      day: row.day,
      workoutType: row.workoutType,
      label: routineDayLabel(row.day),
    };
  }

  const totals = simpleWeekTotals({
    sessions: bootstrap.recentSessions,
    today,
    bodyweightKg: bootstrap.bodyweightKg,
  });

  return {
    plan,
    weekdayLabel: WEEKDAY_LONG[weekday] ?? '',
    unscheduled: view.unscheduled,
    week: {
      done: bootstrap.streak.thisWeekSessions,
      goal: bootstrap.streak.thisWeekGoal,
      ...totals,
    },
    defaultType: row?.workoutType ?? lastWorkoutType(bootstrap.recentSessions),
  };
}

/**
 * A "Keep it simple" workout, started live: a workout type, optionally a
 * routine day (its exercises listed, ready to tick), nothing else required.
 * The smallest workout is one tap to start and one to finish.
 */
export function startSimpleWorkout(input: {
  id: string;
  newId: () => string;
  now: string;
  localDate: string;
  workoutType: WorkoutType;
  name: string;
  /** The routine day being followed, when started from My week or a shortcut. */
  routine?: { routineId: string; dayId: string } | null;
  exercises?: NextWorkoutExerciseDto[];
}): WorkoutSessionDoc {
  return {
    ...startSession({
      id: input.id,
      newId: input.newId,
      now: input.now,
      localDate: input.localDate,
      routineId: input.routine?.routineId ?? null,
      routineDayId: input.routine?.dayId ?? null,
      name: input.name,
      isDeload: false,
      exercises: input.exercises ?? [],
    }),
    workoutType: input.workoutType,
  };
}
