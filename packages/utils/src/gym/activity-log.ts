// ─── Activity quick-log (WP-20, owner decision 2026-10-04) ─────────────────────
// "Log an activity": a class or session done elsewhere ("45 min cycling class,
// 400 kcal"), recorded as a finished WorkoutSession with ONE DURATION entry —
// the existing gym model, synced through the same offline outbox and
// `gym.session.upsertMany` as any finished workout. No new procedure.
//
// RECORD ONLY. The kcal is stored on the set (`caloriesKcal`) and shown back to
// the user, nothing else. It never raises a food target ("no eating back"),
// never feeds the planner or a rebalance — and an activity log is not a
// "training day" for the nutrition bump either (`isActivityLogSession` is how
// the API and the clients tell it apart). Shared by mobile and web.

import {
  ACTIVITY_LOG_EXERCISE_IDS,
  ACTIVITY_MAX_DURATION_MIN,
  ACTIVITY_MAX_KCAL,
  ACTIVITY_NAME_MAX_LENGTH,
  ACTIVITY_PRESET_BY_KEY,
  type ActivityPreset,
  type SessionExerciseDoc,
  type SessionSetDoc,
  type WorkoutSessionDoc,
} from '@chefer/types';
import { formatDurationMinutes } from './cardio';
import { ENGINE_VERSION } from './progression';
import { retimeSession } from './session-edit';
import { addDaysLocal, weekStartOf } from './weeks';

export interface ActivityLogInput {
  /** `ActivityPreset.key` — which chip. */
  presetKey: string;
  /** The user's own name; used by `other` (required there), ignored by the named chips. */
  customName?: string;
  /** The day it happened, YYYY-MM-DD. */
  localDate: string;
  durationMin: number;
  /** "From your watch or the machine" — optional. */
  caloriesKcal?: number;
  /** Effort 1–10 — optional. */
  effort?: number;
}

export type ActivityLogField = 'activity' | 'name' | 'date' | 'duration' | 'calories' | 'effort';

export type ActivityLogErrors = Partial<Record<ActivityLogField, string>>;

/** The earliest day the sheet offers: Monday of last week (same reach as "log a past workout"). */
export function activityMinDate(today: string): string {
  return weekStartOf(addDaysLocal(today, -7));
}

/** The preset for a key, or null (an unknown key can only come from a stale draft). */
export function activityPreset(presetKey: string): ActivityPreset | null {
  return ACTIVITY_PRESET_BY_KEY.get(presetKey) ?? null;
}

/** The name the session carries: the chip's, or — for Other — what the user typed. */
export function activitySessionName(
  input: Pick<ActivityLogInput, 'presetKey' | 'customName'>,
): string {
  const preset = activityPreset(input.presetKey);
  const typed = (input.customName ?? '').trim();
  if (preset?.key === 'other') return typed.length > 0 ? typed : preset.sessionName;
  return preset?.sessionName ?? (typed || 'Activity');
}

/**
 * Plain-language problems with a sheet's values, keyed by field — empty when
 * the log can be saved. Copy is user-facing (never a raw Zod message).
 */
export function validateActivityLog(
  input: Partial<ActivityLogInput> & { today: string },
): ActivityLogErrors {
  const errors: ActivityLogErrors = {};
  const preset = input.presetKey ? activityPreset(input.presetKey) : null;
  if (!preset) errors.activity = 'Pick what you did.';
  if (preset?.key === 'other') {
    const name = (input.customName ?? '').trim();
    if (name.length === 0) errors.name = 'Name the activity.';
    else if (name.length > ACTIVITY_NAME_MAX_LENGTH) {
      errors.name = `Keep the name under ${ACTIVITY_NAME_MAX_LENGTH} characters.`;
    }
  }
  const date = input.localDate;
  if (!date || date > input.today) errors.date = 'Pick today or an earlier day.';
  else if (date < activityMinDate(input.today)) errors.date = 'That day is too far back to log.';
  const minutes = input.durationMin;
  if (minutes === undefined || !Number.isFinite(minutes) || minutes < 1) {
    errors.duration = 'Enter how many minutes it lasted.';
  } else if (minutes > ACTIVITY_MAX_DURATION_MIN) {
    errors.duration = `Up to ${ACTIVITY_MAX_DURATION_MIN} minutes (3 hours) per activity.`;
  }
  const kcal = input.caloriesKcal;
  if (kcal !== undefined && (!Number.isFinite(kcal) || kcal < 0 || kcal > ACTIVITY_MAX_KCAL)) {
    errors.calories = `Enter calories between 0 and ${ACTIVITY_MAX_KCAL}, or leave it blank.`;
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
export function buildActivityLogDoc(args: {
  input: ActivityLogInput;
  /** Session id (client UUID). */
  id: string;
  newId: () => string;
  /** Device-local instant the activity starts at on its day (e.g. 18:00). */
  startAt: string;
  now: string;
}): WorkoutSessionDoc {
  const { input, id, newId, startAt, now } = args;
  const preset = activityPreset(input.presetKey);
  const exerciseId = preset?.exerciseId ?? 'other-activity';
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
    name: activitySessionName(input),
    status: 'COMPLETED',
    startedAt: startAt,
    finishedAt: startAt,
    localDate: input.localDate,
    isDeload: false,
    notes: null,
    clientUpdatedAt: now,
    engineVersion: ENGINE_VERSION,
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
 * True for a finished/any session that is a quick-logged activity: no routine
 * day, and every exercise is one of the activity presets' entries. Works on a
 * `SessionSummaryDto`, a `WorkoutSessionDoc` or a database row.
 */
export function isActivityLogSession(session: {
  routineDayId: string | null;
  exercises: readonly { exerciseId: string }[];
}): boolean {
  return (
    session.routineDayId === null &&
    session.exercises.length > 0 &&
    session.exercises.every((e) => ACTIVITY_LOG_EXERCISE_IDS.has(e.exerciseId))
  );
}

/** What the activity recorded, read back from any session shape: minutes and kcal. */
export function activityFacts(session: {
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
 * "Cycling class · 45 min · ~400 kcal (from your watch)" — the detail line of an
 * activity. The kcal part is only there when it was entered; it is the user's
 * number, never ours, hence "~" and the source.
 */
export function activitySummaryLine(
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
