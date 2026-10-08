import type {
  ExerciseBest,
  ExerciseMeta,
  GymBootstrap,
  PrKind,
  RoutineDto,
  SessionExerciseDoc,
  SessionSetDoc,
  SessionSummaryDto,
  Suggestion,
  WarmupSet,
  WorkoutSessionDoc,
} from '@chefer/types';
import {
  defaultTargetRir,
  detectLivePrs,
  equipmentProfileOf,
  initialState,
  prescribe,
  repBucket,
  sameKg,
  sessionOwnsSupersets,
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
 * The session's supersets: its own letters once the doc carries them
 * (plan-library-supersets S-D3, every session started since S1), else derived
 * from the cached routine (older docs) — slots sharing a letter AND still
 * adjacent. Works without a bootstrap for docs that own their letters.
 */
export function supersetsOf(
  doc: WorkoutSessionDoc,
  bootstrap: Pick<GymBootstrap, 'activeRoutine' | 'nextWorkout'> | undefined | null,
): Map<string, SessionSupersetSlot> {
  return sessionSupersets(doc.exercises, bootstrap ? supersetGroupLookup(bootstrap) : null);
}

/**
 * The `derivedGroups` for a `createSuperset` / `ungroupSuperset` action: the
 * grouping on screen (seId → letter) when the doc does not own its letters
 * yet, so the routine's supersets survive the first edit. Undefined for a doc
 * that owns them (the reducer then uses its own).
 */
export function derivedSupersetGroups(
  doc: WorkoutSessionDoc,
  supersets: ReadonlyMap<string, SessionSupersetSlot>,
): Record<string, string | null> | undefined {
  if (sessionOwnsSupersets(doc.exercises)) return undefined;
  return Object.fromEntries(
    doc.exercises.map((se) => [se.id, supersets.get(se.id)?.label ?? null]),
  );
}

/** The active routine's day this session was started from (null for freestyle / another routine). */
function sessionRoutineDay(doc: WorkoutSessionDoc, routine: RoutineDto | null | undefined) {
  if (!routine || !doc.routineDayId || doc.routineId !== routine.id) return null;
  return routine.days.find((d) => d.id === doc.routineDayId) ?? null;
}

/**
 * "Also change my routine" for a superset made in the workout: the picks'
 * routine slots, when EVERY pick is a slot of the session's day in the active
 * routine (an exercise added mid-workout has none). Null hides the option.
 */
export function routineSlotsForPicks(
  doc: WorkoutSessionDoc,
  routine: RoutineDto | null | undefined,
  seIds: readonly string[],
): string[] | null {
  const day = sessionRoutineDay(doc, routine);
  if (!day || seIds.length < 2) return null;
  const slots: string[] = [];
  for (const id of seIds) {
    const rid = doc.exercises.find((se) => se.id === id)?.routineExerciseId ?? null;
    if (!rid || !day.exercises.some((e) => e.id === rid)) return null;
    slots.push(rid);
  }
  return slots;
}

/**
 * "Also change my routine" for Ungroup: a member's routine slot that is in a
 * superset on the session's routine day (null when the routine has nothing
 * to ungroup, which hides the option).
 */
export function routineSupersetSlotOf(
  doc: WorkoutSessionDoc,
  routine: RoutineDto | null | undefined,
  memberIds: readonly string[],
): string | null {
  const day = sessionRoutineDay(doc, routine);
  if (!day) return null;
  for (const id of memberIds) {
    const rid = doc.exercises.find((se) => se.id === id)?.routineExerciseId ?? null;
    if (rid && day.exercises.some((e) => e.id === rid && e.supersetGroup !== null)) return rid;
  }
  return null;
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

/**
 * T-05.7 (bug B-20, web parity with the mobile logger): the `editSet` actions
 * a weight/reps edit should ALSO fire, one per later unticked set that still
 * matched the edited field's old value — changing set 1 almost always means
 * the rest too. `set` is the edited set's value BEFORE the patch. Returns an
 * empty array for a warm-up (propagation is working-sets only).
 */
export function propagateEditActions(
  se: SessionExerciseDoc,
  set: SessionSetDoc,
  patch: { weightKg?: number; reps?: number },
): Extract<WorkoutActionInput, { type: 'editSet' }>[] {
  if (set.isWarmup) return [];
  const actions: Extract<WorkoutActionInput, { type: 'editSet' }>[] = [];
  for (const later of se.sets) {
    if (later.isWarmup || later.position <= set.position || later.completedAt !== null) {
      continue;
    }
    const laterPatch: { weightKg?: number; reps?: number } = {};
    if (patch.weightKg !== undefined && sameKg(later.weightKg, set.weightKg)) {
      laterPatch.weightKg = patch.weightKg;
    }
    if (patch.reps !== undefined && later.reps === set.reps) {
      laterPatch.reps = patch.reps;
    }
    if (Object.keys(laterPatch).length > 0) {
      actions.push({ type: 'editSet', seId: se.id, setId: later.id, ...laterPatch });
    }
  }
  return actions;
}

export function loadSlotOf(meta: ExerciseMeta): LoadSlot {
  return { exercise: meta, stepOverrideKg: null };
}

const PR_RANK: Record<PrKind, number> = { e1rm: 3, weight: 2, reps: 1 };

/**
 * Live PR badges: at most one per exercise — the ticked working set with the
 * highest-ranked record (first one wins a tie). An exercise with no earlier
 * history has none (UX-GYM-18: a first-ever lift is a baseline). `history` is the bootstrap's
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
      const kind = detectLivePrs({
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
