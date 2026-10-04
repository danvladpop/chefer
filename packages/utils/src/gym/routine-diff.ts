// Routine document diff (trainer coaching, docs/trainer-platform/spec.md §5.3).
// Pure. Decides which rows a save CHANGED, so the repository can stamp
// `lastEditedById` / `lastEditedAt` only on those rows (and on the routine when
// anything changed): "Changed by Ana · 2 Oct" must appear on exactly the rows
// that were touched, whichever side saved and whichever app version sent it.
//
// A row is CHANGED when it is new, moved to another day, or any of
// `exerciseId, sets, repMin, repMax, targetRir, restSec, trainerNote` differs,
// or its superset PARTNERS differ. Partners are compared, not the letter: the
// letters are renumbered whenever an earlier superset disappears (A, B → A), and
// that must not stamp every row below it. A pure reorder is not a change, and the
// owner's own `notes` field is not part of the diff (it is never shown to or
// written by a trainer).
//
// The ROUTINE is changed when the name changed, a row changed or was deleted,
// a day was added, removed, renamed or moved to another weekday. Reordering days
// is not a change (the rotation is not edited here).
//
// Callers pass `before` as stored and `after` with ids resolved: an `id` is
// present only on a row/day that survives the save (same routine, claimed once);
// a missing id means a new row/day.

export interface DiffExercise {
  id?: string | undefined;
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  supersetGroup: string | null;
  /** The value that will be stored (a blank trainer note is the same as none). */
  trainerNote: string | null;
}

export interface DiffDay {
  id?: string | undefined;
  name: string;
  plannedWeekday: number | null;
  exercises: DiffExercise[];
}

export interface DiffDoc {
  name: string;
  days: DiffDay[];
}

export interface RoutineDiff {
  /** The document changed in any way listed above. */
  routineChanged: boolean;
  /** `changed[d][e]` is true when `after.days[d].exercises[e]` is a changed row. */
  changed: boolean[][];
  /** Rows of `before` that do not survive. */
  removedRows: number;
}

const blank = (note: string | null): string | null =>
  note === null || note.trim() === '' ? null : note;

/** Per row: the sorted keys of the rows in its superset (itself included), or null when it has none. */
function partnerSignatures(
  day: DiffDay,
  keyOf: (e: DiffExercise, index: number) => string,
): (string | null)[] {
  const byGroup = new Map<string, string[]>();
  day.exercises.forEach((e, i) => {
    if (e.supersetGroup === null) return;
    const list = byGroup.get(e.supersetGroup) ?? [];
    list.push(keyOf(e, i));
    byGroup.set(e.supersetGroup, list);
  });
  return day.exercises.map((e) => {
    if (e.supersetGroup === null) return null;
    const members = byGroup.get(e.supersetGroup) ?? [];
    // A lone letter is no superset (the editors normalise it away; be robust).
    return members.length < 2 ? null : [...members].sort().join('|');
  });
}

export function diffRoutineDoc(before: DiffDoc, after: DiffDoc): RoutineDiff {
  // Where each stored row lives, with its partner signature.
  const stored = new Map<string, { dayId: string; row: DiffExercise; signature: string | null }>();
  for (const day of before.days) {
    const signatures = partnerSignatures(day, (e, i) => e.id ?? `before#${i}`);
    day.exercises.forEach((row, i) => {
      if (row.id !== undefined) {
        stored.set(row.id, { dayId: day.id ?? '', row, signature: signatures[i] ?? null });
      }
    });
  }
  const beforeDays = new Map(
    before.days.flatMap((d) => (d.id !== undefined ? [[d.id, d] as const] : [])),
  );

  let routineChanged = before.name !== after.name;
  const survivingRows = new Set<string>();
  const changed: boolean[][] = [];

  // A row's key inside its own day: its id when it has one, else a per-position key for a new row.
  after.days.forEach((day, d) => {
    const keyOf = (e: DiffExercise, i: number) => e.id ?? `new#${d}:${i}`;
    const signatures = partnerSignatures(day, keyOf);
    const prevDay = day.id !== undefined ? beforeDays.get(day.id) : undefined;
    if (!prevDay) routineChanged = true;
    else if (prevDay.name !== day.name || prevDay.plannedWeekday !== day.plannedWeekday) {
      routineChanged = true;
    }
    changed.push(
      day.exercises.map((row, i) => {
        const prev = row.id !== undefined ? stored.get(row.id) : undefined;
        if (!prev) return true;
        survivingRows.add(prev.row.id ?? '');
        const same =
          prev.dayId === (day.id ?? '') &&
          prev.row.exerciseId === row.exerciseId &&
          prev.row.sets === row.sets &&
          prev.row.repMin === row.repMin &&
          prev.row.repMax === row.repMax &&
          prev.row.targetRir === row.targetRir &&
          prev.row.restSec === row.restSec &&
          blank(prev.row.trainerNote) === blank(row.trainerNote) &&
          prev.signature === (signatures[i] ?? null);
        return !same;
      }),
    );
  });

  const removedRows = [...stored.keys()].filter((id) => !survivingRows.has(id)).length;
  const removedDays = before.days.filter(
    (d) => d.id === undefined || !after.days.some((a) => a.id === d.id),
  ).length;
  if (removedDays > 0 || removedRows > 0 || changed.some((day) => day.some(Boolean))) {
    routineChanged = true;
  }
  return { routineChanged, changed, removedRows };
}
