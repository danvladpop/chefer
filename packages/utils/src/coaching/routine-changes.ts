// "What changed" for trainer coaching (PRD 2026-10 §4.2). Pure. Turns two
// versions of a routine into the plain-words list a "<Trainer> updated your
// routine" card shows ("+ Romanian deadlift · Squat 3×8 → 4×6 · note on Bench
// press"), and folds a new list into one the other person has not seen yet.
//
// Rows are matched by id (a row without an id, or with an id the old version
// does not have, is new). A row whose exercise was swapped reads as one out,
// one in. Rest, RIR and superset edits are not listed: the card is a summary,
// the routine itself shows "Changed by Ana" on every touched row. Clearing a
// note is not news. Days added, removed, renamed or moved collapse into one
// "days changed".

import { COACHING_LIMITS, setsRepsLabel, type RoutineChange } from '@chefer/types';

export interface ChangeExercise {
  id?: string | undefined;
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  trainerNote: string | null;
}

export interface ChangeDay {
  id?: string | undefined;
  name: string;
  plannedWeekday: number | null;
  /** My week's workout type; a change of type is a schedule change. */
  workoutType?: string | null | undefined;
  exercises: ChangeExercise[];
}

function noteOf(e: ChangeExercise): string {
  return (e.trainerNote ?? '').trim();
}

export function summarizeRoutineChanges(
  before: readonly ChangeDay[],
  after: readonly ChangeDay[],
  nameOf: (exerciseId: string) => string,
): RoutineChange[] {
  const out: RoutineChange[] = [];
  const oldRows = new Map<string, ChangeExercise>();
  for (const d of before) for (const e of d.exercises) if (e.id) oldRows.set(e.id, e);
  const kept = new Set<string>();

  for (const d of after) {
    for (const e of d.exercises) {
      const old = e.id ? oldRows.get(e.id) : undefined;
      if (e.id === undefined || !old) {
        out.push({ kind: 'added', exercise: nameOf(e.exerciseId) });
        continue;
      }
      kept.add(e.id);
      if (old.exerciseId !== e.exerciseId) {
        out.push({ kind: 'removed', exercise: nameOf(old.exerciseId) });
        out.push({ kind: 'added', exercise: nameOf(e.exerciseId) });
        continue;
      }
      const from = setsRepsLabel(old.sets, old.repMin, old.repMax);
      const to = setsRepsLabel(e.sets, e.repMin, e.repMax);
      if (from !== to) out.push({ kind: 'changed', exercise: nameOf(e.exerciseId), from, to });
      if (noteOf(e) !== '' && noteOf(e) !== noteOf(old)) {
        out.push({ kind: 'note', exercise: nameOf(e.exerciseId) });
      }
    }
  }
  for (const [id, old] of oldRows) {
    if (!kept.has(id)) out.push({ kind: 'removed', exercise: nameOf(old.exerciseId) });
  }

  const oldDays = new Map(before.flatMap((d) => (d.id ? [[d.id, d] as const] : [])));
  const afterIds = new Set(after.map((d) => d.id).filter(Boolean));
  const scheduleChanged =
    after.some((d) => {
      const old = d.id ? oldDays.get(d.id) : undefined;
      return (
        old?.name !== d.name ||
        old.plannedWeekday !== d.plannedWeekday ||
        (old.workoutType ?? null) !== (d.workoutType ?? null)
      );
    }) || [...oldDays.keys()].some((id) => !afterIds.has(id));
  if (scheduleChanged) out.push({ kind: 'schedule' });
  return out;
}

function sameTarget(a: RoutineChange, b: RoutineChange): boolean {
  if (a.kind === 'schedule' || a.kind === 'created') return a.kind === b.kind;
  return b.kind === a.kind && 'exercise' in b && b.exercise === a.exercise;
}

/**
 * Folds `next` into `previous` (what the other person has not dismissed yet):
 * a row changed twice keeps the first "from" and the last "to" (and disappears
 * when it went back), an add then a remove of the same exercise cancel out,
 * repeats collapse. Capped at `max`, oldest first.
 */
export function mergeRoutineChanges(
  previous: readonly RoutineChange[] | null | undefined,
  next: readonly RoutineChange[],
  max: number = COACHING_LIMITS.routineChangesMax,
): RoutineChange[] {
  const list: RoutineChange[] = [...(previous ?? [])];
  for (const change of next) {
    if (change.kind === 'removed' || change.kind === 'added') {
      const opposite = change.kind === 'removed' ? 'added' : 'removed';
      const at = list.findIndex((c) => c.kind === opposite && c.exercise === change.exercise);
      if (at >= 0) {
        list.splice(at, 1);
        continue;
      }
    }
    // A row the other person has not seen yet is simply "+ Exercise", whatever happened to it since.
    if (
      (change.kind === 'changed' || change.kind === 'note') &&
      list.some((c) => c.kind === 'added' && c.exercise === change.exercise)
    ) {
      continue;
    }
    if (change.kind === 'changed') {
      const at = list.findIndex((c) => c.kind === 'changed' && c.exercise === change.exercise);
      const prior = at >= 0 ? list[at] : undefined;
      if (prior?.kind === 'changed') {
        if (prior.from === change.to) list.splice(at, 1);
        else list[at] = { ...prior, to: change.to };
        continue;
      }
    }
    if (list.some((c) => sameTarget(c, change))) continue;
    list.push(change);
  }
  return list.slice(0, max);
}
