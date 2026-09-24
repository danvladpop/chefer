// Active-workout state machine — pure, shared by mobile and web. Every action
// stamps clientUpdatedAt; ids are passed IN (the reducer never generates them)
// so replaying actions is deterministic and testable.
import type { NextWorkoutExerciseDto, Rir, Suggestion, WorkoutSessionDoc } from '@chefer/types';
import { notImplemented } from './_stub';

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
  return notImplemented(`startSession(${input.id})`);
}

export function workoutReducer(doc: WorkoutSessionDoc, action: WorkoutAction): WorkoutSessionDoc {
  return notImplemented(`workoutReducer(${doc.id}, ${action.type})`);
}
