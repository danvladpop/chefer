import { EXERCISE_BY_ID, type GymEquipmentAccess } from '@chefer/types';
import { estimateDurationMin, instantiateTemplate, type ExerciseLookup } from '@chefer/utils';

// UX-GYM-14 (web twin of the phone's `setup/template-preview.ts`): what a
// template contains, day by day, computed on the client from the SAME pure
// functions the server uses to instantiate it — no extra API call. Templates
// only reference curated exercise slugs, so the static catalog is enough.

const catalogLookup: ExerciseLookup = (id) => EXERCISE_BY_ID.get(id);

export type TemplatePreviewExercise = {
  exerciseId: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
};

export type TemplatePreviewDay = {
  name: string;
  estimatedMin: number;
  exercises: TemplatePreviewExercise[];
};

/** Day-by-day, exercise-by-exercise preview for one template key. */
export function buildTemplatePreview(
  templateKey: string,
  equipmentAccess: GymEquipmentAccess,
): TemplatePreviewDay[] {
  const draft = instantiateTemplate(templateKey, equipmentAccess, catalogLookup);
  return draft.days.map((day) => ({
    name: day.name,
    estimatedMin: estimateDurationMin(
      {
        name: day.name,
        exercises: day.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          restSec: e.restSec,
        })),
      },
      catalogLookup,
    ),
    exercises: day.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      name: catalogLookup(e.exerciseId)?.name ?? e.exerciseId,
      sets: e.sets,
      repMin: e.repMin,
      repMax: e.repMax,
    })),
  }));
}

/** The copy that explains what "Create and switch" changes (shared by both buttons' note). */
export function switchNote(currentGoal: number | null, templateDays: number): string {
  return currentGoal !== null && currentGoal !== templateDays
    ? `“Create and switch” makes this your active routine and changes your weekly goal from ${String(currentGoal)} to ${String(templateDays)}. “Create” keeps your current routine active.`
    : '“Create and switch” makes this your active routine. “Create” keeps your current routine active.';
}
