// Pure local-draft model for the routine editor (gym_plan.md §5.4 / G5-B).
//
// The editor never mutates the server document directly: it loads a
// `RoutineDto`, works on this draft shape (which adds a client-only `key` for
// React/dnd-kit identity), and converts back to a `RoutineDoc` on Save. Existing
// rows keep their server `id` so `gym.routine.save` preserves session links;
// new rows omit `id` so the server assigns one (routineDocSchema treats `id`
// as optional-to-keep, not required).
import type {
  ExerciseMeta,
  RoutineDayDoc,
  RoutineDoc,
  RoutineDto,
  RoutineLike,
  TrainerRoutineDoc,
  TrainerRoutineDto,
} from '@chefer/types';
import {
  createSuperset,
  defaultTargetRir,
  moveSupersetItem,
  moveSupersetItemTo,
  normalizeSupersets,
  removeSupersetItem,
  setSupersetWithNext,
  ungroupSuperset,
} from '@chefer/utils';

export interface DraftExercise {
  key: string;
  id?: string;
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  supersetGroup: string | null;
  notes: string | null;
  /**
   * Trainer coaching: the trainer's cue for this exercise. The owner's editor
   * only ever clears it (`clearTrainerNoteIds`); the trainer's editor writes it
   * (`toTrainerRoutineDoc`). `undefined`/`null` = no note. Never part of the
   * owner's `toRoutineDoc`.
   */
  trainerNote?: string | null;
}

export interface DraftDay {
  key: string;
  id?: string;
  name: string;
  plannedWeekday: number | null;
  exercises: DraftExercise[];
}

export interface DraftRoutine {
  id: string;
  name: string;
  days: DraftDay[];
}

let keyCounter = 0;

/** Client-only stable identity for a draft row. Never sent to the server. */
export function makeKey(prefix: string): string {
  keyCounter += 1;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${keyCounter}-${Math.random().toString(36).slice(2)}`;
}

export function fromRoutineDto(routine: RoutineDto): DraftRoutine {
  return {
    id: routine.id,
    name: routine.name,
    days: routine.days
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((day) => ({
        key: makeKey('day'),
        id: day.id,
        name: day.name,
        plannedWeekday: day.plannedWeekday,
        // Canonical superset letters (A, B… per day), so the toggles and
        // brackets always agree with what gets saved.
        exercises: normalizeSupersets(
          day.exercises
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((exercise) => ({
              key: makeKey('ex'),
              id: exercise.id,
              exerciseId: exercise.exerciseId,
              sets: exercise.sets,
              repMin: exercise.repMin,
              repMax: exercise.repMax,
              targetRir: exercise.targetRir,
              restSec: exercise.restSec,
              supersetGroup: exercise.supersetGroup,
              notes: exercise.notes,
              trainerNote: exercise.trainerNote ?? null,
            })),
        ),
      })),
  };
}

/**
 * The trainer's view of the client's routine (`trainer.client.routine`) as a
 * draft. The client's own `notes` never reach a trainer, so rows carry null.
 */
export function fromTrainerRoutineDto(routine: TrainerRoutineDto): DraftRoutine {
  return {
    id: routine.id,
    name: routine.name,
    days: routine.days
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((day) => ({
        key: makeKey('day'),
        id: day.id,
        name: day.name,
        plannedWeekday: day.plannedWeekday,
        exercises: normalizeSupersets(
          day.exercises
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((exercise) => ({
              key: makeKey('ex'),
              id: exercise.id,
              exerciseId: exercise.exerciseId,
              sets: exercise.sets,
              repMin: exercise.repMin,
              repMax: exercise.repMax,
              targetRir: exercise.targetRir,
              restSec: exercise.restSec,
              supersetGroup: exercise.supersetGroup,
              notes: null,
              trainerNote: exercise.trainerNote,
            })),
        ),
      })),
  };
}

export function defaultExerciseSlot(exercise: ExerciseMeta): Omit<DraftExercise, 'key'> {
  return {
    exerciseId: exercise.id,
    sets: 3,
    repMin: exercise.repMin,
    repMax: exercise.repMax,
    targetRir: defaultTargetRir(exercise),
    restSec: exercise.restSec,
    supersetGroup: null,
    notes: null,
  };
}

export function newDay(name: string): DraftDay {
  return { key: makeKey('day'), name, plannedWeekday: null, exercises: [] };
}

function toExerciseDoc(exercise: DraftExercise): RoutineDayDoc['exercises'][number] {
  const doc: RoutineDayDoc['exercises'][number] = {
    exerciseId: exercise.exerciseId,
    sets: exercise.sets,
    repMin: exercise.repMin,
    repMax: exercise.repMax,
    targetRir: exercise.targetRir,
    restSec: exercise.restSec,
    supersetGroup: exercise.supersetGroup,
    notes: exercise.notes,
  };
  if (exercise.id) {
    doc.id = exercise.id;
  }
  return doc;
}

function toDayDoc(day: DraftDay): RoutineDayDoc {
  const doc: RoutineDayDoc = {
    name: day.name,
    plannedWeekday: day.plannedWeekday,
    exercises: day.exercises.map(toExerciseDoc),
  };
  if (day.id) {
    doc.id = day.id;
  }
  return doc;
}

/** Draft → wire document for `gym.routine.save`. Ids are preserved for existing rows. */
export function toRoutineDoc(draft: DraftRoutine): RoutineDoc {
  return {
    id: draft.id,
    name: draft.name,
    days: draft.days.map(toDayDoc),
  };
}

/**
 * Draft → wire document for `trainer.client.saveRoutine`: the same rows, no
 * `notes`, plus the trainer's note (trimmed; empty = none).
 */
export function toTrainerRoutineDoc(draft: DraftRoutine): TrainerRoutineDoc {
  return {
    id: draft.id,
    name: draft.name,
    days: draft.days.map((day) => ({
      ...(day.id ? { id: day.id } : {}),
      name: day.name,
      plannedWeekday: day.plannedWeekday,
      exercises: day.exercises.map((exercise) => {
        const note = exercise.trainerNote?.trim() ?? '';
        return {
          ...(exercise.id ? { id: exercise.id } : {}),
          exerciseId: exercise.exerciseId,
          sets: exercise.sets,
          repMin: exercise.repMin,
          repMax: exercise.repMax,
          targetRir: exercise.targetRir,
          restSec: exercise.restSec,
          supersetGroup: exercise.supersetGroup,
          trainerNote: note === '' ? null : note,
        };
      }),
    })),
  };
}

/**
 * Ids of the rows whose trainer note the client removed since `baseline`
 * (`gym.routine.save` `clearTrainerNoteIds`). Only rows that still exist.
 */
export function clearedTrainerNoteIds(draft: DraftRoutine, baseline: DraftRoutine): string[] {
  const had = new Set<string>();
  for (const day of baseline.days) {
    for (const exercise of day.exercises) {
      if (exercise.id && exercise.trainerNote) had.add(exercise.id);
    }
  }
  const cleared: string[] = [];
  for (const day of draft.days) {
    for (const exercise of day.exercises) {
      if (exercise.id && had.has(exercise.id) && !exercise.trainerNote) cleared.push(exercise.id);
    }
  }
  return cleared;
}

/** Draft → the minimal shape the volume/validation engine understands. */
export function toRoutineLike(draft: DraftRoutine): RoutineLike {
  return {
    days: draft.days.map((day) => ({
      name: day.name,
      exercises: day.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        sets: exercise.sets,
        repMin: exercise.repMin,
        repMax: exercise.repMax,
        restSec: exercise.restSec,
      })),
    })),
  };
}

/** Deep-equal-enough check for the dirty flag: compare the would-be save payloads. */
export function isDraftEqual(a: DraftRoutine, b: DraftRoutine): boolean {
  return (
    JSON.stringify(toRoutineDoc(a)) === JSON.stringify(toRoutineDoc(b)) &&
    trainerNoteSignature(a) === trainerNoteSignature(b)
  );
}

/** Trainer notes are not in `toRoutineDoc`, but editing or clearing one is a change. */
function trainerNoteSignature(draft: DraftRoutine): string {
  return JSON.stringify(draft.days.map((d) => d.exercises.map((e) => e.trainerNote ?? null)));
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type DraftAction =
  | { type: 'rename_routine'; name: string }
  | { type: 'add_day' }
  | { type: 'duplicate_day'; dayKey: string }
  | { type: 'delete_day'; dayKey: string }
  | { type: 'rename_day'; dayKey: string; name: string }
  | { type: 'set_day_weekday'; dayKey: string; weekday: number | null }
  | { type: 'move_day'; fromIndex: number; toIndex: number }
  | { type: 'add_exercise'; dayKey: string; exercise: ExerciseMeta }
  | { type: 'remove_exercise'; dayKey: string; exerciseKey: string }
  | { type: 'swap_exercise'; dayKey: string; exerciseKey: string; newExerciseId: string }
  | {
      type: 'update_exercise';
      dayKey: string;
      exerciseKey: string;
      patch: Partial<
        Pick<
          DraftExercise,
          'sets' | 'repMin' | 'repMax' | 'targetRir' | 'restSec' | 'notes' | 'trainerNote'
        >
      >;
    }
  /** Phone arrows: one step, hopping over a neighbouring superset as a whole. */
  | { type: 'step_exercise'; dayKey: string; exerciseKey: string; direction: 'up' | 'down' }
  /** "Superset with next": link / unlink this exercise and the one after it. */
  | { type: 'set_superset_with_next'; dayKey: string; exerciseKey: string; linked: boolean }
  /**
   * "Group as superset" (plan-library-supersets S3): the picked exercises (2 to
   * MAX_SUPERSET_SIZE) move together to the first pick's place under one letter.
   */
  | { type: 'create_superset'; dayKey: string; exerciseKeys: string[] }
  /** "Ungroup": every member of the superset holding this exercise stands alone. */
  | { type: 'ungroup_superset'; dayKey: string; exerciseKey: string }
  | {
      /** Reorders within a day when fromDayKey === toDayKey, else moves across days. */
      type: 'move_exercise';
      fromDayKey: string;
      exerciseKey: string;
      toDayKey: string;
      toIndex: number;
    };

function mapDayExercises(
  state: DraftRoutine,
  dayKey: string,
  fn: (exercises: DraftExercise[]) => DraftExercise[],
): DraftRoutine {
  return {
    ...state,
    days: state.days.map((d) => (d.key === dayKey ? { ...d, exercises: fn(d.exercises) } : d)),
  };
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

export function draftReducer(state: DraftRoutine, action: DraftAction): DraftRoutine {
  switch (action.type) {
    case 'rename_routine':
      return { ...state, name: action.name };

    case 'add_day':
      return { ...state, days: [...state.days, newDay(`Day ${state.days.length + 1}`)] };

    case 'duplicate_day': {
      const source = state.days.find((d) => d.key === action.dayKey);
      if (!source) return state;
      const index = state.days.indexOf(source);
      const copy: DraftDay = {
        key: makeKey('day'),
        name: `${source.name} copy`,
        plannedWeekday: null,
        exercises: source.exercises.map((e) => {
          // Fresh copies get no id — the server assigns a new row on save.
          const { id: _sourceId, ...rest } = e;
          return { ...rest, key: makeKey('ex') };
        }),
      };
      const days = [...state.days.slice(0, index + 1), copy, ...state.days.slice(index + 1)];
      return { ...state, days };
    }

    case 'delete_day':
      return { ...state, days: state.days.filter((d) => d.key !== action.dayKey) };

    case 'rename_day':
      return {
        ...state,
        days: state.days.map((d) => (d.key === action.dayKey ? { ...d, name: action.name } : d)),
      };

    case 'set_day_weekday':
      return {
        ...state,
        days: state.days.map((d) =>
          d.key === action.dayKey ? { ...d, plannedWeekday: action.weekday } : d,
        ),
      };

    case 'move_day': {
      const days = state.days.slice();
      const from = clampIndex(action.fromIndex, days.length - 1);
      const to = clampIndex(action.toIndex, days.length - 1);
      const [moved] = days.splice(from, 1);
      if (!moved) return state;
      days.splice(to, 0, moved);
      return { ...state, days };
    }

    case 'add_exercise':
      return {
        ...state,
        days: state.days.map((d) =>
          d.key === action.dayKey
            ? {
                ...d,
                exercises: [
                  ...d.exercises,
                  { key: makeKey('ex'), ...defaultExerciseSlot(action.exercise) },
                ],
              }
            : d,
        ),
      };

    // Removing / moving keeps supersets consistent (shared helpers, @chefer/utils).
    case 'remove_exercise':
      return mapDayExercises(state, action.dayKey, (exercises) => {
        const index = exercises.findIndex((e) => e.key === action.exerciseKey);
        return index < 0 ? exercises : removeSupersetItem(exercises, index);
      });

    case 'step_exercise':
      return mapDayExercises(state, action.dayKey, (exercises) => {
        const index = exercises.findIndex((e) => e.key === action.exerciseKey);
        return index < 0 ? exercises : moveSupersetItem(exercises, index, action.direction);
      });

    case 'set_superset_with_next':
      return mapDayExercises(state, action.dayKey, (exercises) => {
        const index = exercises.findIndex((e) => e.key === action.exerciseKey);
        return index < 0 ? exercises : setSupersetWithNext(exercises, index, action.linked);
      });

    case 'create_superset':
      return mapDayExercises(state, action.dayKey, (exercises) => {
        const indices = action.exerciseKeys.map((k) => exercises.findIndex((e) => e.key === k));
        return indices.some((i) => i < 0) ? exercises : createSuperset(exercises, indices);
      });

    case 'ungroup_superset':
      return mapDayExercises(state, action.dayKey, (exercises) => {
        const index = exercises.findIndex((e) => e.key === action.exerciseKey);
        return index < 0 ? exercises : ungroupSuperset(exercises, index);
      });

    case 'swap_exercise':
      return {
        ...state,
        days: state.days.map((d) =>
          d.key === action.dayKey
            ? {
                ...d,
                exercises: d.exercises.map((e) =>
                  e.key === action.exerciseKey ? { ...e, exerciseId: action.newExerciseId } : e,
                ),
              }
            : d,
        ),
      };

    case 'update_exercise':
      return {
        ...state,
        days: state.days.map((d) =>
          d.key === action.dayKey
            ? {
                ...d,
                exercises: d.exercises.map((e) =>
                  e.key === action.exerciseKey ? { ...e, ...action.patch } : e,
                ),
              }
            : d,
        ),
      };

    case 'move_exercise': {
      const { fromDayKey, exerciseKey, toDayKey, toIndex } = action;
      const fromDay = state.days.find((d) => d.key === fromDayKey);
      const exercise = fromDay?.exercises.find((e) => e.key === exerciseKey);
      if (!fromDay || !exercise) return state;

      if (fromDayKey === toDayKey) {
        const from = fromDay.exercises.indexOf(exercise);
        const exercises = moveSupersetItemTo(fromDay.exercises, from, toIndex);
        return {
          ...state,
          days: state.days.map((d) => (d.key === fromDayKey ? { ...d, exercises } : d)),
        };
      }

      const toDay = state.days.find((d) => d.key === toDayKey);
      if (!toDay) return state;
      const index = clampIndex(toIndex, toDay.exercises.length);
      // Another day's letters mean nothing here: the moved exercise leaves its superset.
      const moved = { ...exercise, supersetGroup: null };
      return {
        ...state,
        days: state.days.map((d) => {
          if (d.key === fromDayKey) {
            return {
              ...d,
              exercises: normalizeSupersets(d.exercises.filter((e) => e.key !== exerciseKey)),
            };
          }
          if (d.key === toDayKey) {
            return {
              ...d,
              exercises: normalizeSupersets([
                ...d.exercises.slice(0, index),
                moved,
                ...d.exercises.slice(index),
              ]),
            };
          }
          return d;
        }),
      };
    }

    default:
      return state;
  }
}
