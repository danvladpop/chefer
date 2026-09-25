import {
  DEFAULT_PLATE_PAIRS_KG,
  type EquipmentProfile,
  type ExerciseDto,
  type ExerciseMeta,
  type ExerciseSlot,
  type GymBootstrap,
  type LastTimeSet,
  type PrKind,
  type ReasonCode,
  type RoutineDoc,
  type RoutineDto,
  type SessionExerciseDoc,
  type SessionSetDoc,
  type SessionSummaryDto,
  type Suggestion,
  type WarmupSet,
  type WeightUnit,
  type WorkoutSessionDoc,
} from '@chefer/types';
import {
  defaultTargetRir,
  detectPrs,
  equipmentProfileOf,
  initialState,
  isAssisted,
  loadModel,
  prescribe,
  repBucket,
  sessionSupersets,
  stepDown,
  stepUp,
  supersetGroupLookup,
  warmupSets,
  workoutFocus,
  type SessionSupersetSlot,
  type WorkoutFocus,
} from '@chefer/utils';

// Pure helpers behind the active-workout screen (gym_plan.md §1.3). No React,
// no stores: everything here is unit-testable and cheap enough to call from
// memoised components.

/** Reason codes that mean "we're still finding your weight" (RIR matters most). */
const CALIBRATION_CODES: ReadonlySet<ReasonCode> = new Set([
  'START_CALIBRATING',
  'CALIBRATING_UP',
  'CALIBRATING_DOWN',
]);

export function isCalibrating(suggestion: Suggestion): boolean {
  if (suggestion.reasonCode === 'CALIBRATING_UP' && suggestion.inputs.calibrationDone === true) {
    return false;
  }
  return CALIBRATION_CODES.has(suggestion.reasonCode);
}

/** Used when the cached profile is missing (should not happen once setup is done). */
export const FALLBACK_EQUIPMENT: EquipmentProfile = {
  unit: 'KG',
  barWeightKg: 20,
  platePairsKg: [...DEFAULT_PLATE_PAIRS_KG],
  dumbbellsKg: [],
  machineStepKg: 5,
  cableStepKg: 2.5,
  hasDipBelt: false,
  microPlates: false,
};

export function equipmentOf(bootstrap: GymBootstrap | undefined): EquipmentProfile {
  return bootstrap?.profile ? equipmentProfileOf(bootstrap.profile) : FALLBACK_EQUIPMENT;
}

export function unitOf(bootstrap: GymBootstrap | undefined): WeightUnit {
  return bootstrap?.profile?.unit ?? 'KG';
}

/** A neutral stand-in when an exercise is missing from the cached library. */
export function fallbackMeta(exerciseId: string): ExerciseDto {
  return {
    id: exerciseId,
    name: 'Exercise',
    category: 'COMPOUND',
    movementPattern: exerciseId,
    equipment: 'MACHINE',
    loadType: 'WEIGHTED',
    primaryMuscles: [],
    secondaryMuscles: [],
    repMin: 8,
    repMax: 12,
    restSec: 90,
    incrementKg: 2.5,
    perHand: false,
    isLowerBody: false,
    isTimed: false,
    swapGroup: null,
    ownerId: null,
    aliases: [],
    cues: [],
    mistakes: [],
    blurb: null,
    images: [],
    videoId: null,
    videoStartSec: null,
    videoChannel: null,
    archived: false,
    updatedAt: '1970-01-01T00:00:00.000Z',
  };
}

// ─── Sets & progress ──────────────────────────────────────────────────────────

export function byPosition<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

export function workingSets(se: SessionExerciseDoc): SessionSetDoc[] {
  return byPosition(se.sets).filter((s) => !s.isWarmup);
}

export function warmupSetsOf(se: SessionExerciseDoc): SessionSetDoc[] {
  return byPosition(se.sets).filter((s) => s.isWarmup);
}

export function isDone(set: SessionSetDoc): boolean {
  return set.completedAt !== null;
}

/** Working sets ticked / planned across non-skipped exercises (warm-ups excluded). */
export function workoutProgress(doc: WorkoutSessionDoc): { done: number; planned: number } {
  let done = 0;
  let planned = 0;
  for (const se of doc.exercises) {
    if (se.skipped) continue;
    for (const s of se.sets) {
      if (s.isWarmup) continue;
      planned += 1;
      if (isDone(s)) done += 1;
    }
  }
  return { done, planned };
}

const NO_SUPERSETS: ReadonlyMap<string, SessionSupersetSlot> = new Map();

/**
 * The session's supersets, derived from the cached routine (the session doc
 * has no superset field): routine slots sharing a letter AND still adjacent.
 */
export function supersetsOf(
  doc: WorkoutSessionDoc,
  bootstrap: Pick<GymBootstrap, 'activeRoutine' | 'nextWorkout'> | undefined,
): Map<string, SessionSupersetSlot> {
  if (!bootstrap) return new Map();
  return sessionSupersets(doc.exercises, supersetGroupLookup(bootstrap));
}

/**
 * The next working set to do: first non-skipped exercise with an unticked
 * working set — walked round by round inside a superset (A1, A2, A1, A2 …).
 */
export function currentFocus(
  doc: WorkoutSessionDoc,
  supersets: ReadonlyMap<string, SessionSupersetSlot> = NO_SUPERSETS,
): WorkoutFocus | null {
  return workoutFocus(doc, supersets);
}

/** The exercise to expand and scroll to (the focus's exercise). */
export function currentExerciseId(
  doc: WorkoutSessionDoc,
  supersets: ReadonlyMap<string, SessionSupersetSlot> = NO_SUPERSETS,
): string | null {
  return currentFocus(doc, supersets)?.seId ?? null;
}

/** "Set 2" / "Warm-up 1" — how a set is named in its card. */
export function setLabelOf(se: SessionExerciseDoc, setId: string): string | null {
  const warm = warmupSetsOf(se).findIndex((s) => s.id === setId);
  if (warm >= 0) return `Warm-up ${warm + 1}`;
  const work = workingSets(se).findIndex((s) => s.id === setId);
  return work >= 0 ? `Set ${work + 1}` : null;
}

/** True once the last working set (by position) is ticked — the RIR chips' trigger. */
export function lastWorkingSetDone(se: SessionExerciseDoc): boolean {
  const sets = workingSets(se);
  const last = sets[sets.length - 1];
  return last !== undefined && isDone(last);
}

// ─── History ──────────────────────────────────────────────────────────────────

/** Completed sessions other than `excludeId`, newest first. */
export function priorSessions(
  recent: readonly SessionSummaryDto[],
  excludeId: string | null,
): SessionSummaryDto[] {
  return recent
    .filter((s) => s.status === 'COMPLETED' && s.id !== excludeId)
    .sort(
      (a, b) => b.localDate.localeCompare(a.localDate) || b.startedAt.localeCompare(a.startedAt),
    );
}

export interface ExerciseHistoryEntry {
  sessionId: string;
  localDate: string;
  sets: LastTimeSet[];
  lastSetRir: number | null;
}

/** Up to `limit` past exposures of an exercise (working, ticked sets), newest first. */
export function exerciseHistory(
  exerciseId: string,
  prior: readonly SessionSummaryDto[],
  limit = 5,
): ExerciseHistoryEntry[] {
  const out: ExerciseHistoryEntry[] = [];
  for (const s of prior) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
    if (!ex) continue;
    const sets = ex.sets
      .filter((x) => !x.isWarmup && x.completed)
      .map((x) => ({ weightKg: x.weightKg, reps: x.reps }));
    if (sets.length === 0) continue;
    out.push({ sessionId: s.id, localDate: s.localDate, sets, lastSetRir: ex.lastSetRir });
    if (out.length >= limit) break;
  }
  return out;
}

/** The "Last time" column: working sets of the most recent exposure. */
export function lastTimeSets(
  exerciseId: string,
  prior: readonly SessionSummaryDto[],
): LastTimeSet[] {
  return exerciseHistory(exerciseId, prior, 1)[0]?.sets ?? [];
}

// ─── PRs ──────────────────────────────────────────────────────────────────────

const PR_RANK: Record<PrKind, number> = { e1rm: 3, weight: 2, reps: 1 };

export const PR_LABELS: Record<PrKind, string> = {
  e1rm: 'PR · e1RM',
  weight: 'PR · weight',
  reps: 'PR · reps',
};

/**
 * The single live PR badge for an exercise (research §4.2 #8: at most one per
 * exercise per session): the highest-ranked record any ticked working set
 * beats, on the first set that beat it.
 */
export function livePr(
  se: SessionExerciseDoc,
  prior: SessionSummaryDto[],
): { setId: string; kind: PrKind } | null {
  if (se.skipped) return null;
  const sets = workingSets(se);
  let best: { setId: string; kind: PrKind } | null = null;
  for (let idx = 0; idx < sets.length; idx++) {
    const s = sets[idx];
    if (!s || !isDone(s) || s.reps <= 0) continue;
    const rir = idx === sets.length - 1 ? se.lastSetRir : null;
    const kind = detectPrs({
      exerciseId: se.exerciseId,
      history: prior,
      candidate: { weightKg: s.weightKg, reps: s.reps, rir },
    })[0];
    if (kind && (best === null || PR_RANK[kind] > PR_RANK[best.kind])) {
      best = { setId: s.id, kind };
    }
  }
  return best;
}

// ─── Load steppers ────────────────────────────────────────────────────────────

export type WeightMode = 'plates' | 'keypad' | 'none';

/** Tapping the weight: plate calculator (barbell/smith), keypad, or nothing (pure bodyweight). */
export function weightModeOf(meta: ExerciseMeta, profile: EquipmentProfile): WeightMode {
  const model = loadModel({ exercise: meta });
  if (model === 'NONE' || (model === 'BELT' && !profile.hasDipBelt)) return 'none';
  return model === 'PLATES' ? 'plates' : 'keypad';
}

/**
 * The next load the "+" / "−" buttons land on. Always an achievable load for
 * the equipment (engine stepUp/stepDown). "+" means a numerically higher value
 * everywhere, so for ASSISTED exercises "+" is MORE assistance (engine stepDown).
 */
export function nextLoad(
  kg: number,
  direction: 1 | -1,
  meta: ExerciseMeta,
  profile: EquipmentProfile,
): number {
  const slot = { exercise: meta };
  const harder = direction === 1 ? !isAssisted(slot) : isAssisted(slot);
  return harder ? stepUp(kg, slot, profile) : stepDown(kg, slot, profile);
}

// ─── Prescriptions for swapped / added exercises ─────────────────────────────

export interface SlotParams {
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
}

/** Defaults for an exercise added mid-session. */
export function defaultSlotParams(meta: ExerciseMeta): SlotParams {
  return {
    sets: 3,
    repMin: meta.repMin,
    repMax: meta.repMax,
    targetRir: defaultTargetRir(meta),
    restSec: meta.restSec,
  };
}

/**
 * A swap keeps the slot (sets, rep range, rest, RIR) — unless the new exercise
 * is timed and the old one isn't (or vice versa): seconds and reps don't mix.
 */
export function swapSlotParams(
  se: SessionExerciseDoc,
  oldMeta: ExerciseMeta | undefined,
  newMeta: ExerciseMeta,
): SlotParams {
  const sets = Math.max(1, workingSets(se).length);
  if ((oldMeta?.isTimed ?? false) !== newMeta.isTimed) {
    return { ...defaultSlotParams(newMeta), sets };
  }
  return {
    sets,
    repMin: se.repMin,
    repMax: se.repMax,
    targetRir: se.targetRir,
    restSec: se.restSec,
  };
}

/**
 * The engine's prescription for `meta` in this slot today: the cached
 * progression if there is one (so a swap back to a known lift gets its real
 * targets), else a starting guess. Offline-safe — pure engine on cached data.
 */
export function prescribeFor(input: {
  meta: ExerciseMeta;
  params: SlotParams;
  bootstrap: GymBootstrap | undefined;
  profile: EquipmentProfile;
  today: string;
  isDeload: boolean;
  isFirstForPattern: boolean;
}): { prescription: Suggestion; warmups: WarmupSet[] } {
  const { meta, params, bootstrap, profile } = input;
  const slot: ExerciseSlot = { exercise: meta, ...params };
  const bucket = repBucket(params.repMin, params.repMax);
  const entry = bootstrap?.progressions.find(
    (p) => p.exerciseId === meta.id && p.repBucket === bucket,
  );
  const experience = bootstrap?.profile?.experience ?? 'BEGINNER';
  const state = entry?.state ?? initialState({ slot, profile, experience });
  const prescription = prescribe({
    slot,
    state,
    override: entry?.override ?? null,
    profile,
    facts: { experience, ageYears: null },
    today: input.today,
    deload: input.isDeload,
  });
  const warmups = warmupSets({
    slot,
    workingKg: prescription.weightKg,
    isFirstForPattern: input.isFirstForPattern,
    profile,
  });
  return { prescription, warmups };
}

/** Does any exercise before `beforePosition` share this movement pattern? */
export function isFirstForPattern(
  doc: WorkoutSessionDoc,
  meta: ExerciseMeta,
  beforePosition: number,
  lookup: (id: string) => ExerciseMeta | undefined,
): boolean {
  return !doc.exercises.some(
    (se) =>
      !se.skipped &&
      se.position < beforePosition &&
      lookup(se.exerciseId)?.movementPattern === meta.movementPattern,
  );
}

// ─── "Update routine" on a swap ──────────────────────────────────────────────

/**
 * The active routine as a save document with one routine exercise swapped
 * (the slot keeps its id so progression/session links survive). Null when
 * the routine no longer has that exercise (e.g. edited on another device).
 */
export function routineWithSwap(
  routine: RoutineDto,
  routineExerciseId: string,
  exerciseId: string,
  params: SlotParams,
): RoutineDoc | null {
  const exists = routine.days.some((d) => d.exercises.some((e) => e.id === routineExerciseId));
  if (!exists) return null;
  return {
    id: routine.id,
    name: routine.name,
    days: byPosition(routine.days).map((day) => ({
      id: day.id,
      name: day.name,
      plannedWeekday: day.plannedWeekday,
      exercises: byPosition(day.exercises).map((e) =>
        e.id === routineExerciseId
          ? {
              id: e.id,
              exerciseId,
              sets: e.sets,
              repMin: params.repMin,
              repMax: params.repMax,
              targetRir: params.targetRir,
              restSec: Math.max(15, params.restSec),
              supersetGroup: e.supersetGroup,
              notes: e.notes,
            }
          : {
              id: e.id,
              exerciseId: e.exerciseId,
              sets: e.sets,
              repMin: e.repMin,
              repMax: e.repMax,
              targetRir: e.targetRir,
              restSec: e.restSec,
              supersetGroup: e.supersetGroup,
              notes: e.notes,
            },
      ),
    })),
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** "52 min", "1 h 05 min". */
export function formatDuration(totalSec: number): string {
  const min = Math.max(0, Math.round(totalSec / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${pad2(min % 60)} min`;
}

export type Direction = 'up' | 'same' | 'down';

export function directionOf(suggestion: Suggestion): Direction {
  if (suggestion.kind === 'increase') return 'up';
  if (suggestion.kind === 'decrease' || suggestion.kind === 'deload') return 'down';
  return 'same';
}

export const DIRECTION_ICON: Record<Direction, string> = { up: '↑', same: '=', down: '↓' };

export const DIRECTION_LABEL: Record<Direction, string> = {
  up: 'Going up',
  same: 'Same targets',
  down: 'Going down',
};
