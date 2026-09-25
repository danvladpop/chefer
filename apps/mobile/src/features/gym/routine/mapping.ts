import type { RoutineDoc, RoutineDto } from '@chefer/types';
import { normalizeSupersets } from '@chefer/utils';
import type { RoutineDraft } from './types';

/** A fresh `RoutineDto` (bootstrap, a new create, a save response, the other
 * side of a conflict) → an editable draft. Existing rows keep their server id
 * as both `id` and `key`; the draft carries no rows that don't exist yet. */
export function routineDtoToDraft(dto: RoutineDto): RoutineDraft {
  return {
    id: dto.id,
    name: dto.name,
    version: dto.version,
    days: dto.days.map((d) => ({
      key: d.id,
      id: d.id,
      name: d.name,
      plannedWeekday: d.plannedWeekday,
      // Canonical superset letters (A, B… per day), so the editor's toggles and
      // brackets always agree with what gets saved.
      exercises: normalizeSupersets(
        d.exercises.map((e) => ({
          key: e.id,
          id: e.id,
          exerciseId: e.exerciseId,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSec: e.restSec,
          supersetGroup: e.supersetGroup,
          notes: e.notes,
        })),
      ),
    })),
  };
}

/** Draft → the `routine.save` payload. New rows (no `id`) omit it, so the API
 * assigns fresh ids; existing rows keep theirs (session links survive). */
export function draftToRoutineDoc(draft: RoutineDraft): RoutineDoc {
  return {
    id: draft.id,
    name: draft.name.trim(),
    days: draft.days.map((d) => ({
      ...(d.id ? { id: d.id } : {}),
      name: d.name.trim(),
      plannedWeekday: d.plannedWeekday,
      exercises: d.exercises.map((e) => ({
        ...(e.id ? { id: e.id } : {}),
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRir: e.targetRir,
        restSec: e.restSec,
        supersetGroup: e.supersetGroup,
        notes: e.notes,
      })),
    })),
  };
}

/** True when the draft has no unsaved edits relative to its last-loaded/saved shape. */
export function draftsEqual(a: RoutineDraft, b: RoutineDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
