import type {
  ExerciseBest,
  ExerciseMeta,
  GymBootstrap,
  PrKind,
  SessionExerciseDoc,
  SessionSetDoc,
  SessionSummaryDto,
  Suggestion,
  WarmupSet,
  WorkoutSessionDoc,
} from '@chefer/types';
import {
  defaultTargetRir,
  detectPrs,
  equipmentProfileOf,
  initialState,
  prescribe,
  repBucket,
  sessionSupersets,
  supersetGroupLookup,
  warmupSets,
  workoutFocus,
  type ExerciseLookup,
  type LoadSlot,
  type SessionSupersetSlot,
  type WorkoutAction,
  type WorkoutFocus,
} from '@chefer/utils';

// Pure view-model helpers for the active workout page. All state changes go
// through the shared `workoutReducer`; these only read the doc or build the
// reducer actions the page dispatches (so they are unit-testable).

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Reducer actions minus `at` (stamped at dispatch) and minus finish/discard (own methods). */
export type WorkoutActionInput = DistributiveOmit<
  Exclude<WorkoutAction, { type: 'finish' } | { type: 'discard' }>,
  'at'
>;

export function sortedExercises(doc: WorkoutSessionDoc): SessionExerciseDoc[] {
  return [...doc.exercises].sort((a, b) => a.position - b.position);
}

export function sortedSets(se: SessionExerciseDoc): SessionSetDoc[] {
  return [...se.sets].sort((a, b) => a.position - b.position);
}

export function workingSets(se: SessionExerciseDoc): SessionSetDoc[] {
  return sortedSets(se).filter((s) => !s.isWarmup);
}

export function warmupSetsOf(se: SessionExerciseDoc): SessionSetDoc[] {
  return sortedSets(se).filter((s) => s.isWarmup);
}

/** Working sets ticked / planned, over exercises that are not skipped. */
export function sessionProgress(doc: WorkoutSessionDoc): { done: number; planned: number } {
  let done = 0;
  let planned = 0;
  for (const se of doc.exercises) {
    if (se.skipped) continue;
    for (const s of se.sets) {
      if (s.isWarmup) continue;
      planned += 1;
      if (s.completedAt !== null) done += 1;
    }
  }
  return { done, planned };
}

export function unfinishedSets(doc: WorkoutSessionDoc): number {
  const { done, planned } = sessionProgress(doc);
  return planned - done;
}

/** Every working set ticked (and there is at least one) — RIR chips show now. */
export function allWorkingSetsDone(se: SessionExerciseDoc): boolean {
  const sets = workingSets(se);
  return sets.length > 0 && sets.every((s) => s.completedAt !== null);
}

export function isExerciseDone(se: SessionExerciseDoc): boolean {
  return se.skipped || allWorkingSetsDone(se);
}

const NO_SUPERSETS: ReadonlyMap<string, SessionSupersetSlot> = new Map();

/**
 * The session's supersets, derived from the cached routine (the session doc
 * has no superset field): routine slots sharing a letter AND still adjacent.
 */
export function supersetsOf(
  doc: WorkoutSessionDoc,
  bootstrap: Pick<GymBootstrap, 'activeRoutine' | 'nextWorkout'> | undefined | null,
): Map<string, SessionSupersetSlot> {
  if (!bootstrap) return new Map();
  return sessionSupersets(doc.exercises, supersetGroupLookup(bootstrap));
}

/** The next working set to do — walked round by round inside a superset. */
export function currentFocus(
  doc: WorkoutSessionDoc,
  supersets: ReadonlyMap<string, SessionSupersetSlot> = NO_SUPERSETS,
): WorkoutFocus | null {
  return workoutFocus(doc, supersets);
}

/** The exercise to focus: the focus's exercise (else the last one). */
export function currentExerciseId(
  doc: WorkoutSessionDoc,
  supersets: ReadonlyMap<string, SessionSupersetSlot> = NO_SUPERSETS,
): string | null {
  const list = sortedExercises(doc);
  return currentFocus(doc, supersets)?.seId ?? list[list.length - 1]?.id ?? null;
}

/** "Set 2" / "Warm-up 1" — how a set is named in its card. */
export function setLabelOf(se: SessionExerciseDoc, setId: string): string | null {
  const warm = warmupSetsOf(se).findIndex((s) => s.id === setId);
  if (warm >= 0) return `Warm-up ${warm + 1}`;
  const work = workingSets(se).findIndex((s) => s.id === setId);
  return work >= 0 ? `Set ${work + 1}` : null;
}

/** The first set to tick in an exercise (warm-ups first, then working sets). */
export function nextSetId(se: SessionExerciseDoc): string | null {
  return sortedSets(se).find((s) => s.completedAt === null)?.id ?? null;
}

export function loadSlotOf(meta: ExerciseMeta): LoadSlot {
  return { exercise: meta, stepOverrideKg: null };
}

const PR_RANK: Record<PrKind, number> = { e1rm: 3, weight: 2, reps: 1 };

/**
 * Live PR badges: at most one per exercise — the ticked working set with the
 * highest-ranked record (first one wins a tie). `history` is the bootstrap's
 * recent sessions; the running session itself is never part of it.
 */
export function livePrs(
  doc: WorkoutSessionDoc,
  history: SessionSummaryDto[],
  /** Bootstrap `olderBests`: records older than `history` (audit F-GYM-6-1). */
  olderBests?: Record<string, ExerciseBest>,
): Map<string, { setId: string; kind: PrKind }> {
  const prior = history.filter((s) => s.id !== doc.id);
  const out = new Map<string, { setId: string; kind: PrKind }>();
  for (const se of doc.exercises) {
    if (se.skipped) continue;
    let best: { setId: string; kind: PrKind } | null = null;
    for (const s of workingSets(se)) {
      if (s.completedAt === null) continue;
      const kind = detectPrs({
        exerciseId: se.exerciseId,
        history: prior,
        candidate: { weightKg: s.weightKg, reps: s.reps },
        best: olderBests?.[se.exerciseId],
      })[0];
      if (kind && (!best || PR_RANK[kind] > PR_RANK[best.kind])) {
        best = { setId: s.id, kind };
      }
    }
    if (best) out.set(se.id, best);
  }
  return out;
}

export interface SlotPrescription {
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  prescription: Suggestion;
  warmups: WarmupSet[];
}

/**
 * Engine prescription for an exercise picked mid-session (swap or add): the
 * user's progression for that exercise and rep range if one exists, else the
 * engine's starting state — exactly what the routine would have prescribed.
 */
export function prescriptionFor(input: {
  meta: ExerciseMeta;
  bootstrap: Pick<GymBootstrap, 'profile' | 'progressions'>;
  today: string;
  sets: number;
  repMin?: number;
  repMax?: number;
  isFirstForPattern: boolean;
}): SlotPrescription {
  const { meta, bootstrap } = input;
  if (!bootstrap.profile) {
    throw new Error('A gym profile is required to prescribe an exercise');
  }
  const profile = equipmentProfileOf(bootstrap.profile);
  // Reps-first (bodyweight / timed) progressions need the exercise's own range.
  const keepSlotRange = meta.loadType === 'WEIGHTED' && !meta.isTimed;
  const repMin = keepSlotRange && input.repMin !== undefined ? input.repMin : meta.repMin;
  const repMax = keepSlotRange && input.repMax !== undefined ? input.repMax : meta.repMax;
  const slot = {
    exercise: meta,
    sets: input.sets,
    repMin: Math.min(repMin, repMax),
    repMax: Math.max(repMin, repMax),
    targetRir: defaultTargetRir(meta),
    restSec: meta.restSec,
  };
  const bucket = repBucket(slot.repMin, slot.repMax);
  const progression = bootstrap.progressions.find(
    (p) => p.exerciseId === meta.id && p.repBucket === bucket,
  );
  const experience = bootstrap.profile.experience;
  const state = progression?.state ?? initialState({ slot, profile, experience });
  const prescription = prescribe({
    slot,
    state,
    override: progression?.override ?? null,
    profile,
    facts: { experience, ageYears: null },
    today: input.today,
    deload: false,
  });
  return {
    repMin: slot.repMin,
    repMax: slot.repMax,
    targetRir: slot.targetRir,
    restSec: slot.restSec,
    prescription,
    warmups: warmupSets({
      slot,
      workingKg: prescription.weightKg,
      isFirstForPattern: input.isFirstForPattern,
      profile,
    }),
  };
}

function patternSeenBefore(
  doc: WorkoutSessionDoc,
  lookup: ExerciseLookup,
  pattern: string,
  beforePosition: number,
): boolean {
  return doc.exercises.some(
    (se) =>
      !se.skipped &&
      se.position < beforePosition &&
      lookup(se.exerciseId)?.movementPattern === pattern,
  );
}

/** Reducer action: swap `seId` for `meta` for this session only. */
export function buildSwapAction(input: {
  doc: WorkoutSessionDoc;
  seId: string;
  meta: ExerciseMeta;
  bootstrap: Pick<GymBootstrap, 'profile' | 'progressions'>;
  lookup: ExerciseLookup;
  today: string;
  newId: () => string;
}): WorkoutActionInput | null {
  const se = input.doc.exercises.find((e) => e.id === input.seId);
  if (!se) return null;
  const p = prescriptionFor({
    meta: input.meta,
    bootstrap: input.bootstrap,
    today: input.today,
    sets: Math.max(1, se.prescription.sets),
    repMin: se.repMin,
    repMax: se.repMax,
    isFirstForPattern: !patternSeenBefore(
      input.doc,
      input.lookup,
      input.meta.movementPattern,
      se.position,
    ),
  });
  return {
    type: 'swapExercise',
    seId: se.id,
    exerciseId: input.meta.id,
    ...p,
    newSetIds: Array.from({ length: p.warmups.length + p.prescription.sets }, input.newId),
  };
}

/** Reducer action: append `meta` to this session (3 working sets by default). */
export function buildAddExerciseAction(input: {
  doc: WorkoutSessionDoc;
  meta: ExerciseMeta;
  bootstrap: Pick<GymBootstrap, 'profile' | 'progressions'>;
  lookup: ExerciseLookup;
  today: string;
  newId: () => string;
  sets?: number;
}): WorkoutActionInput {
  const p = prescriptionFor({
    meta: input.meta,
    bootstrap: input.bootstrap,
    today: input.today,
    sets: input.sets ?? 3,
    isFirstForPattern: !patternSeenBefore(
      input.doc,
      input.lookup,
      input.meta.movementPattern,
      Number.POSITIVE_INFINITY,
    ),
  });
  return {
    type: 'addExercise',
    newSeId: input.newId(),
    exerciseId: input.meta.id,
    ...p,
    newSetIds: Array.from({ length: p.warmups.length + p.prescription.sets }, input.newId),
  };
}

/**
 * "Last time" column: the working sets of the newest completed session (other
 * than `excludeId`) that did this exercise.
 */
export function lastTimeSets(
  exerciseId: string,
  history: SessionSummaryDto[],
  excludeId: string | null = null,
): { weightKg: number; reps: number }[] {
  const sessions = history
    .filter((s) => s.status === 'COMPLETED' && s.id !== excludeId)
    .sort(
      (a, b) => b.localDate.localeCompare(a.localDate) || b.startedAt.localeCompare(a.startedAt),
    );
  for (const s of sessions) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
    const sets = ex?.sets.filter((x) => !x.isWarmup && x.completed) ?? [];
    if (sets.length > 0) return sets.map((x) => ({ weightKg: x.weightKg, reps: x.reps }));
  }
  return [];
}

/** The most recent non-empty note typed for this exercise ("Last time: seat 4, grip wide"). */
export function lastNoteFor(
  exerciseId: string,
  history: SessionSummaryDto[],
  excludeId: string | null = null,
): string | null {
  const sessions = history
    .filter((s) => s.status === 'COMPLETED' && s.id !== excludeId)
    .sort(
      (a, b) => b.localDate.localeCompare(a.localDate) || b.startedAt.localeCompare(a.startedAt),
    );
  for (const s of sessions) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
    const note = ex?.notes?.trim();
    if (note) return note;
  }
  return null;
}

/** Elapsed "m:ss" / "h:mm:ss" since `startedAt`. */
export function formatElapsed(startedAt: string, now: number): string {
  const total = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Rest countdown "1:30". */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}
