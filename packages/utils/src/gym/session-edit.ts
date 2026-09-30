// ─── Correcting a past session (pure) — T-44.2/T-44.4, Δ2.3 ──────────────────
// Edit/delete go through the existing outbox as a plain upsert (an edited doc
// with a bumped clientUpdatedAt, or the same doc re-sent with
// status: 'DISCARDED') — no new API surface (Δ2.3). This module only holds
// the client-side pure logic: the delete confirm's before/after preview
// (built on weeks.ts's settleWeeks, the same fold the server and the offline
// optimistic-apply already use) and the "Next time changed after your edit"
// diff (PAT-14).
import type {
  GymBootstrap,
  ProgressionDto,
  SessionSummaryDto,
  StreakInfo,
  Suggestion,
  WeekSummary,
  WorkoutSessionDoc,
  WorkoutStatus,
} from '@chefer/types';
import { progressionKey } from './progression';
import { toSessionSummary } from './session';
import { settleWeeks, weekStartOf, type WeekRow } from './weeks';

// ─── Re-settling cached weeks after a correction ─────────────────────────────

/**
 * Re-settle `weeks` with per-week session-count deltas (`weekStart → ±n`) —
 * the same fold the server runs, so the delete confirm, the offline
 * optimistic apply and the server agree. A week the cache doesn't hold is
 * ignored (older than the setup week).
 */
function resettle(
  weeks: readonly WeekSummary[],
  deltas: ReadonlyMap<string, number>,
  today: string,
): { weeks: WeekSummary[]; streak: StreakInfo } {
  const rows: WeekRow[] = weeks.map((w) => ({
    weekStart: w.weekStart,
    goal: w.goal,
    sessions: Math.max(0, w.sessions + (deltas.get(w.weekStart) ?? 0)),
    // The original status already reflects whether the week overlapped a
    // pause; settleWeeks only needs that boolean to re-settle it the same way.
    paused: w.status === 'paused',
  }));
  return settleWeeks(rows, weekStartOf(today));
}

// ─── Delete preview (T-44.2, UX-44 AC4) ───────────────────────────────────────

export interface SessionDeletePreviewInput {
  /** `bootstrap.weeks`/`.streak` as they stand right now (the session still counted). */
  weeks: readonly WeekSummary[];
  streak: StreakInfo;
  sessionLocalDate: string;
  sessionStatus: WorkoutStatus;
  /** Completed, non-skipped working sets — the confirm's "{n} sets" line. */
  setsCount: number;
  today: string;
}

export interface SessionDeletePreview {
  setsCount: number;
  /** Show the "this week" line only when it actually moves. */
  weekChanged: boolean;
  thisWeekBefore: number;
  thisWeekAfter: number;
  /** Show the streak line only when it actually moves. */
  streakChanged: boolean;
  streakBefore: number;
  streakAfter: number;
}

/**
 * What deleting this session changes — a paused or already-under week that
 * doesn't move stays unreported (the ConfirmSheet only names lines that
 * change). An IN_PROGRESS/DISCARDED doc was never counted, so deleting it
 * changes nothing here (D-21 a: any past session can be edited/deleted, but
 * only a COMPLETED one touches weeks/streak).
 */
export function sessionDeletePreview(input: SessionDeletePreviewInput): SessionDeletePreview {
  const base: SessionDeletePreview = {
    setsCount: input.setsCount,
    weekChanged: false,
    thisWeekBefore: input.streak.thisWeekSessions,
    thisWeekAfter: input.streak.thisWeekSessions,
    streakChanged: false,
    streakBefore: input.streak.current,
    streakAfter: input.streak.current,
  };
  if (input.sessionStatus !== 'COMPLETED') return base;

  const currentWeek = weekStartOf(input.today);
  const targetWeek = weekStartOf(input.sessionLocalDate);
  const after = resettle(input.weeks, new Map([[targetWeek, -1]]), input.today);
  const thisWeekAfter =
    after.weeks.find((w) => w.weekStart === currentWeek)?.sessions ?? base.thisWeekAfter;

  return {
    ...base,
    weekChanged: thisWeekAfter !== base.thisWeekBefore,
    thisWeekAfter,
    streakChanged: after.streak.current !== base.streakBefore,
    streakAfter: after.streak.current,
  };
}

// ─── Target-change notice (T-44.4, PAT-14) ────────────────────────────────────

export interface ProgressionTargetSnapshot {
  exerciseId: string;
  repBucket: string;
  suggestion: Suggestion;
}

export interface TargetDiffRow {
  exerciseId: string;
  repBucket: string;
  before: Suggestion;
  after: Suggestion;
}

function suggestionChanged(a: Suggestion, b: Suggestion): boolean {
  return (
    a.weightKg !== b.weightKg ||
    a.sets !== b.sets ||
    a.reps.length !== b.reps.length ||
    a.reps.some((r, i) => r !== b.reps[i])
  );
}

/**
 * Rows whose next-time prescription changed between two progression
 * snapshots — taken before enqueueing the edit and after the next bootstrap
 * refetch (Δ2.3). A bucket present only in one snapshot (e.g. removed from
 * the workout, or brand new) is skipped: there's nothing to compare "before"
 * and "after" for.
 */
export function targetDiff(
  before: readonly ProgressionTargetSnapshot[],
  after: readonly ProgressionTargetSnapshot[],
): TargetDiffRow[] {
  const afterByKey = new Map(
    after.map((a) => [progressionKey(a.exerciseId, a.repBucket), a] as const),
  );
  const rows: TargetDiffRow[] = [];
  for (const b of before) {
    const a = afterByKey.get(progressionKey(b.exerciseId, b.repBucket));
    if (!a) continue;
    if (suggestionChanged(b.suggestion, a.suggestion)) {
      rows.push({
        exerciseId: b.exerciseId,
        repBucket: b.repBucket,
        before: b.suggestion,
        after: a.suggestion,
      });
    }
  }
  return rows;
}

/** Snapshot of `bootstrap.progressions[].suggestion` for the exercises a correction touches. */
export function snapshotTargets(
  progressions: readonly ProgressionDto[],
  exerciseIds: readonly string[],
): ProgressionTargetSnapshot[] {
  const wanted = new Set(exerciseIds);
  return progressions
    .filter((p) => wanted.has(p.exerciseId))
    .map((p) => ({
      exerciseId: p.exerciseId,
      repBucket: p.repBucket,
      suggestion: p.suggestion,
    }));
}

// ─── Optimistic local apply (Δ2.3) ────────────────────────────────────────────
// The device shows the correction immediately; the server recomputes progression
// once the outbox acks. Only the pieces the UI needs offline are updated here
// (the lists, this week's count and the streak) — targets wait for the sync.

function newestFirst(a: SessionSummaryDto, b: SessionSummaryDto): number {
  return b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id);
}

/** The bootstrap with one session gone (Delete): lists, week counts and streak. */
export function applySessionDeleted(
  bootstrap: GymBootstrap,
  sessionId: string,
  today: string,
): GymBootstrap {
  const session = bootstrap.recentSessions.find((s) => s.id === sessionId);
  if (!session) return bootstrap;
  const recentSessions = bootstrap.recentSessions.filter((s) => s.id !== sessionId);
  if (session.status !== 'COMPLETED') return { ...bootstrap, recentSessions };
  const { weeks, streak } = resettle(
    bootstrap.weeks,
    new Map([[weekStartOf(session.localDate), -1]]),
    today,
  );
  return { ...bootstrap, recentSessions, weeks, streak };
}

/**
 * The bootstrap with one COMPLETED session's edited doc folded in (Save):
 * its summary replaced, and — when the date moved to another week — the week
 * counts and streak re-settled. A session not in the cached window is left
 * alone (the sync refetch brings it).
 */
export function applySessionEdited(
  bootstrap: GymBootstrap,
  doc: WorkoutSessionDoc,
  today: string,
): GymBootstrap {
  const previous = bootstrap.recentSessions.find((s) => s.id === doc.id);
  if (!previous || doc.status !== 'COMPLETED') return bootstrap;
  const recentSessions = [
    toSessionSummary(doc),
    ...bootstrap.recentSessions.filter((s) => s.id !== doc.id),
  ].sort(newestFirst);
  const from = weekStartOf(previous.localDate);
  const to = weekStartOf(doc.localDate);
  if (from === to || previous.status !== 'COMPLETED') return { ...bootstrap, recentSessions };
  const { weeks, streak } = resettle(
    bootstrap.weeks,
    new Map([
      [from, -1],
      [to, 1],
    ]),
    today,
  );
  return { ...bootstrap, recentSessions, weeks, streak };
}

/**
 * Re-applies corrections still waiting in the outbox (an edited COMPLETED doc,
 * a DISCARDED tombstone) over a server bootstrap fetched before they synced —
 * otherwise a refetch during the Undo window, or offline before the upload,
 * would bring the old version back. Docs for sessions the bootstrap doesn't
 * list are ignored (new finishes are folded by `applyFinishedSession`).
 */
export function applyPendingCorrections(
  bootstrap: GymBootstrap,
  pending: readonly WorkoutSessionDoc[],
  today: string,
): GymBootstrap {
  let current = bootstrap;
  for (const doc of pending) {
    if (!current.recentSessions.some((s) => s.id === doc.id)) continue;
    if (doc.status === 'DISCARDED') current = applySessionDeleted(current, doc.id, today);
    else if (doc.status === 'COMPLETED') current = applySessionEdited(current, doc, today);
  }
  return current;
}

// ─── Building the corrected doc ───────────────────────────────────────────────

/**
 * The tombstone a Delete sends: same id, `DISCARDED`, no children (the server
 * replaces children and recomputes from what it stored before). Built from the
 * cached summary so a delete works offline even without the full doc.
 */
export function discardedTombstone(
  session: Pick<
    SessionSummaryDto,
    'id' | 'name' | 'routineDayId' | 'localDate' | 'startedAt' | 'finishedAt' | 'isDeload'
  >,
  input: { engineVersion: number; at: string },
): WorkoutSessionDoc {
  // clientUpdatedAt must beat whatever the server holds (last-write-wins): never
  // earlier than the session's own end, even on a clock that is behind.
  const floor = Date.parse(session.finishedAt ?? session.startedAt) + 1;
  const at = Date.parse(input.at) >= floor ? input.at : new Date(floor).toISOString();
  return {
    schemaVersion: 1,
    id: session.id,
    routineId: null,
    routineDayId: session.routineDayId,
    name: session.name,
    status: 'DISCARDED',
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    localDate: session.localDate,
    isDeload: session.isDeload,
    notes: null,
    clientUpdatedAt: at,
    engineVersion: input.engineVersion,
    exercises: [],
  };
}

/** Never earlier than the doc it replaces: the edit must win last-write-wins. */
export function bumpClientUpdatedAt(previous: string, now: string): string {
  return Date.parse(now) > Date.parse(previous)
    ? now
    : new Date(Date.parse(previous) + 1).toISOString();
}

/**
 * Edit mode's Replace exercise (UX-44, AC5): the logged sets' numbers move to
 * the new exercise and the slot keeps its place — it changes this workout
 * only, never the routine (the routine link stays as it was).
 */
export function replaceExerciseKeepingSets(
  doc: WorkoutSessionDoc,
  seId: string,
  exerciseId: string,
  at: string,
): WorkoutSessionDoc {
  if (!doc.exercises.some((se) => se.id === seId)) return doc;
  return {
    ...doc,
    clientUpdatedAt: at,
    exercises: doc.exercises.map((se) =>
      se.id === seId ? { ...se, exerciseId, swappedFromId: se.swappedFromId ?? se.exerciseId } : se,
    ),
  };
}

/**
 * Move a session to another day/time (edit mode's `Change ›`). Never into the
 * future (AC6): a `startedAt` after `now` is clamped to `now`, and the local
 * date follows it. The duration is kept (the end moves with the start), but
 * never past `now`.
 */
export function rescheduleSession(
  doc: WorkoutSessionDoc,
  input: { localDate: string; startedAt: string; now: string; at: string },
): WorkoutSessionDoc {
  const nowMs = Date.parse(input.now);
  const startMs = Math.min(Date.parse(input.startedAt), nowMs);
  const durationMs = doc.finishedAt
    ? Math.max(0, Date.parse(doc.finishedAt) - Date.parse(doc.startedAt))
    : 0;
  const finishedAt = doc.finishedAt
    ? new Date(Math.min(startMs + durationMs, nowMs)).toISOString()
    : null;
  return {
    ...doc,
    localDate: input.localDate,
    startedAt: new Date(startMs).toISOString(),
    finishedAt,
    clientUpdatedAt: input.at,
  };
}

/** Minutes between start and finish (0 for an unfinished session). */
export function sessionDurationMin(
  doc: Pick<WorkoutSessionDoc, 'startedAt' | 'finishedAt'>,
): number {
  if (!doc.finishedAt) return 0;
  return Math.max(0, Math.round((Date.parse(doc.finishedAt) - Date.parse(doc.startedAt)) / 60_000));
}

/**
 * Set a session's day and length (the `When` fields of edit and log mode —
 * owner dogfood 2026-09-30: a date and a duration, no clock time). The caller
 * picks the start on that day (`startedAt`, e.g. the session's original time
 * of day, or 18:00 for a new log); if the session would then end after `now`
 * it is pulled back to end at `now` — never in the future (AC6).
 */
export function retimeSession(
  doc: WorkoutSessionDoc,
  input: { localDate: string; startedAt: string; durationMin: number; now: string; at: string },
): WorkoutSessionDoc {
  const nowMs = Date.parse(input.now);
  const durationMs = Math.max(0, Math.round(input.durationMin)) * 60_000;
  const startMs = Math.min(Date.parse(input.startedAt), nowMs - durationMs);
  return {
    ...doc,
    localDate: input.localDate,
    startedAt: new Date(startMs).toISOString(),
    finishedAt: new Date(startMs + durationMs).toISOString(),
    clientUpdatedAt: input.at,
  };
}

/**
 * Log mode's Save (owner dogfood 2026-09-30, "log a workout you already
 * did"): every set still listed IS a set the user did, so each open working
 * or warm-up set of a non-skipped exercise is completed at its current
 * numbers, stamped at the session's end, and the session is COMPLETED. Cardio
 * sets are left alone — they only count once their own `Log it` filled them.
 * The doc must already carry its `finishedAt` (see `retimeSession`).
 */
export function completeLoggedSession(
  doc: WorkoutSessionDoc,
  input: { isCardio: (exerciseId: string) => boolean; at: string },
): WorkoutSessionDoc {
  const finishedAt = doc.finishedAt ?? input.at;
  const { carryOverExerciseIds: _none, ...rest } = doc;
  return {
    ...rest,
    status: 'COMPLETED',
    finishedAt,
    clientUpdatedAt: input.at,
    exercises: doc.exercises.map((se) =>
      se.skipped || input.isCardio(se.exerciseId)
        ? se
        : {
            ...se,
            sets: se.sets.map((set) =>
              set.completedAt === null ? { ...set, completedAt: finishedAt } : set,
            ),
          },
    ),
  };
}

/** Log mode: can this be saved — at least one set (or logged cardio) left? */
export function hasLoggableSet(
  doc: WorkoutSessionDoc,
  isCardio: (exerciseId: string) => boolean,
): boolean {
  return doc.exercises.some(
    (se) =>
      !se.skipped &&
      (isCardio(se.exerciseId)
        ? se.sets.some((s) => s.completedAt !== null)
        : se.sets.some((s) => !s.isWarmup)),
  );
}

// ─── Edit-mode bookkeeping ────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const bKeys = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** Did the draft change anything the user can see? (`clientUpdatedAt` doesn't count.) */
export function hasEdits(original: WorkoutSessionDoc, draft: WorkoutSessionDoc): boolean {
  return !deepEqual({ ...original, clientUpdatedAt: '' }, { ...draft, clientUpdatedAt: '' });
}

/** No set of any non-skipped exercise is ticked — Save asks to delete instead. */
export function nothingTicked(doc: WorkoutSessionDoc): boolean {
  return !doc.exercises.some((se) => !se.skipped && se.sets.some((s) => s.completedAt !== null));
}

/** Exercises whose progression a correction can move: the old and the new version's. */
export function touchedExerciseIds(
  original: WorkoutSessionDoc,
  draft: WorkoutSessionDoc | null,
): string[] {
  const ids = new Set(original.exercises.map((se) => se.exerciseId));
  for (const se of draft?.exercises ?? []) ids.add(se.exerciseId);
  return [...ids];
}

export interface EditSummary {
  setsChanged: number;
  exercisesReplaced: number;
  exercisesRemoved: number;
  dateChanged: boolean;
}

/** Counts and booleans only — the `session_edited` analytics event. */
export function editSummary(original: WorkoutSessionDoc, draft: WorkoutSessionDoc): EditSummary {
  const originalSe = new Map(original.exercises.map((se) => [se.id, se]));
  const draftIds = new Set(draft.exercises.map((se) => se.id));
  let setsChanged = 0;
  let exercisesReplaced = 0;
  for (const se of draft.exercises) {
    const before = originalSe.get(se.id);
    if (!before) {
      setsChanged += se.sets.length;
      continue;
    }
    if (before.exerciseId !== se.exerciseId) exercisesReplaced += 1;
    const beforeSets = new Map(before.sets.map((s) => [s.id, s]));
    for (const set of se.sets) {
      const old = beforeSets.get(set.id);
      if (!old || !deepEqual(old, set)) setsChanged += 1;
    }
    for (const old of before.sets) {
      if (!se.sets.some((s) => s.id === old.id)) setsChanged += 1;
    }
  }
  return {
    setsChanged,
    exercisesReplaced,
    exercisesRemoved: original.exercises.filter((se) => !draftIds.has(se.id)).length,
    dateChanged: original.localDate !== draft.localDate || original.startedAt !== draft.startedAt,
  };
}
