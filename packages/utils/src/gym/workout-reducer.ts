// Active-workout state machine — pure, shared by mobile and web. Every action
// stamps clientUpdatedAt; ids are passed IN (the reducer never generates them)
// so replaying actions is deterministic and testable.
import type {
  NextWorkoutExerciseDto,
  Rir,
  SessionExerciseDoc,
  SessionSetDoc,
  Suggestion,
  WorkoutSessionDoc,
} from '@chefer/types';
import { ENGINE_VERSION } from './progression';

export type WorkoutAction =
  | {
      type: 'completeSet';
      seId: string;
      setId: string;
      weightKg?: number;
      reps?: number;
      at: string;
    }
  | { type: 'uncompleteSet'; seId: string; setId: string; at: string }
  | { type: 'editSet'; seId: string; setId: string; weightKg?: number; reps?: number; at: string }
  | { type: 'setRir'; seId: string; rir: Rir | null; at: string }
  | { type: 'addSet'; seId: string; newSetId: string; at: string }
  | { type: 'removeSet'; seId: string; setId: string; at: string }
  | {
      type: 'swapExercise';
      seId: string;
      exerciseId: string;
      repMin: number;
      repMax: number;
      targetRir: number;
      restSec: number;
      prescription: Suggestion;
      warmups: { weightKg: number; reps: number }[];
      newSetIds: string[];
      at: string;
    }
  | { type: 'skipExercise'; seId: string; skipped: boolean; at: string }
  | {
      type: 'addExercise';
      newSeId: string;
      exerciseId: string;
      repMin: number;
      repMax: number;
      targetRir: number;
      restSec: number;
      prescription: Suggestion;
      warmups: { weightKg: number; reps: number }[];
      newSetIds: string[];
      at: string;
    }
  | { type: 'moveExercise'; seId: string; direction: 'up' | 'down'; at: string }
  | { type: 'setNote'; seId: string | null; notes: string | null; at: string }
  | { type: 'finish'; at: string }
  | { type: 'discard'; at: string };

/**
 * Warm-ups first (isWarmup), then `prescription.sets` working sets prefilled
 * with the suggestion's weight and per-set reps. Ids are consumed in order;
 * pass warmups.length + prescription.sets of them (extra ids are ignored,
 * missing ones shorten the list).
 */
export function plannedSets(
  prescription: Suggestion,
  warmups: { weightKg: number; reps: number }[],
  ids: string[],
): SessionSetDoc[] {
  const specs = [
    ...warmups.map((w) => ({ weightKg: w.weightKg, reps: w.reps, isWarmup: true })),
    ...Array.from({ length: prescription.sets }, (_, i) => ({
      weightKg: prescription.weightKg,
      reps: prescription.reps[i] ?? prescription.reps[prescription.reps.length - 1] ?? 0,
      isWarmup: false,
    })),
  ];
  const out: SessionSetDoc[] = [];
  specs.forEach((spec, position) => {
    const id = ids[position];
    if (id !== undefined) {
      out.push({ id, position, ...spec, completedAt: null });
    }
  });
  return out;
}

/** New IN_PROGRESS session from a planned day (warm-up + working sets pre-filled from suggestions). */
export function startSession(input: {
  id: string;
  newId: () => string;
  now: string;
  localDate: string;
  routineId: string | null;
  routineDayId: string | null;
  name: string;
  isDeload: boolean;
  exercises: NextWorkoutExerciseDto[];
}): WorkoutSessionDoc {
  const exercises: SessionExerciseDoc[] = [...input.exercises]
    .sort((a, b) => a.position - b.position)
    .map((ex, position) => {
      const seId = input.newId();
      const count = ex.warmups.length + ex.suggestion.sets;
      const ids = Array.from({ length: count }, () => input.newId());
      return {
        id: seId,
        exerciseId: ex.exerciseId,
        routineExerciseId: ex.routineExerciseId,
        position,
        repMin: ex.repMin,
        repMax: ex.repMax,
        targetRir: ex.targetRir,
        restSec: ex.restSec,
        skipped: false,
        swappedFromId: null,
        lastSetRir: null,
        prescription: ex.suggestion,
        notes: ex.notes,
        sets: plannedSets(ex.suggestion, ex.warmups, ids),
      };
    });
  return {
    schemaVersion: 1,
    id: input.id,
    routineId: input.routineId,
    routineDayId: input.routineDayId,
    name: input.name,
    status: 'IN_PROGRESS',
    startedAt: input.now,
    finishedAt: null,
    localDate: input.localDate,
    isDeload: input.isDeload,
    notes: null,
    clientUpdatedAt: input.now,
    engineVersion: ENGINE_VERSION,
    exercises,
  };
}

function reindex<T extends { position: number }>(items: T[]): T[] {
  return items.map((item, position) => (item.position === position ? item : { ...item, position }));
}

function mapExercise(
  doc: WorkoutSessionDoc,
  seId: string,
  fn: (se: SessionExerciseDoc) => SessionExerciseDoc,
): SessionExerciseDoc[] | null {
  if (!doc.exercises.some((se) => se.id === seId)) {
    return null;
  }
  return doc.exercises.map((se) => (se.id === seId ? fn(se) : se));
}

function mapSet(
  doc: WorkoutSessionDoc,
  seId: string,
  setId: string,
  fn: (set: SessionSetDoc) => SessionSetDoc,
): SessionExerciseDoc[] | null {
  const se = doc.exercises.find((e) => e.id === seId);
  if (!se?.sets.some((s) => s.id === setId)) {
    return null;
  }
  return mapExercise(doc, seId, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.id === setId ? fn(s) : s)),
  }));
}

function sortedByPosition<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

/**
 * Apply one action. Unknown exercise/set ids are a no-op (the doc is returned
 * untouched, not even re-stamped). Positions stay contiguous (0…n-1).
 */
export function workoutReducer(doc: WorkoutSessionDoc, action: WorkoutAction): WorkoutSessionDoc {
  const stamp = (patch: Partial<WorkoutSessionDoc>): WorkoutSessionDoc => ({
    ...doc,
    ...patch,
    clientUpdatedAt: action.at,
  });
  const withExercises = (exercises: SessionExerciseDoc[] | null): WorkoutSessionDoc =>
    exercises === null ? doc : stamp({ exercises });

  switch (action.type) {
    case 'completeSet':
      return withExercises(
        mapSet(doc, action.seId, action.setId, (s) => ({
          ...s,
          weightKg: action.weightKg ?? s.weightKg,
          reps: action.reps ?? s.reps,
          completedAt: action.at,
        })),
      );
    case 'uncompleteSet':
      return withExercises(
        mapSet(doc, action.seId, action.setId, (s) => ({ ...s, completedAt: null })),
      );
    case 'editSet':
      return withExercises(
        mapSet(doc, action.seId, action.setId, (s) => ({
          ...s,
          weightKg: action.weightKg ?? s.weightKg,
          reps: action.reps ?? s.reps,
        })),
      );
    case 'setRir':
      return withExercises(
        mapExercise(doc, action.seId, (se) => ({ ...se, lastSetRir: action.rir })),
      );
    case 'addSet':
      return withExercises(
        mapExercise(doc, action.seId, (se) => {
          const sets = sortedByPosition(se.sets);
          const template = [...sets].reverse().find((s) => !s.isWarmup);
          const newSet: SessionSetDoc = {
            id: action.newSetId,
            position: sets.length,
            weightKg: template?.weightKg ?? se.prescription.weightKg,
            reps: template?.reps ?? se.prescription.reps[0] ?? se.repMin,
            isWarmup: false,
            completedAt: null,
          };
          return { ...se, sets: reindex([...sets, newSet]) };
        }),
      );
    case 'removeSet':
      return withExercises(
        mapSet(doc, action.seId, action.setId, (s) => s) &&
          mapExercise(doc, action.seId, (se) => ({
            ...se,
            sets: reindex(sortedByPosition(se.sets).filter((s) => s.id !== action.setId)),
          })),
      );
    case 'swapExercise':
      return withExercises(
        mapExercise(doc, action.seId, (se) => ({
          ...se,
          exerciseId: action.exerciseId,
          swappedFromId: se.swappedFromId ?? se.exerciseId,
          repMin: action.repMin,
          repMax: action.repMax,
          targetRir: action.targetRir,
          restSec: action.restSec,
          prescription: action.prescription,
          lastSetRir: null,
          skipped: false,
          notes: null,
          sets: plannedSets(action.prescription, action.warmups, action.newSetIds),
        })),
      );
    case 'skipExercise':
      return withExercises(
        mapExercise(doc, action.seId, (se) => ({ ...se, skipped: action.skipped })),
      );
    case 'addExercise': {
      const exercises = sortedByPosition(doc.exercises);
      const added: SessionExerciseDoc = {
        id: action.newSeId,
        exerciseId: action.exerciseId,
        routineExerciseId: null,
        position: exercises.length,
        repMin: action.repMin,
        repMax: action.repMax,
        targetRir: action.targetRir,
        restSec: action.restSec,
        skipped: false,
        swappedFromId: null,
        lastSetRir: null,
        prescription: action.prescription,
        notes: null,
        sets: plannedSets(action.prescription, action.warmups, action.newSetIds),
      };
      return stamp({ exercises: reindex([...exercises, added]) });
    }
    case 'moveExercise': {
      const exercises = sortedByPosition(doc.exercises);
      const idx = exercises.findIndex((se) => se.id === action.seId);
      if (idx < 0) {
        return doc;
      }
      const target = action.direction === 'up' ? idx - 1 : idx + 1;
      const moving = exercises[idx];
      const other = exercises[target];
      if (moving && other) {
        exercises[idx] = other;
        exercises[target] = moving;
      }
      return stamp({ exercises: reindex(exercises) });
    }
    case 'setNote':
      if (action.seId === null) {
        return stamp({ notes: action.notes });
      }
      return withExercises(mapExercise(doc, action.seId, (se) => ({ ...se, notes: action.notes })));
    case 'finish':
      return stamp({ status: 'COMPLETED', finishedAt: action.at });
    case 'discard':
      return stamp({ status: 'DISCARDED' });
  }
}
