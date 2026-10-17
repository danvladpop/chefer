import {
  TRAINING_STYLE_ANSWERS,
  type NextWorkoutExerciseDto,
  type RoutineDayDto,
  type RoutineDto,
  type SessionSummaryDto,
  type TrainingStyle,
  type WorkoutSessionDoc,
  type WorkoutType,
} from '@chefer/types';
import {
  estimateSessionKcal,
  myWeekOf,
  myWeekPlanOf,
  myWeekSummary,
  routineDayLabel,
  toSessionSummary,
  workoutMinutes,
  workoutTypeLabel,
  type SimpleWeek,
} from '@chefer/utils';

// "Keep it simple" (simple training mode §6, phase 1) — the mobile screens'
// pure pieces: what a Start tap starts, the week and done lines, the live
// "~kcal so far", the My week editor's goal default and the style question's
// answers. Pure, so Train, the old Gym Today, the logger and My week agree.

/** A typed simple workout to start — `StartWorkoutInput`'s `simple` variant. */
export interface SimpleStart {
  kind: 'simple';
  workoutType: WorkoutType;
  name: string;
  routine?: { routineId: string; dayId: string } | null;
  exercises?: NextWorkoutExerciseDto[];
}

/** "Start a workout" from the type picker: the type's label, no routine day. */
export function simpleTypeStart(type: WorkoutType): SimpleStart {
  return { kind: 'simple', workoutType: type, name: workoutTypeLabel(type) };
}

/**
 * A routine day started in simple mode (today's plan or a "From your routine"
 * shortcut): its type (a strength day without one reads as Strength (other)),
 * its My week label, the day it follows and its exercises, ready to tick.
 */
export function simpleDayStart(
  routine: Pick<RoutineDto, 'id'>,
  day: Pick<RoutineDayDto, 'id' | 'name' | 'workoutType' | 'exercises'>,
  exercises: NextWorkoutExerciseDto[],
): SimpleStart {
  return {
    kind: 'simple',
    workoutType: day.workoutType ?? 'STRENGTH_OTHER',
    name: routineDayLabel(day),
    routine: { routineId: routine.id, dayId: day.id },
    exercises,
  };
}

/** "45 min · ~320 kcal" — the kcal part only when there is an estimate. */
export function simpleWeekLine(week: Pick<SimpleWeek, 'minutes' | 'kcal'>): string {
  const minutes = `${week.minutes} min`;
  return week.kcal === null ? minutes : `${minutes} · ~${Math.round(week.kcal)} kcal`;
}

/** "Done today · Yoga · 45 min · ~210 kcal" for the plan card's done state. */
export function simpleDoneLine(
  session: SessionSummaryDto,
  bodyweightKg: number | null | undefined,
): string {
  const parts = ['Done today', session.name, `${workoutMinutes(session)} min`];
  const burn = estimateSessionKcal({ session, bodyweightKg });
  if (burn) parts.push(`${burn.isEstimate ? '~' : ''}${burn.kcal} kcal`);
  return parts.join(' · ');
}

/**
 * The live logger's "~{kcal} kcal so far": the running workout billed as if
 * it finished now. Null without a body weight (nothing honest to say).
 */
export function liveKcalSoFar(
  doc: WorkoutSessionDoc,
  nowIso: string,
  bodyweightKg: number | null | undefined,
): number | null {
  if (bodyweightKg === null || bodyweightKg === undefined) return null;
  const burn = estimateSessionKcal({
    session: { ...toSessionSummary(doc), finishedAt: nowIso },
    bodyweightKg,
  });
  return burn ? burn.kcal : null;
}

/** An exercise's one Done tick: every set done (and at least one set). */
export function isExerciseTicked(exercise: {
  sets: readonly { completedAt: string | null }[];
}): boolean {
  return exercise.sets.length > 0 && exercise.sets.every((s) => s.completedAt !== null);
}

/** The summary line under "My week" in settings and on Today. */
export function myWeekSummaryOf(routine: Pick<RoutineDto, 'days'> | null): string {
  return myWeekSummary(myWeekPlanOf(myWeekOf(routine)));
}

/** A weekly goal kept inside 1..7. */
export function clampWeeklyGoal(n: number): number {
  return Math.min(7, Math.max(1, Math.round(n)));
}

/**
 * My week's "Weekly goal" stepper: the planned-day count until the user
 * touches it (at least 1), then their number.
 */
export function myWeekGoalShown(plannedCount: number, touched: number | null): number {
  return touched ?? clampWeeklyGoal(Math.max(1, plannedCount));
}

/** Onboarding's weekly goal for a SIMPLE answer: the picked training days, or nothing. */
export function onboardingWeeklyGoal(trainingWeekdays: readonly number[]): number | undefined {
  return trainingWeekdays.length > 0 ? clampWeeklyGoal(trainingWeekdays.length) : undefined;
}

export type TrainingStyleAnswerKey = (typeof TRAINING_STYLE_ANSWERS)[number]['key'];

/** "How do you like to train?" → the training style it means. */
export function styleOfAnswer(key: TrainingStyleAnswerKey): TrainingStyle {
  return TRAINING_STYLE_ANSWERS.find((a) => a.key === key)?.style ?? 'PROGRESSIVE';
}
