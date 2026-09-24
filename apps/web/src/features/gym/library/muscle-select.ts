// Pure helpers for the custom-exercise form's muscle checkboxes (gym_plan.md
// §1.3 "Create custom exercise"): toggling respects the schema's caps
// (primaryMuscles ≤ 4, secondaryMuscles ≤ 6 — customExerciseInputSchema).
import type { Muscle } from '@chefer/types';

/** Adds `muscle` if absent (and under `max`), removes it if present. */
export function toggleMuscle(list: Muscle[], muscle: Muscle, max: number): Muscle[] {
  if (list.includes(muscle)) {
    return list.filter((m) => m !== muscle);
  }
  return list.length >= max ? list : [...list, muscle];
}

export function removeMuscle(list: Muscle[], muscle: Muscle): Muscle[] {
  return list.filter((m) => m !== muscle);
}
