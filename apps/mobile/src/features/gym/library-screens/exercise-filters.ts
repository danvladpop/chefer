import {
  ExerciseEquipment,
  VOLUME_GROUPS,
  type ExerciseDto,
  type VolumeGroup,
} from '@chefer/types';
import { VOLUME_GROUP_LABELS } from '@chefer/utils';
import { filterExercises, type PickerFilter } from '../library/exercise-picker';

// Exercises-tab-specific filtering on top of the shared `filterExercises`
// (query + muscle group): equipment and "Mine" (custom exercises), which the
// shared picker doesn't need for its swap/add use cases.

export const MUSCLE_GROUP_FILTERS: { value: VolumeGroup; label: string }[] = (
  Object.keys(VOLUME_GROUPS) as VolumeGroup[]
).map((group) => ({
  value: group,
  // R-21: the volume-group labels (a group like `back` is not a single muscle,
  // so MUSCLE_LABELS has no entry and the raw key showed up lowercase).
  label: VOLUME_GROUP_LABELS[group],
}));

/** T-42.3 (AC9): "Cardio" first, ahead of every muscle group — behind cardioLogging (the caller gates it). */
export const MUSCLE_GROUP_FILTERS_WITH_CARDIO: { value: PickerFilter; label: string }[] = [
  { value: 'CARDIO', label: 'Cardio' },
  ...MUSCLE_GROUP_FILTERS,
];

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
  group: PickerFilter | null;
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
