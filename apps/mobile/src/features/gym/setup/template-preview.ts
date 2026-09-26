import {
  EXERCISE_BY_ID,
  type GymEquipmentAccess,
  type MuscleVolume,
  type TrainingExperience,
} from '@chefer/types';
import {
  estimateDurationMin,
  instantiateTemplate,
  volumeByGroup,
  type ExerciseLookup,
} from '@chefer/utils';

// Setup preview (gym_plan.md §1.3 step 5): the engine's template selection and
// instantiation are pure and shared (D4/D12), so the alternate-program preview
// ("Choose another program") is computed on-device instead of adding a new API
// call — the SAME functions gymProfileService.recommend() uses server-side
// (apps/api/src/application/gym/gym-profile.service.ts), applied to whichever
// template key the user is looking at. Templates only ever reference curated
// exercise slugs (packages/types/src/gym/templates.ts), so the static catalog
// is always enough, even offline.

/** The curated exercise catalog as an ExerciseLookup — no network needed. */
export const catalogLookup: ExerciseLookup = (id) => EXERCISE_BY_ID.get(id);

export interface TemplatePreviewExercise {
  exerciseId: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
}

export interface TemplatePreviewDay {
  name: string;
  estimatedMin: number;
  exercises: TemplatePreviewExercise[];
}

export interface TemplatePreview {
  key: string;
  name: string;
  days: TemplatePreviewDay[];
  volume: MuscleVolume[];
}

/** Full day-by-day, exercise-by-exercise preview for one template key. */
export function buildTemplatePreview(
  templateKey: string,
  equipmentAccess: GymEquipmentAccess,
  experience: TrainingExperience,
): TemplatePreview {
  const draft = instantiateTemplate(templateKey, equipmentAccess, catalogLookup);
  const routineLike = {
    days: draft.days.map((d) => ({
      name: d.name,
      exercises: d.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        restSec: e.restSec,
      })),
    })),
  };
  return {
    key: templateKey,
    name: draft.name,
    days: routineLike.days.map((d) => ({
      name: d.name,
      estimatedMin: estimateDurationMin(d, catalogLookup),
      exercises: d.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        name: catalogLookup(e.exerciseId)?.name ?? e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
      })),
    })),
    volume: volumeByGroup(routineLike, catalogLookup, experience),
  };
}

/** Every distinct exercise across a preview's days, in first-seen order. */
export function uniqueExercisesOf(
  preview: TemplatePreview,
): { exerciseId: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const day of preview.days) {
    for (const ex of day.exercises) {
      if (!seen.has(ex.exerciseId)) seen.set(ex.exerciseId, ex.name);
    }
  }
  return [...seen.entries()].map(([exerciseId, name]) => ({ exerciseId, name }));
}

/**
 * Exercises the "I know my weights" list asks about: loadable ones only, in
 * program order (mirrors web's knownWeightCandidates). Bodyweight moves start
 * from reps, so an all-bodyweight program has nothing to enter (F-GYM-2-1).
 */
export function knownWeightExercisesOf(
  preview: TemplatePreview,
): { exerciseId: string; name: string }[] {
  return uniqueExercisesOf(preview).filter(({ exerciseId }) => {
    const meta = catalogLookup(exerciseId);
    return meta?.loadType === 'WEIGHTED' && !meta.isTimed;
  });
}
