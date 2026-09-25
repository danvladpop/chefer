import {
  ExerciseEquipment,
  MUSCLE_LABELS,
  VOLUME_GROUPS,
  type ExerciseDto,
  type VolumeGroup,
} from '@chefer/types';
import { filterExercises } from '../library/exercise-picker';

// Exercises-tab-specific filtering on top of the shared `filterExercises`
// (query + muscle group): equipment and "Mine" (custom exercises), which the
// shared picker doesn't need for its swap/add use cases.

export const MUSCLE_GROUP_FILTERS: { value: VolumeGroup; label: string }[] = (
  Object.keys(VOLUME_GROUPS) as VolumeGroup[]
).map((group) => ({
  value: group,
  label: (MUSCLE_LABELS as Record<string, string | undefined>)[group] ?? group,
}));

const EQUIPMENT_LABELS: Record<string, string> = {
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

export const EQUIPMENT_FILTERS: { value: string; label: string }[] = Object.values(
  ExerciseEquipment,
).map((value) => ({ value, label: EQUIPMENT_LABELS[value] ?? value }));

export interface ExercisesTabFilters {
  query: string;
  group: VolumeGroup | null;
  equipment: string | null;
  mineOnly: boolean;
}

export function filterExercisesForTab(
  library: ExerciseDto[],
  filters: ExercisesTabFilters,
): ExerciseDto[] {
  return filterExercises(library, { query: filters.query, group: filters.group })
    .filter((e) => !filters.equipment || e.equipment === filters.equipment)
    .filter((e) => !filters.mineOnly || e.ownerId !== null);
}
