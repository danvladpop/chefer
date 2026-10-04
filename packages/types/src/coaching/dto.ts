// ─── Trainer coaching: API outputs (spec §7) ──────────────────────────────────
// All dates are ISO strings (date-times) or device-local `YYYY-MM-DD` strings,
// never Date, so responses survive JSON and a persisted cache unchanged.
//
// What a trainer can never receive (asserted on the JSON in tests): food, body
// weight or measurements, nutrition targets, session or exercise notes, heart
// rate, calorie estimates, pause reasons, age or profile, the client's own
// routine-exercise `notes`, in-progress or discarded sessions.

import type { ExerciseMeta, LastEditedByOtherDto, Suggestion, WeekStatus } from '../gym';

// ─── Availability ─────────────────────────────────────────────────────────────

/**
 * `coaching.availability` (never gated, like `friends.availability`): whether any
 * coaching entry point may render for this user. `enabled` = the `coaching` flag
 * is on or the user is on COACHING_ALLOWLIST; `canBeTrainer` = enabled AND the
 * user may turn trainer tools on (TRAINER_ALLOWLIST).
 */
export interface CoachingAvailabilityDto {
  enabled: boolean;
  canBeTrainer: boolean;
}

// ─── Trainer profile and invites ──────────────────────────────────────────────

export interface TrainerStatusDto {
  /** The coaching flag is on for this user AND they may turn trainer tools on (allowlist). */
  canActivate: boolean;
  /** An active TrainerProfile exists. */
  active: boolean;
  displayName: string | null;
}

export type InviteState = 'OPEN' | 'USED' | 'EXPIRED' | 'REVOKED';

export interface InviteDto {
  code: string;
  /** `APP_URL/coaching/join/<code>`: what the trainer shares. */
  url: string;
  /** Trainer-private ("Maria, Tue/Thu"). */
  label: string | null;
  createdAt: string;
  expiresAt: string;
  state: InviteState;
}

// ─── Client list ──────────────────────────────────────────────────────────────

export interface ClientRowDto {
  clientId: string;
  /** The client's display name (first and last name, else account name). */
  name: string;
  /** ISO date-time the link started. */
  since: string;
  /** The label from the invite the client joined with (trainer-private). */
  label: string | null;
  /** Device-local date of the last completed workout, or null. */
  lastWorkoutDate: string | null;
  /** This week's completed sessions against the client's weekly goal. */
  week: { sessions: number; goal: number };
  /** Whole days since the last completed workout (since joining when there is none); the UI flags >= COACHING_LIMITS.inactiveDays. */
  inactiveDays: number;
  /** ISO date-time the CLIENT last saved the routine, when that is after the link started and after the trainer's last save; else null. */
  routineChangedByClientAt: string | null;
}

// ─── Workouts and adherence ───────────────────────────────────────────────────

export interface CoachedSetDto {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  completed: boolean;
  durationSec?: number;
  distanceM?: number;
  intensityRpe?: number;
  resistanceLevel?: number;
  inclinePct?: number;
}

export interface CoachedExerciseDto {
  exerciseId: string;
  name: string;
  skipped: boolean;
  /** Reps in reserve on the last set (0–3, 3 = "3+"), or null. */
  lastSetRir: number | null;
  sets: CoachedSetDto[];
}

export interface CoachedWorkoutDto {
  id: string;
  name: string;
  /** Device-local date the workout was done. */
  localDate: string;
  startedAt: string;
  finishedAt: string | null;
  durationMin: number | null;
  isDeload: boolean;
  exercises: CoachedExerciseDto[];
}

export interface CoachedWorkoutsPageDto {
  items: CoachedWorkoutDto[];
  nextCursor: string | null;
}

export interface ExerciseHistoryEntryDto {
  localDate: string;
  sets: CoachedSetDto[];
  lastSetRir: number | null;
}

export interface ExerciseHistoryDto {
  exerciseId: string;
  name: string;
  /** Last COACHING_LIMITS.historyExposures exposures, newest first. */
  entries: ExerciseHistoryEntryDto[];
}

export interface AdherenceWeekDto {
  /** Monday `YYYY-MM-DD`. */
  weekStart: string;
  goal: number;
  sessions: number;
  status: WeekStatus;
}

export interface AdherenceDayDto {
  localDate: string;
  /** The routine has a day planned on this weekday. */
  planned: boolean;
  trained: boolean;
  /** Inside a training pause. Dates only: the reason is never shared. */
  paused: boolean;
}

export interface AdherenceDto {
  /** Last COACHING_LIMITS.adherenceWeeks weeks, oldest first, the last one is the current week. */
  weeks: AdherenceWeekDto[];
  /** Last COACHING_LIMITS.adherenceDays days ending today, oldest first. */
  days: AdherenceDayDto[];
}

export interface ClientOverviewDto {
  client: { name: string; since: string };
  adherence: AdherenceDto;
  /** The last 5 completed workouts, newest first. */
  recent: CoachedWorkoutDto[];
}

// ─── The client's routine, as the trainer edits it ────────────────────────────

export interface NextTargetDto {
  /** The rep bucket key to send back to `setNextTarget` / `clearNextTarget` ("6-8"). */
  repBucket: string;
  /** What the app prescribes for the next time (override applied when there is one). */
  suggestion: Suggestion;
  /** The pending next-session target, or null. */
  override: {
    weightKg: number;
    reps: number[];
    at: string;
    setBy: 'TRAINER' | 'CLIENT';
  } | null;
  /** Device-local date this exercise was last logged, or null (a consumed target reads "Last done 3 Oct"). */
  lastDoneDate: string | null;
}

export interface TrainerRoutineExerciseDto {
  id: string;
  exerciseId: string;
  position: number;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  supersetGroup: string | null;
  trainerNote: string | null;
  /** Present when the CLIENT changed this row after the link started. */
  lastEditedByOther: LastEditedByOtherDto | null;
  /** Strength rows only (cardio and timed holds have no next-time weight): the next-session panel's data. */
  next: NextTargetDto | null;
}

export interface TrainerRoutineDayDto {
  id: string;
  position: number;
  name: string;
  plannedWeekday: number | null;
  exercises: TrainerRoutineExerciseDto[];
}

/** An exercise used by the routine, so the editor can name a custom exercise of the client's that is not in the trainer's library. */
export interface TrainerRoutineExerciseRefDto extends ExerciseMeta {
  /** Owned by the client (not in the curated library): it can stay, but cannot be added again. */
  isCustom: boolean;
}

export interface TrainerRoutineDto {
  id: string;
  name: string;
  templateKey: string | null;
  version: number;
  /** The day that comes next in the client's rotation. */
  nextDayId: string | null;
  updatedAt: string;
  /** Present when the CLIENT saved the routine after the link started. */
  lastEditedByOther: LastEditedByOtherDto | null;
  days: TrainerRoutineDayDto[];
  exercises: TrainerRoutineExerciseRefDto[];
}

export interface TrainerNoteDto {
  body: string;
  updatedAt: string;
}

// ─── Client side ──────────────────────────────────────────────────────────────

export type InvitePreviewState =
  | 'OK'
  | 'EXPIRED'
  | 'USED'
  | 'REVOKED'
  /** The invite is your own. */
  | 'SELF'
  /** You are already coached by this trainer. */
  | 'ALREADY_YOURS'
  /** The code does not exist (indistinguishable from a trainer who turned tools off). */
  | 'NOT_FOUND';

export interface InvitePreviewDto {
  state: InvitePreviewState;
  /** The trainer's display name; null unless `state` is OK or ALREADY_YOURS. */
  trainerName: string | null;
  /** The trainer the client has now, so the consent screen can say "You'll stop being coached by Ion". */
  currentTrainerName: string | null;
  /** The client has not finished gym setup: it must run first (the engine needs the equipment). */
  needsGymSetup: boolean;
}

export interface CoachingStatusDto {
  trainer: { name: string; since: string } | null;
  /**
   * The trainer ended the link (removed the client or turned trainer tools off)
   * in the last COACHING_LIMITS.stoppedNoticeDays days and the client has no
   * trainer now: "Ana stopped coaching you".
   */
  stopped: { trainerName: string; at: string } | null;
}
