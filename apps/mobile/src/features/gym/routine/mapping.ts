import type { RoutineDoc, RoutineDto, TrainerRoutineDoc, TrainerRoutineDto } from '@chefer/types';
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
    ...(dto.lastEditedByOther ? { lastEditedByOther: dto.lastEditedByOther } : {}),
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
          // Trainer coaching (level 6+): absent below it, so old payloads map exactly as before.
          ...(e.trainerNote !== undefined ? { trainerNote: e.trainerNote } : {}),
          ...(e.lastEditedByOther ? { lastEditedByOther: e.lastEditedByOther } : {}),
        })),
      ),
    })),
  };
}

/** The trainer's view of the client's routine → an editable draft. The client's own `notes` never
 * reach a trainer, so rows carry `notes: null` and the trainer's save never sends them. */
export function trainerRoutineToDraft(dto: TrainerRoutineDto): RoutineDraft {
  return {
    id: dto.id,
    name: dto.name,
    version: dto.version,
    ...(dto.lastEditedByOther ? { lastEditedByOther: dto.lastEditedByOther } : {}),
    days: dto.days.map((d) => ({
      key: d.id,
      id: d.id,
      name: d.name,
      plannedWeekday: d.plannedWeekday,
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
          notes: null,
          trainerNote: e.trainerNote,
          ...(e.lastEditedByOther ? { lastEditedByOther: e.lastEditedByOther } : {}),
        })),
      ),
    })),
  };
}

/** Draft → the `trainer.client.saveRoutine` document: no `notes`, `trainerNote` on every row. */
export function draftToTrainerRoutineDoc(draft: RoutineDraft): TrainerRoutineDoc {
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
        trainerNote: e.trainerNote?.trim() ? e.trainerNote.trim() : null,
      })),
    })),
  };
}

/** The client's editor: ids of saved rows whose trainer note was removed in this draft
 * (`gym.routine.save` `clearTrainerNoteIds`). The save never writes a trainer note otherwise. */
export function removedTrainerNoteIds(baseline: RoutineDraft, draft: RoutineDraft): string[] {
  const had = new Set<string>();
  for (const day of baseline.days) {
    for (const e of day.exercises) if (e.id && e.trainerNote) had.add(e.id);
  }
  const ids: string[] = [];
  for (const day of draft.days) {
    for (const e of day.exercises) {
      if (e.id && had.has(e.id) && !e.trainerNote) ids.push(e.id);
    }
  }
  return ids;
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
