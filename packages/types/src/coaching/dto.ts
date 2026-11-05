// ─── Trainer coaching: API outputs (spec §7) ──────────────────────────────────
// All dates are ISO strings (date-times) or device-local `YYYY-MM-DD` strings,
// never Date, so responses survive JSON and a persisted cache unchanged.
//
// What a trainer can never receive (asserted on the JSON in tests): food, body
// weight or measurements, nutrition targets, session or exercise notes, heart
// rate, calorie estimates, pause reasons, age or profile, the client's own
// routine-exercise `notes`, in-progress or discarded sessions.

import type {
  ExerciseMeta,
  LastEditedByOtherDto,
  Suggestion,
  WeekStatus,
  WorkoutType,
} from '../gym';
import type { ClientSharingDto, CoachingSharingDto } from './data-sharing';
import type { RoutineDayTemplateRefDto } from './templates';

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
  /** Additive (2026-10-17): the optional "Gym / city" line under the name. */
  gymLine?: string | null;
  /** Additive (2026-10-17): active clients now; "Turn off" names this number first. */
  activeClients?: number;
  /** Additive (2026-10-17): Following is on, so clients can find this trainer by name. */
  findable?: boolean;
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
  /**
   * Additive (2026-10-17, PRD §4.3): the client trains in "Keep it simple" (the
   * `simpleTraining` flag is on and their training style is SIMPLE). The
   * trainer sees a badge and can never change the style.
   */
  keepItSimple?: boolean;
  /** Additive (trainer mode M3): the client's next booking with this trainer, ISO start, or null. */
  nextBookingAt?: string | null;
  /** Additive (lane K1): what the client shares with this trainer besides training. */
  sharing?: ClientSharingDto;
  /**
   * Additive (lane K4): the last device-local date the client logged anything the trainer may know
   * about (a workout; a food log only while shared), whole days since it, and whether that is at
   * least the trainer's `quietAfterDays`. Older APIs send none: fall back to `inactiveDays` ≥ 7.
   */
  lastActivityDate?: string | null;
  quietDays?: number;
  quiet?: boolean;
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
  /**
   * Additive (2026-10-17, PRD §4.3): ticked "done" with the planned numbers never
   * edited (simple mode's progression guard). Show "Done as planned", never the
   * sets' weights as lifted numbers.
   */
  doneAsPlanned?: true;
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
  /**
   * Additive (2026-10-17): the workout type ("Yoga"), for a typed workout or a
   * logged one with no exercises: "Yoga · 45 min". Never calories (D-8).
   */
  workoutType?: WorkoutType | null;
  /** Additive (trainer mode M3): the trainer viewing it logged it for the client ("Logged by you"). */
  loggedByTrainer?: true;
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
  /** `keepItSimple` additive (2026-10-17): see ClientRowDto. */
  client: { name: string; since: string; keepItSimple?: boolean; sharing?: ClientSharingDto };
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
  /** Additive (2026-10-17): a My week day's workout type ("Tue · Yoga"); a type-only day has no exercises. */
  workoutType?: WorkoutType | null;
  /**
   * Additive (trainer mode M2): the day was copied from one of the trainer's
   * templates ("Based on Lower body A"); null or absent otherwise.
   */
  template?: RoutineDayTemplateRefDto | null;
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
  /** `sharing` additive (lane K1): the client's food / weight switches for this coaching. */
  trainer: { name: string; since: string; sharing?: CoachingSharingDto } | null;
  /** Additive (2026-10-17): the client's pending coaching request, if any. */
  request?: CoachingRequestDto | null;
  /**
   * The trainer ended the link (removed the client or turned trainer tools off)
   * in the last COACHING_LIMITS.stoppedNoticeDays days and the client has no
   * trainer now: "Ana stopped coaching you".
   */
  stopped: { trainerName: string; at: string } | null;
  /**
   * Additive (trainer mode M3, §10): the coaching consent gained lines since
   * this client agreed to it ("bookings and logged workouts"). A one-time
   * notice, not a gate: `coaching.acknowledgeConsentUpdate` records the new
   * copy version. Absent below TRAINER_MODE_API_LEVEL.
   */
  consentUpdate?: { trainerName: string; version: number } | null;
}

// ─── Find a trainer and coaching requests (PRD 2026-10 §4.1) ──────────────────

/** One result of Find a trainer: never an email, never a photo of the client side. */
export interface TrainerSummaryDto {
  trainerId: string;
  /** TrainerProfile.displayName ("Ana"). */
  name: string;
  /** "Gym / city", to tell apart six people called Ana. */
  gymLine: string | null;
  /** False at COACHING_LIMITS.maxActiveClients: the profile shows "Not taking new clients". */
  acceptingClients: boolean;
}

export type TrainerRelation =
  /** No coaching and no request to this trainer. */
  | 'NONE'
  /** This trainer coaches the viewer now. */
  | 'YOUR_TRAINER'
  /** The viewer's pending request is to this trainer. */
  | 'REQUESTED';

/** `coaching.trainerCard`: what the trainer profile screen needs before "Ask to coach me". */
export interface TrainerCardDto extends TrainerSummaryDto {
  relation: TrainerRelation;
  /** The viewer's current trainer when it is someone else: "This ends your coaching with Ana when Mihai accepts." */
  currentTrainerName: string | null;
  /** The viewer's pending request to ANOTHER trainer (one at a time): cancel it first. */
  pendingRequestTo: string | null;
  /** The viewer has not finished gym setup (simple mode counts): it must run first. */
  needsGymSetup: boolean;
}

/** The client's pending request (`coaching.status.request`). */
export interface CoachingRequestDto {
  id: string;
  trainer: { id: string; name: string };
  createdAt: string;
  expiresAt: string;
}

/** One pending request in the trainer's list. */
export interface TrainerRequestDto {
  id: string;
  client: { id: string; name: string };
  createdAt: string;
  expiresAt: string;
  /** The client has another trainer now: accepting ends that coaching. */
  hasTrainer: boolean;
}

// ─── Coaching notices (PRD 2026-10 §4.2, §4.3) ────────────────────────────────

/**
 * One change in a "<Trainer> updated your routine" card, in plain words:
 * "+ Romanian deadlift · Squat 3×8 → 4×6 · note on Bench press".
 * `exercise` is the exercise name at the time of the change.
 */
export type RoutineChange =
  | { kind: 'added'; exercise: string }
  | { kind: 'removed'; exercise: string }
  /** `from` / `to` are "3×8" or "3×8–10". */
  | { kind: 'changed'; exercise: string; from: string; to: string }
  | { kind: 'note'; exercise: string }
  /** Days added, removed, renamed or moved to another weekday. */
  | { kind: 'schedule' }
  /** The trainer set up a routine for a client who had none. */
  | { kind: 'created' };

export type CoachingNoticeKind =
  /** Trainer: a client asked to be coached. */
  | 'REQUEST_RECEIVED'
  /** Client: the trainer accepted the request. */
  | 'REQUEST_ACCEPTED'
  /** Client: the trainer declined the request. */
  | 'REQUEST_DECLINED'
  /** Either side: the other one changed the client's routine. */
  | 'ROUTINE_UPDATED'
  /** Either side: the coaching ended (the other side ended it, or the trainer stopped being a trainer). */
  | 'COACHING_ENDED'
  /** Client (level 8+): the trainer booked them (one notice per series). */
  | 'BOOKING_CREATED'
  /** Client (level 8+): a booking moved or changed. */
  | 'BOOKING_CHANGED'
  /** Client (level 8+): a booking was cancelled (with the reason, if any). */
  | 'BOOKING_CANCELLED'
  /** Client (level 8+): the trainer logged a workout for them. */
  | 'COACHED_WORKOUT_LOGGED';

export interface CoachingNoticeDto {
  id: string;
  kind: CoachingNoticeKind;
  /** ISO date-time of the (latest) event. */
  at: string;
  read: boolean;
  /**
   * The other person. `id` is null when their account is gone; `name` is then
   * FALLBACK_TRAINER_NAME. `role` is what they are to the viewer.
   */
  other: { id: string | null; name: string; role: 'TRAINER' | 'CLIENT' };
  /** ROUTINE_UPDATED only: every change since the viewer last dismissed the card, oldest first. */
  changes?: RoutineChange[];
  /** COACHING_ENDED only: who ended it. SYSTEM = trainer tools off, removed from the allowlist, or account deleted. */
  endedBy?: 'CLIENT' | 'TRAINER' | 'SYSTEM';
  /**
   * BOOKING_* only (level 8+): the booking's start (ISO) and zone, whether it
   * repeats weekly, and the cancel reason the trainer gave.
   */
  booking?: {
    bookingId: string;
    startsAt: string;
    timeZone: string;
    weekly: boolean;
    reason: string | null;
  };
  /** COACHED_WORKOUT_LOGGED only: the session to open. */
  workoutSessionId?: string;
}
