// Local editable draft of a routine (gym_plan.md §5.4, D5a). The editor works
// on this shape, converts it to a `RoutineDoc` for `routine.save`, and
// converts a fresh `RoutineDto` (from bootstrap, from a template/blank create,
// or from a save/conflict response) back into a draft with `routineDtoToDraft`.
//
// `key` is a stable client-side identity for React lists and reducer lookups
// — always present, generated once (either from the server `id` for existing
// rows or via `newId()` for rows added in this session). `id` is the SERVER
// row id, kept only for rows that existed before this edit, so `save` can
// preserve session links (gym_plan.md §5.4 / routineExerciseDocSchema).

export interface RoutineExerciseDraft {
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
}

export interface RoutineDayDraft {
  key: string;
  id?: string;
  name: string;
  plannedWeekday: number | null;
  exercises: RoutineExerciseDraft[];
}

export interface RoutineDraft {
  id: string;
  name: string;
  /** The version the draft was loaded from — sent back as `expectedVersion`. */
  version: number;
  days: RoutineDayDraft[];
}

export const MAX_DAYS = 7;
export const MAX_EXERCISES_PER_DAY = 20;
export const MIN_SETS = 1;
export const MAX_SETS = 10;
export const MIN_REST_SEC = 15;
export const MAX_REST_SEC = 600;
export const REST_STEP_SEC = 15;
export const MIN_TARGET_RIR = 0;
export const MAX_TARGET_RIR = 4;
