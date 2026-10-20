import type { TemplateDoc, WorkoutTemplateDto } from '@chefer/types';
import { normalizeSupersets } from '@chefer/utils';
import type { RoutineDraft } from '../../gym/routine/types';

// ─── A workout template as an editor draft (trainer-mode.md §6.6, M2) ────────
// The template editor reuses the routine editor's draft and reducer: the draft's `name` is the
// template's name, its `version` the template's version, and its ONE day is the workout (the day's
// `workoutType` is the template's type; the day's own name is unused). Rows keep a stable client `key`
// and, once saved, the server row `id` (so a save keeps rows instead of recreating them).

/** The key of the template's one day in the draft. */
export const TEMPLATE_DAY_KEY = 'template';

export function emptyTemplateDraft(): RoutineDraft {
  return {
    id: '',
    name: '',
    version: 0,
    days: [
      { key: TEMPLATE_DAY_KEY, name: '', plannedWeekday: null, workoutType: null, exercises: [] },
    ],
  };
}

export function templateDtoToDraft(dto: WorkoutTemplateDto): RoutineDraft {
  const rows = [...dto.exercises].sort((a, b) => a.position - b.position);
  return {
    id: dto.id,
    name: dto.name,
    version: dto.version,
    days: [
      {
        key: TEMPLATE_DAY_KEY,
        name: '',
        plannedWeekday: null,
        workoutType: dto.workoutType,
        exercises: normalizeSupersets(
          rows.map((e) => ({
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
            defaultLoadKg: e.defaultLoadKg,
          })),
        ),
      },
    ],
  };
}

/** Draft → the `create` / `save` document (name trimmed, empty notes dropped). */
export function draftToTemplateDoc(draft: RoutineDraft): TemplateDoc {
  const day = draft.days[0];
  return {
    name: draft.name.trim(),
    workoutType: day?.workoutType ?? null,
    exercises: (day?.exercises ?? []).map((e) => ({
      ...(e.id ? { id: e.id } : {}),
      exerciseId: e.exerciseId,
      sets: e.sets,
      repMin: e.repMin,
      repMax: e.repMax,
      targetRir: e.targetRir,
      restSec: e.restSec,
      supersetGroup: e.supersetGroup,
      defaultLoadKg: e.defaultLoadKg ?? null,
      trainerNote: e.trainerNote?.trim() ? e.trainerNote.trim() : null,
    })),
  };
}

/** What a save would change, ignoring row ids (adopting the server's ids is not an edit). */
export function templateSignature(draft: RoutineDraft): string {
  const doc = draftToTemplateDoc(draft);
  return JSON.stringify({
    ...doc,
    exercises: doc.exercises.map(({ id: _id, ...rest }) => rest),
  });
}

/** After a save: give rows that had no server id the id the server assigned (rows sent in order). */
export function adoptServerRowIds(
  draft: RoutineDraft,
  sentKeys: readonly string[],
  dto: WorkoutTemplateDto,
): RoutineDraft {
  const saved = [...dto.exercises].sort((a, b) => a.position - b.position);
  const idByKey = new Map<string, string>();
  sentKeys.forEach((key, i) => {
    const row = saved[i];
    if (row) idByKey.set(key, row.id);
  });
  return {
    ...draft,
    id: dto.id,
    version: dto.version,
    days: draft.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) =>
        e.id ? e : idByKey.has(e.key) ? { ...e, id: idByKey.get(e.key) } : e,
      ),
    })),
  };
}
