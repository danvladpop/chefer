// Pure draft reducer for the routine editor (gym_plan.md §5.4). Ids are
// passed IN (never generated here — same convention as the workout reducer
// in @chefer/utils), so replaying actions in a test is deterministic.
import { COACHING_LIMITS, type ExerciseMeta } from '@chefer/types';
import {
  createSuperset,
  defaultTargetRir,
  moveSupersetItem,
  normalizeSupersets,
  removeSupersetItem,
  setSupersetWithNext,
  ungroupSuperset,
} from '@chefer/utils';
import {
  MAX_DAYS,
  MAX_EXERCISES_PER_DAY,
  MAX_REST_SEC,
  MAX_SETS,
  MAX_TARGET_RIR,
  MIN_REST_SEC,
  MIN_SETS,
  MIN_TARGET_RIR,
  type RoutineDayDraft,
  type RoutineDraft,
  type RoutineExerciseDraft,
} from './types';

export type RoutineDraftAction =
  | { type: 'load'; draft: RoutineDraft }
  | { type: 'setVersion'; version: number }
  | { type: 'renameRoutine'; name: string }
  | { type: 'addDay'; dayId: string }
  | { type: 'duplicateDay'; dayKey: string; dayId: string; exerciseIds: readonly string[] }
  | { type: 'deleteDay'; dayKey: string }
  | { type: 'moveDay'; dayKey: string; direction: 'up' | 'down' }
  | { type: 'renameDay'; dayKey: string; name: string }
  | { type: 'setPlannedWeekday'; dayKey: string; weekday: number | null }
  | { type: 'addExercise'; dayKey: string; newExerciseKey: string; exercise: ExerciseMeta }
  | { type: 'swapExercise'; dayKey: string; exerciseKey: string; exercise: ExerciseMeta }
  | { type: 'removeExercise'; dayKey: string; exerciseKey: string }
  // UX-05 A4 (T-05.3): undoes a `removeExercise` (no confirm dialog — the
  // routine is only saved on Save, so a snackbar `Undo` is enough). A no-op
  // if that key already exists (a stale/duplicate Undo tap), mirroring the
  // workout reducer's `restoreSet`.
  | { type: 'restoreExercise'; dayKey: string; index: number; exercise: RoutineExerciseDraft }
  | { type: 'moveExercise'; dayKey: string; exerciseKey: string; direction: 'up' | 'down' }
  /** "Superset with next": link / unlink this exercise and the one after it. */
  | { type: 'setSupersetWithNext'; dayKey: string; exerciseKey: string; linked: boolean }
  /**
   * plan-library-supersets S2: "Group as superset" — the picked exercises
   * (2 to MAX_SUPERSET_SIZE) move together at the first pick's place under one
   * letter. Invalid picks leave the day unchanged.
   */
  | { type: 'createSuperset'; dayKey: string; exerciseKeys: readonly string[] }
  /** "Ungroup" on a superset heading: every member of that superset stands alone. */
  | { type: 'ungroupSuperset'; dayKey: string; exerciseKey: string }
  | { type: 'setSets'; dayKey: string; exerciseKey: string; sets: number }
  | { type: 'setRepMin'; dayKey: string; exerciseKey: string; repMin: number }
  | { type: 'setRepMax'; dayKey: string; exerciseKey: string; repMax: number }
  | { type: 'setRestSec'; dayKey: string; exerciseKey: string; restSec: number }
  | { type: 'setTargetRir'; dayKey: string; exerciseKey: string; targetRir: number }
  /** Trainer coaching: the trainer edits the cue (clamped, '' = none); the client's "Remove note" passes null. */
  | { type: 'setTrainerNote'; dayKey: string; exerciseKey: string; note: string | null };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function move<T>(list: T[], index: number, direction: 'up' | 'down'): T[] {
  const to = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

function newExerciseRow(
  exerciseId: string,
  key: string,
  exercise: ExerciseMeta,
): RoutineExerciseDraft {
  return {
    key,
    exerciseId,
    sets: 3,
    repMin: exercise.repMin,
    repMax: exercise.repMax,
    targetRir: defaultTargetRir(exercise),
    restSec: exercise.restSec,
    supersetGroup: null,
    notes: null,
  };
}

function updateDay(
  draft: RoutineDraft,
  dayKey: string,
  fn: (day: RoutineDayDraft) => RoutineDayDraft,
): RoutineDraft {
  return { ...draft, days: draft.days.map((d) => (d.key === dayKey ? fn(d) : d)) };
}

function updateExercise(
  day: RoutineDayDraft,
  exerciseKey: string,
  fn: (ex: RoutineExerciseDraft) => RoutineExerciseDraft,
): RoutineDayDraft {
  return {
    ...day,
    exercises: day.exercises.map((e) => (e.key === exerciseKey ? fn(e) : e)),
  };
}

/** Keeps repMin ≤ repMax by nudging the other bound, rather than rejecting the edit. */
function setRepMin(ex: RoutineExerciseDraft, repMin: number): RoutineExerciseDraft {
  const clamped = Math.max(1, Math.round(repMin));
  return { ...ex, repMin: clamped, repMax: Math.max(clamped, ex.repMax) };
}

function setRepMax(ex: RoutineExerciseDraft, repMax: number): RoutineExerciseDraft {
  const clamped = Math.max(1, Math.round(repMax));
  return { ...ex, repMax: clamped, repMin: Math.min(ex.repMin, clamped) };
}

export function routineDraftReducer(draft: RoutineDraft, action: RoutineDraftAction): RoutineDraft {
  switch (action.type) {
    case 'load':
      return action.draft;

    case 'setVersion':
      return { ...draft, version: action.version };

    case 'renameRoutine':
      return { ...draft, name: action.name };

    case 'addDay': {
      if (draft.days.length >= MAX_DAYS) return draft;
      const day: RoutineDayDraft = {
        key: action.dayId,
        name: `Day ${draft.days.length + 1}`,
        plannedWeekday: null,
        exercises: [],
      };
      return { ...draft, days: [...draft.days, day] };
    }

    case 'duplicateDay': {
      if (draft.days.length >= MAX_DAYS) return draft;
      const source = draft.days.find((d) => d.key === action.dayKey);
      if (!source) return draft;
      // A copy is a new row: no server id, and no "changed by" stamp of the original.
      const exercises = normalizeSupersets(source.exercises).map((e, i) => {
        const { lastEditedByOther: _stamp, ...rest } = e;
        return { ...rest, key: action.exerciseIds[i] ?? `${action.dayId}-${i}`, id: undefined };
      });
      const copy: RoutineDayDraft = {
        key: action.dayId,
        name: `${source.name} (copy)`.slice(0, 40),
        plannedWeekday: null,
        exercises,
      };
      const index = draft.days.findIndex((d) => d.key === action.dayKey);
      const days = [...draft.days];
      days.splice(index + 1, 0, copy);
      return { ...draft, days };
    }

    case 'deleteDay':
      return { ...draft, days: draft.days.filter((d) => d.key !== action.dayKey) };

    case 'moveDay': {
      const index = draft.days.findIndex((d) => d.key === action.dayKey);
      return { ...draft, days: move(draft.days, index, action.direction) };
    }

    case 'renameDay':
      return updateDay(draft, action.dayKey, (d) => ({ ...d, name: action.name }));

    case 'setPlannedWeekday':
      return updateDay(draft, action.dayKey, (d) => ({ ...d, plannedWeekday: action.weekday }));

    case 'addExercise':
      return updateDay(draft, action.dayKey, (d) => {
        if (d.exercises.length >= MAX_EXERCISES_PER_DAY) return d;
        return {
          ...d,
          exercises: [
            ...d.exercises,
            newExerciseRow(action.exercise.id, action.newExerciseKey, action.exercise),
          ],
        };
      });

    case 'swapExercise':
      return updateDay(draft, action.dayKey, (d) =>
        updateExercise(d, action.exerciseKey, (e) => ({
          ...e,
          exerciseId: action.exercise.id,
          repMin: action.exercise.repMin,
          repMax: action.exercise.repMax,
          restSec: action.exercise.restSec,
          targetRir: defaultTargetRir(action.exercise),
        })),
      );

    // Removing / moving keeps supersets consistent (shared helpers, @chefer/utils).
    case 'removeExercise':
      return updateDay(draft, action.dayKey, (d) => {
        const index = d.exercises.findIndex((e) => e.key === action.exerciseKey);
        return index < 0 ? d : { ...d, exercises: removeSupersetItem(d.exercises, index) };
      });

    case 'restoreExercise':
      return updateDay(draft, action.dayKey, (d) => {
        if (d.exercises.some((e) => e.key === action.exercise.key)) return d;
        if (d.exercises.length >= MAX_EXERCISES_PER_DAY) return d;
        const at = Math.max(0, Math.min(action.index, d.exercises.length));
        const exercises = [...d.exercises.slice(0, at), action.exercise, ...d.exercises.slice(at)];
        return { ...d, exercises: normalizeSupersets(exercises) };
      });

    case 'moveExercise':
      return updateDay(draft, action.dayKey, (d) => {
        const index = d.exercises.findIndex((e) => e.key === action.exerciseKey);
        if (index < 0) return d;
        return { ...d, exercises: moveSupersetItem(d.exercises, index, action.direction) };
      });

    case 'setSupersetWithNext':
      return updateDay(draft, action.dayKey, (d) => {
        const index = d.exercises.findIndex((e) => e.key === action.exerciseKey);
        if (index < 0) return d;
        return { ...d, exercises: setSupersetWithNext(d.exercises, index, action.linked) };
      });

    case 'createSuperset':
      return updateDay(draft, action.dayKey, (d) => {
        const indices = action.exerciseKeys.map((key) =>
          d.exercises.findIndex((e) => e.key === key),
        );
        if (indices.some((i) => i < 0)) return d;
        return { ...d, exercises: createSuperset(d.exercises, indices) };
      });

    case 'ungroupSuperset':
      return updateDay(draft, action.dayKey, (d) => {
        const index = d.exercises.findIndex((e) => e.key === action.exerciseKey);
        if (index < 0) return d;
        return { ...d, exercises: ungroupSuperset(d.exercises, index) };
      });

    case 'setSets':
      return updateDay(draft, action.dayKey, (d) =>
        updateExercise(d, action.exerciseKey, (e) => ({
          ...e,
          sets: clamp(Math.round(action.sets), MIN_SETS, MAX_SETS),
        })),
      );

    case 'setRepMin':
      return updateDay(draft, action.dayKey, (d) =>
        updateExercise(d, action.exerciseKey, (e) => setRepMin(e, action.repMin)),
      );

    case 'setRepMax':
      return updateDay(draft, action.dayKey, (d) =>
        updateExercise(d, action.exerciseKey, (e) => setRepMax(e, action.repMax)),
      );

    case 'setRestSec':
      return updateDay(draft, action.dayKey, (d) =>
        updateExercise(d, action.exerciseKey, (e) => ({
          ...e,
          restSec: clamp(Math.round(action.restSec), MIN_REST_SEC, MAX_REST_SEC),
        })),
      );

    case 'setTargetRir':
      return updateDay(draft, action.dayKey, (d) =>
        updateExercise(d, action.exerciseKey, (e) => ({
          ...e,
          targetRir: clamp(Math.round(action.targetRir), MIN_TARGET_RIR, MAX_TARGET_RIR),
        })),
      );

    case 'setTrainerNote':
      return updateDay(draft, action.dayKey, (d) =>
        updateExercise(d, action.exerciseKey, (e) => {
          const note = action.note?.slice(0, COACHING_LIMITS.trainerNoteMaxChars) ?? '';
          return { ...e, trainerNote: note === '' ? null : note };
        }),
      );

    default:
      return draft;
  }
}
