// ─── Log a workout (simple training mode §6.2, unifying WP-20) ─────────────────
// "Log a workout" records a workout done earlier or elsewhere — "45 min yoga",
// "60 min upper body, 300 kcal" — as a finished WorkoutSession with ONE
// DURATION entry (the type's catalogue row, `WORKOUT_TYPES`), the WP-20 shape
// every shipped client renders, plus the session's `workoutType`. It is synced
// through the same offline outbox and `gym.session.upsertMany` as any workout.
// One sheet in both training styles; it replaced "Log an activity".
//
// RECORD ONLY (D-3). The kcal is stored on the set (`caloriesKcal`) and shown
// back to the user, nothing else: it never raises a food target ("no eating
// back"), never feeds the planner or a rebalance. Like every workout it DOES
// count toward the week, as done today and as a nutrition training day (F-1).

import {
  LOGGED_WORKOUT_EXERCISE_IDS,
  LOGGED_WORKOUT_MAX_DURATION_MIN,
  LOGGED_WORKOUT_MAX_KCAL,
  WORKOUT_NAME_MAX_LENGTH,
  WORKOUT_TYPE_BY_KEY,
  WORKOUT_TYPES,
  type SessionExerciseDoc,
  type SessionSetDoc,
  type WorkoutSessionDoc,
  type WorkoutType,
  type WorkoutTypeEntry,
} from '@chefer/types';
import { formatDurationMinutes } from './cardio';
import { ENGINE_VERSION } from './progression';
import { retimeSession } from './session-edit';
import { addDaysLocal, weekStartOf } from './weeks';

export interface LoggedWorkoutInput {
  workoutType: WorkoutType;
  /** The user's own name; used by the "Other" types, ignored by the named ones. */
  customName?: string;
  /** The day it happened, YYYY-MM-DD. */
  localDate: string;
  durationMin: number;
  /** "From your watch or the machine" — optional. */
  caloriesKcal?: number;
  /** Effort 1–10 — optional. */
  effort?: number;
}

export type LoggedWorkoutField = 'type' | 'name' | 'date' | 'duration' | 'calories' | 'effort';

export type LoggedWorkoutErrors = Partial<Record<LoggedWorkoutField, string>>;

/** Types whose session name is the user's own when they type one. */
const NAMEABLE: ReadonlySet<WorkoutType> = new Set(['OTHER', 'OTHER_CLASS', 'STRENGTH_OTHER']);

/** True when the sheet offers a name field for this type. */
export function isNameableWorkoutType(type: WorkoutType): boolean {
  return NAMEABLE.has(type);
}

/**
 * The workout types a picker offers. Without simple training mode the
 * strength focuses stay hidden (a "Track my progress" strength workout is
 * logged from a routine day or as freestyle), so the sheet keeps WP-20's list.
 */
export function workoutTypeOptions(opts: {
  includeStrength: boolean;
}): readonly WorkoutTypeEntry[] {
  return opts.includeStrength ? WORKOUT_TYPES : WORKOUT_TYPES.filter((t) => t.group !== 'strength');
}

/** The earliest day the sheet offers: Monday of last week (same reach as "log a past workout"). */
export function loggedWorkoutMinDate(today: string): string {
  return weekStartOf(addDaysLocal(today, -7));
}

/** The name the session carries: the type's label, or — for an "Other" type — what the user typed. */
export function loggedWorkoutName(
  input: Pick<LoggedWorkoutInput, 'workoutType' | 'customName'>,
): string {
  const label = WORKOUT_TYPE_BY_KEY.get(input.workoutType)?.label ?? 'Workout';
  const typed = (input.customName ?? '').trim();
  return NAMEABLE.has(input.workoutType) && typed.length > 0 ? typed : label;
}

/**
 * Plain-language problems with a sheet's values, keyed by field — empty when
 * the log can be saved. Copy is user-facing (never a raw Zod message).
 */
export function validateLoggedWorkout(
  input: Partial<LoggedWorkoutInput> & { today: string },
): LoggedWorkoutErrors {
  const errors: LoggedWorkoutErrors = {};
  const type = input.workoutType ? WORKOUT_TYPE_BY_KEY.get(input.workoutType) : undefined;
  if (!type) errors.type = 'Pick a workout type.';
  const name = (input.customName ?? '').trim();
  if (name.length > WORKOUT_NAME_MAX_LENGTH) {
    errors.name = `Keep the name under ${WORKOUT_NAME_MAX_LENGTH} characters.`;
  }
  const date = input.localDate;
  if (!date || date > input.today) errors.date = 'Pick today or an earlier day.';
  else if (date < loggedWorkoutMinDate(input.today))
    errors.date = 'That day is too far back to log.';
  const minutes = input.durationMin;
  if (minutes === undefined || !Number.isFinite(minutes) || minutes < 1) {
    errors.duration = 'Enter how many minutes it lasted.';
  } else if (minutes > LOGGED_WORKOUT_MAX_DURATION_MIN) {
    errors.duration = `Up to ${LOGGED_WORKOUT_MAX_DURATION_MIN} minutes (3 hours) per workout.`;
  }
  const kcal = input.caloriesKcal;
  if (
    kcal !== undefined &&
    (!Number.isFinite(kcal) || kcal < 0 || kcal > LOGGED_WORKOUT_MAX_KCAL)
  ) {
    errors.calories = `Enter calories between 0 and ${LOGGED_WORKOUT_MAX_KCAL}, or leave it blank.`;
  }
  const effort = input.effort;
  if (effort !== undefined && (!Number.isInteger(effort) || effort < 1 || effort > 10)) {
    errors.effort = 'Effort is 1 to 10.';
  }
  return errors;
}

/**
 * The finished session for a valid input: COMPLETED, no routine (so the
 * rotation never moves), one DURATION entry with one ticked set carrying
 * `durationSec` (+ `caloriesKcal` / `intensityRpe` when given). Timed like a
 * past-workout log: it starts at `startAt` on the day and ends `durationMin`
 * later, pulled back so it never ends after `now`.
 */
export function buildLoggedWorkoutDoc(args: {
  input: LoggedWorkoutInput;
  /** Session id (client UUID). */
  id: string;
  newId: () => string;
  /** Device-local instant the activity starts at on its day (e.g. 18:00). */
  startAt: string;
  now: string;
}): WorkoutSessionDoc {
  const { input, id, newId, startAt, now } = args;
  const exerciseId = WORKOUT_TYPE_BY_KEY.get(input.workoutType)?.exerciseId ?? 'other-activity';
  const set: SessionSetDoc = {
    id: newId(),
    position: 0,
    weightKg: 0,
    reps: 0,
    isWarmup: false,
    // Stamped to the session's end below (the set is "done" — it already happened).
    completedAt: now,
    durationSec: Math.round(input.durationMin * 60),
    ...(input.caloriesKcal !== undefined && { caloriesKcal: Math.round(input.caloriesKcal) }),
    ...(input.effort !== undefined && { intensityRpe: input.effort }),
  };
  const exercise: SessionExerciseDoc = {
    id: newId(),
    exerciseId,
    routineExerciseId: null,
    position: 0,
    repMin: 1,
    repMax: 1,
    targetRir: 0,
    restSec: 0,
    skipped: false,
    swappedFromId: null,
    lastSetRir: null,
    // Cardio has no stored progression (Δ2.2): the same inert placeholder the
    // live cardio entry uses (mobile `cardioPrescription`).
    prescription: {
      kind: 'hold',
      weightKg: 0,
      reps: [0],
      sets: 1,
      reasonCode: 'START',
      inputs: {},
      deltaKg: 0,
      engineVersion: ENGINE_VERSION,
    },
    notes: null,
    sets: [set],
  };
  const draft: WorkoutSessionDoc = {
    schemaVersion: 1,
    id,
    routineId: null,
    routineDayId: null,
    name: loggedWorkoutName(input),
    status: 'COMPLETED',
    startedAt: startAt,
    finishedAt: startAt,
    localDate: input.localDate,
    isDeload: false,
    notes: null,
    clientUpdatedAt: now,
    engineVersion: ENGINE_VERSION,
    workoutType: input.workoutType,
    exercises: [exercise],
  };
  const timed = retimeSession(draft, {
    localDate: input.localDate,
    startedAt: startAt,
    durationMin: input.durationMin,
    now,
    at: now,
  });
  const finishedAt = timed.finishedAt ?? now;
  return {
    ...timed,
    exercises: timed.exercises.map((se) => ({
      ...se,
      sets: se.sets.map((s) => ({ ...s, completedAt: finishedAt })),
    })),
  };
}

/**
 * True for a LOGGED workout ("Log a workout", formerly WP-20 "Log an
 * activity"): no routine day, and every exercise is a logged-workout entry.
 * Display only (history icon, the one-line detail card) — a logged workout
 * counts as done today and as a training day like any other (F-1). Works on a
 * `SessionSummaryDto`, a `WorkoutSessionDoc` or a database row.
 */
export function isLoggedWorkout(session: {
  routineDayId: string | null;
  exercises: readonly { exerciseId: string }[];
}): boolean {
  return (
    session.routineDayId === null &&
    session.exercises.length > 0 &&
    session.exercises.every((e) => LOGGED_WORKOUT_EXERCISE_IDS.has(e.exerciseId))
  );
}

/** What a logged workout recorded, read back from any session shape: minutes and kcal. */
export function loggedWorkoutFacts(session: {
  exercises: readonly {
    skipped: boolean;
    sets: readonly { durationSec?: number | undefined; caloriesKcal?: number | undefined }[];
  }[];
}): { durationSec: number | null; caloriesKcal: number | null } {
  let durationSec: number | null = null;
  let caloriesKcal: number | null = null;
  for (const ex of session.exercises) {
    if (ex.skipped) continue;
    for (const s of ex.sets) {
      if (s.durationSec !== undefined) durationSec = (durationSec ?? 0) + s.durationSec;
      if (s.caloriesKcal !== undefined) caloriesKcal = (caloriesKcal ?? 0) + s.caloriesKcal;
    }
  }
  return { durationSec, caloriesKcal };
}

/**
 * "Spin · 45 min · ~400 kcal (from your watch)" — the detail line of a logged
 * workout. The kcal part is only there when it was entered; it is the user's
 * number, never ours, hence "~" and the source.
 */
export function loggedWorkoutSummaryLine(
  name: string,
  facts: { durationSec: number | null; caloriesKcal: number | null },
): string {
  const parts = [name];
  if (facts.durationSec !== null) parts.push(formatDurationMinutes(facts.durationSec));
  if (facts.caloriesKcal !== null) {
    parts.push(`~${Math.round(facts.caloriesKcal)} kcal (from your watch)`);
  }
  return parts.join(' · ');
}

/** Legacy WP-20 entries → their workout type, for sessions logged before `workoutType` existed. */
const TYPE_BY_LOGGED_EXERCISE: ReadonlyMap<string, WorkoutType> = new Map(
  WORKOUT_TYPES.filter((t) => t.exerciseId !== 'other-activity').map((t) => [t.exerciseId, t.type]),
);

/**
 * A session's workout type: the stored one, else — for a WP-20 log from before
 * the field existed — the type its one entry implies. Null for an untyped
 * routine or freestyle workout.
 */
export function workoutTypeOf(session: {
  workoutType?: WorkoutType | undefined;
  routineDayId: string | null;
  exercises: readonly { exerciseId: string }[];
}): WorkoutType | null {
  if (session.workoutType) return session.workoutType;
  if (!isLoggedWorkout(session)) return null;
  const first = session.exercises[0]?.exerciseId;
  return (first && TYPE_BY_LOGGED_EXERCISE.get(first)) || 'OTHER';
}
