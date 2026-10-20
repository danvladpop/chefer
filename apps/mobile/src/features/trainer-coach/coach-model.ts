import type {
  CoachStartDto,
  ExerciseDto,
  GymBootstrap,
  GymProfileDto,
  NextWorkoutDto,
  SessionSummaryDto,
  WorkoutSessionDoc,
} from '@chefer/types';
import { BOOKING_COPY } from '@chefer/types';
import { ENGINE_VERSION, startSession } from '@chefer/utils';
import { FALLBACK_EQUIPMENT } from '../gym/workout/workout-model';
import { firstNameOf } from '../trainer/format';

// ─── Coached workout model (trainer-mode.md §6.7) — pure, no React, no storage ──
// A coached workout is the client's own workout (their prescription, units,
// exercise meta) run through the trainer's logger. The logger reads a
// GymBootstrap, so the client's `trainer.coach.start` answer is shaped into
// one here; the doc it logs is a plain WorkoutSessionDoc with fresh client
// UUIDs, synced later through `trainer.coach.sync` with its booking.

/** The `bookingId` route segment (and KV key part) for "Log a workout for Maria" with no booking. */
export const NO_BOOKING = 'none';

/** KV / route key of a booking: its id, or `none`. */
export function bookingKeyOf(bookingId: string | null): string {
  return bookingId ?? NO_BOOKING;
}

/** The route segment back to a booking id (`none` → null). */
export function bookingIdOf(bookingKey: string): string | null {
  return bookingKey === NO_BOOKING ? null : bookingKey;
}

/** A coached doc in the outbox: the session doc plus the booking it was logged for. */
export type CoachedDoc = WorkoutSessionDoc & { bookingId?: string | null };

/** The booking a queued doc carries (null for a workout logged without one). */
export function bookingOfDoc(doc: WorkoutSessionDoc): string | null {
  return 'bookingId' in doc && typeof doc.bookingId === 'string' ? doc.bookingId : null;
}

export interface StartDeps {
  newId: () => string;
  now: string;
  localDate: string;
}

/**
 * The logger state for a client's prescription: the same `startSession` the client's own logger
 * runs, against THEIR routine day. Null when they have no routine (the screen says so instead).
 */
export function startCoachedDoc(start: CoachStartDto, deps: StartDeps): WorkoutSessionDoc | null {
  const workout = start.workout;
  if (!workout) return null;
  return startSession({
    id: deps.newId(),
    newId: deps.newId,
    now: deps.now,
    localDate: deps.localDate,
    routineId: workout.routineId,
    routineDayId: workout.dayId,
    name: workout.dayName,
    isDeload: workout.isDeload,
    exercises: workout.exercises,
  });
}

/**
 * Coached sets are confirmed loads: the trainer saw them (§6.7). The coached logger never marks a set
 * otherwise, but the guard keeps a `loadConfirmed: false` from ever reaching `trainer.coach.sync`.
 */
export function confirmLoads(doc: WorkoutSessionDoc): WorkoutSessionDoc {
  const unconfirmed = doc.exercises.some((se) => se.sets.some((s) => s.loadConfirmed === false));
  if (!unconfirmed) return doc;
  return {
    ...doc,
    exercises: doc.exercises.map((se) => ({
      ...se,
      sets: se.sets.map(({ loadConfirmed: _dropped, ...set }) => set),
    })),
  };
}

/**
 * The client's "last time" per exercise as history the logger can show (the "Last time" column and
 * the note). Only the last exposure is known — the screen turns live PR badges off for this reason.
 */
export function priorFromLastTime(workout: NextWorkoutDto | null): SessionSummaryDto[] {
  if (!workout) return [];
  const byDate = new Map<string, SessionSummaryDto>();
  for (const ex of workout.exercises) {
    const last = ex.lastTime;
    if (!last || last.sets.length === 0) continue;
    let summary = byDate.get(last.localDate);
    if (!summary) {
      summary = {
        id: `last-${last.localDate}`,
        name: workout.dayName,
        routineDayId: workout.dayId,
        status: 'COMPLETED',
        localDate: last.localDate,
        startedAt: `${last.localDate}T12:00:00.000Z`,
        finishedAt: `${last.localDate}T13:00:00.000Z`,
        isDeload: false,
        exercises: [],
      };
      byDate.set(last.localDate, summary);
    }
    summary.exercises.push({
      exerciseId: ex.exerciseId,
      skipped: false,
      lastSetRir: last.lastSetRir,
      sets: last.sets.map((s) => ({
        weightKg: s.weightKg,
        reps: s.reps,
        isWarmup: false,
        completed: true,
      })),
    });
  }
  return [...byDate.values()].sort((a, b) => b.localDate.localeCompare(a.localDate));
}

function fallbackProfile(unit: GymProfileDto['unit']): GymProfileDto {
  return {
    ...FALLBACK_EQUIPMENT,
    unit,
    experience: 'BEGINNER',
    equipmentAccess: 'FULL_GYM',
    weeklyGoal: 3,
    reminderEnabled: false,
    reminderTime: null,
    setupCompletedAt: null,
    reminderTimes: {},
    quietNudgeDays: null,
  };
}

export interface CoachedBootstrapInput {
  client: CoachStartDto['client'];
  workout: NextWorkoutDto | null;
  exercises: ExerciseDto[];
}

/**
 * What the logger reads for a coached workout:
 * - the CLIENT's unit; the trainer's own equipment (plates, steps — it is the gym they train in);
 * - the client's exercise meta first, then the shared catalogue from the trainer's library (never the
 *   trainer's custom exercises: the client can't log those);
 * - the client's prescription as `nextWorkout` (its supersets), their last exposures as history;
 * - no routine (nothing in the logger may change the client's routine) and no trainer progressions.
 */
export function coachedBootstrap(
  input: CoachedBootstrapInput,
  owner: GymBootstrap | undefined,
): GymBootstrap {
  const ids = new Set(input.exercises.map((e) => e.id));
  const shared = (owner?.library ?? []).filter(
    (e) => e.ownerId === null && !e.archived && !ids.has(e.id),
  );
  return {
    profile: owner?.profile
      ? { ...owner.profile, unit: input.client.unit }
      : fallbackProfile(input.client.unit),
    activeRoutine: null,
    nextWorkout: input.workout,
    library: [...input.exercises, ...shared],
    libraryCursor: '',
    progressions: [],
    recentSessions: priorFromLastTime(input.workout),
    weeks: [],
    streak: { current: 0, best: 0, flexTokens: 0, thisWeekSessions: 0, thisWeekGoal: 0 },
    offers: [],
    activePause: null,
    carryOver: [],
    coaching: null,
    bodyweightKg: null,
    serverTime: owner?.serverTime ?? new Date(0).toISOString(),
    engineVersion: owner?.engineVersion ?? ENGINE_VERSION,
  };
}

/** "Maria" — headers and the mini bar use the first name. */
export function coachedName(client: { name: string }): string {
  return firstNameOf(client.name);
}

/** The mini bar / header line for a booking's coached workouts: "Coaching Maria", "Coaching Maria + 1". */
export function coachingLabel(names: readonly string[]): string {
  const [first, ...others] = names;
  return BOOKING_COPY.coach.miniBar(BOOKING_COPY.schedule.groupName(first ?? '', others.length));
}
