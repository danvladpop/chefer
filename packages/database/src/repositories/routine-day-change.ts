// ─── "Did this save change the day's exercises?" (trainer-mode.md §8.1) ───────
// A day copied from a template carries `editedSinceTemplate`, set by any
// routine save that changed the day's exercise list after the copy, so the
// trainer's "Update for clients" sheet can warn "Edited since. Updating
// replaces their changes". Pure, so CI's no-database job covers it.
//
// Compared in order and by content (not by row id): an added, removed or
// reordered row, or a change to any prescription field, is a change. Deleting
// a row and adding the same one back with the same numbers is not. The
// owner's own `notes` never count (a private note is not a programme change).

export interface DayExerciseShape {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  supersetGroup: string | null;
  trainerNote: string | null;
}

const FIELDS = [
  'exerciseId',
  'sets',
  'repMin',
  'repMax',
  'targetRir',
  'restSec',
  'supersetGroup',
  'trainerNote',
] as const satisfies readonly (keyof DayExerciseShape)[];

export function dayExercisesChanged(
  before: readonly DayExerciseShape[],
  after: readonly DayExerciseShape[],
): boolean {
  if (before.length !== after.length) return true;
  return before.some((b, i) => {
    const a = after[i];
    return !a || FIELDS.some((f) => (b[f] ?? null) !== (a[f] ?? null));
  });
}
