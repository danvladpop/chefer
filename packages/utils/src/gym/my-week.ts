// ─── My week (simple training mode §6.4, ADR 0001) ────────────────────────────
// My week is NOT a second plan: it is the "Keep it simple" view of the ONE
// active routine. Each weekday is Rest or the routine day pinned to it
// (`plannedWeekday`, first by position); routine days with no weekday — a
// rotation kept from "Track my progress" or built by a trainer — are the
// "unscheduled" days, shown on Today as one-tap shortcuts. Switching training
// style changes only this view, never the data.
//
// `applyMyWeek` turns an edited week back into a routine document saved
// through the ordinary `gym.routine.save` path (versioned, conflict-checked),
// so coaching's attribution and conflict handling work the same in both styles.

import {
  WORKOUT_TYPE_BY_KEY,
  type RoutineDayDto,
  type RoutineDoc,
  type RoutineDto,
  type WorkoutType,
} from '@chefer/types';

/** Monday-first labels; index = `plannedWeekday` (0 = Monday). */
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** A routine holds at most this many days (routineDocSchema). */
export const MY_WEEK_MAX_DAYS = 7;

/** One edited weekday: a workout type, or null for Rest. Seven of them, Monday first. */
export type MyWeekPlan = readonly (WorkoutType | null)[];

export interface MyWeekRow {
  weekday: number;
  /** The routine day planned on this weekday, or null (Rest). */
  day: RoutineDayDto | null;
  workoutType: WorkoutType | null;
  /** "Yoga", "Push A", or "Rest". */
  label: string;
}

export interface MyWeekView {
  rows: MyWeekRow[];
  /** Routine days without a weekday, in routine order. */
  unscheduled: RoutineDayDto[];
  /** Planned (non-rest) weekdays. */
  plannedCount: number;
}

function byPosition(days: readonly RoutineDayDto[]): RoutineDayDto[] {
  return [...days].sort((a, b) => a.position - b.position);
}

/** The label a type has ("Upper body"); falls back to the type key for safety. */
export function workoutTypeLabel(type: WorkoutType): string {
  return WORKOUT_TYPE_BY_KEY.get(type)?.label ?? type;
}

/**
 * How a routine day reads in My week: its own name when it has exercises
 * ("Push A"), otherwise its workout type ("Yoga"). A type-only day's name is
 * the type label anyway; this keeps a renamed one honest.
 */
export function routineDayLabel(
  day: Pick<RoutineDayDto, 'name' | 'workoutType' | 'exercises'>,
): string {
  if (day.exercises.length === 0 && day.workoutType) return workoutTypeLabel(day.workoutType);
  return day.name;
}

/** The 7 weekday rows + unscheduled days of the active routine (null routine = all Rest). */
export function myWeekOf(routine: Pick<RoutineDto, 'days'> | null): MyWeekView {
  const days = byPosition(routine?.days ?? []);
  const rows: MyWeekRow[] = WEEKDAY_SHORT.map((_, weekday) => {
    const day = days.find((d) => d.plannedWeekday === weekday) ?? null;
    return {
      weekday,
      day,
      workoutType: day?.workoutType ?? null,
      label: day ? routineDayLabel(day) : 'Rest',
    };
  });
  const shown = new Set(rows.flatMap((r) => (r.day ? [r.day.id] : [])));
  // A second day pinned to the same weekday can't be shown in its row (one
  // planned workout per weekday); it is listed with the unscheduled ones.
  const unscheduled = days.filter((d) => !shown.has(d.id));
  return { rows, unscheduled, plannedCount: rows.filter((r) => r.day !== null).length };
}

/** The editable plan the My week screen starts from: each row's type, or null. */
export function myWeekPlanOf(view: MyWeekView): (WorkoutType | null)[] {
  // A planned day with exercises but no type reads as "Strength (other)" in the
  // editor: it is a workout, not a rest day.
  return view.rows.map((r) => (r.day ? (r.workoutType ?? 'STRENGTH_OTHER') : null));
}

/** Planned (non-rest) days in a plan — the default weekly goal (§6.4). */
export function plannedDayCount(plan: MyWeekPlan): number {
  return plan.filter((t) => t !== null).length;
}

export type ApplyMyWeekResult =
  | { kind: 'doc'; doc: RoutineDoc }
  /** Every day is Rest and nothing else is left in the routine. */
  | { kind: 'empty' }
  /** The plan plus the unscheduled days exceed MY_WEEK_MAX_DAYS. */
  | { kind: 'too_many_days' };

type DocDay = RoutineDoc['days'][number];

function toDocDay(day: RoutineDayDto, patch: Partial<DocDay> = {}): DocDay {
  return {
    id: day.id,
    name: day.name,
    plannedWeekday: day.plannedWeekday,
    workoutType: day.workoutType ?? null,
    exercises: day.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      sets: e.sets,
      repMin: e.repMin,
      repMax: e.repMax,
      targetRir: e.targetRir,
      restSec: e.restSec,
      supersetGroup: e.supersetGroup,
      notes: e.notes,
    })),
    ...patch,
  };
}

/**
 * Apply an edited week to the active routine. Per weekday:
 *  - Rest: the day planned there is unpinned when it holds exercises (it
 *    becomes unscheduled, nothing is lost) and removed when it holds none
 *    (a type-only day carries nothing but its type);
 *  - a type: the planned day gets that type (a type-only day is renamed to
 *    the type's label), or a new type-only day is added.
 * Unscheduled days are untouched; the routine's order is kept, new days last.
 */
export function applyMyWeek(
  routine: Pick<RoutineDto, 'id' | 'name' | 'days'>,
  plan: MyWeekPlan,
): ApplyMyWeekResult {
  const view = myWeekOf(routine);
  const patches = new Map<string, Partial<DocDay> | 'remove'>();
  const added: DocDay[] = [];

  view.rows.forEach((row, weekday) => {
    const type = plan[weekday] ?? null;
    const day = row.day;
    if (type === null) {
      if (!day) return;
      patches.set(day.id, day.exercises.length > 0 ? { plannedWeekday: null } : 'remove');
      return;
    }
    if (day) {
      patches.set(day.id, {
        workoutType: type,
        ...(day.exercises.length === 0 && { name: workoutTypeLabel(type) }),
      });
      return;
    }
    added.push({
      name: workoutTypeLabel(type),
      plannedWeekday: weekday,
      workoutType: type,
      exercises: [],
    });
  });

  const days: DocDay[] = [];
  for (const day of byPosition(routine.days)) {
    const patch = patches.get(day.id);
    if (patch === 'remove') continue;
    days.push(toDocDay(day, patch));
  }
  days.push(...added);

  if (days.length === 0) return { kind: 'empty' };
  if (days.length > MY_WEEK_MAX_DAYS) return { kind: 'too_many_days' };
  return { kind: 'doc', doc: { id: routine.id, name: routine.name, days } };
}

/** The routine a first My week creates: one type-only day per planned weekday. */
export function newMyWeekDays(plan: MyWeekPlan): DocDay[] {
  return plan.flatMap((type, weekday) =>
    type === null
      ? []
      : [
          {
            name: workoutTypeLabel(type),
            plannedWeekday: weekday,
            workoutType: type,
            exercises: [],
          },
        ],
  );
}

/** "Mon · Upper body · Tue · Yoga" — a compact summary for settings rows. */
export function myWeekSummary(plan: MyWeekPlan): string {
  const planned = plan.flatMap((type, weekday) =>
    type === null ? [] : [`${WEEKDAY_SHORT[weekday]} · ${workoutTypeLabel(type)}`],
  );
  return planned.length > 0 ? planned.join(', ') : 'No workouts planned';
}
