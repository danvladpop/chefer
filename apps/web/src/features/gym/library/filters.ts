// Pure filtering for the exercises library page (gym_plan.md §1.3 "Exercises tab").
// The API already scopes `library` to curated + the caller's own custom
// exercises, so "Mine" is simply `ownerId !== null` — no user id needed.
import {
  ExerciseEquipment,
  VOLUME_GROUPS,
  type ExerciseDto,
  type VolumeGroup,
} from '@chefer/types';
import { VOLUME_GROUP_LABELS } from '@chefer/utils';

export interface LibraryFilters {
  query: string;
  muscleGroup: VolumeGroup | null;
  equipment: ExerciseEquipment | null;
  mineOnly: boolean;
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  query: '',
  muscleGroup: null,
  equipment: null,
  mineOnly: false,
};

export const MUSCLE_GROUP_OPTIONS: { value: VolumeGroup; label: string }[] = (
  Object.keys(VOLUME_GROUPS) as VolumeGroup[]
).map((group) => ({ value: group, label: VOLUME_GROUP_LABELS[group] }));

export const EQUIPMENT_LABELS: Record<ExerciseEquipment, string> = {
  BARBELL: 'Barbell',
  DUMBBELL: 'Dumbbell',
  CABLE: 'Cable',
  MACHINE: 'Machine',
  BODYWEIGHT: 'Bodyweight',
  SMITH: 'Smith machine',
  EZ_BAR: 'EZ bar',
  KETTLEBELL: 'Kettlebell',
  BAND: 'Band',
  ASSISTED: 'Assisted',
};

export const EQUIPMENT_OPTIONS: { value: ExerciseEquipment; label: string }[] = Object.values(
  ExerciseEquipment,
).map((value) => ({ value, label: EQUIPMENT_LABELS[value] }));

function matchesGroup(exercise: ExerciseDto, group: VolumeGroup): boolean {
  const muscles: readonly string[] = VOLUME_GROUPS[group];
  return (
    exercise.primaryMuscles.some((m) => muscles.includes(m)) ||
    exercise.secondaryMuscles.some((m) => muscles.includes(m))
  );
}

/** Search + filter chips + "Mine" (gym_plan.md §1.3). Archived rows never show. */
export function filterExercises(library: ExerciseDto[], filters: LibraryFilters): ExerciseDto[] {
  const q = filters.query.trim().toLowerCase();
  return library
    .filter((e) => !e.archived)
    .filter((e) => !filters.mineOnly || e.ownerId !== null)
    .filter((e) => !filters.equipment || e.equipment === filters.equipment)
    .filter((e) => !filters.muscleGroup || matchesGroup(e, filters.muscleGroup))
    .filter(
      (e) =>
        q.length === 0 ||
        e.name.toLowerCase().includes(q) ||
        e.aliases.some((a) => a.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
