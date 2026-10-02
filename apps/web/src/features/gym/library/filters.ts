// Pure filtering for the exercises library page (gym_plan.md §1.3 "Exercises tab").
// The API already scopes `library` to curated + the caller's own custom
// exercises, so "Mine" is simply `ownerId !== null` — no user id needed.
import {
  ExerciseEquipment,
  LIBRARY_FILTER_GROUPS,
  type ExerciseDto,
  type LibraryFilterGroup,
} from '@chefer/types';
import { exerciseMatchesFilterGroup, LIBRARY_FILTER_GROUP_LABELS } from '@chefer/utils';

export interface LibraryFilters {
  query: string;
  muscleGroup: LibraryFilterGroup | null;
  equipment: ExerciseEquipment | null;
  mineOnly: boolean;
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  query: '',
  muscleGroup: null,
  equipment: null,
  mineOnly: false,
};

export const MUSCLE_GROUP_OPTIONS: { value: LibraryFilterGroup; label: string }[] = (
  Object.keys(LIBRARY_FILTER_GROUPS) as LibraryFilterGroup[]
).map((group) => ({ value: group, label: LIBRARY_FILTER_GROUP_LABELS[group] }));

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
  // S19 (T-42.0): cardio equipment (06 §5.3). Never sent to a level < 2
  // client, so these labels are inert until T-42.5 (web cardio render).
  TREADMILL: 'Treadmill',
  BIKE: 'Bike',
  ROWER: 'Rower',
  ELLIPTICAL: 'Elliptical',
  STAIR_CLIMBER: 'Stair climber',
  SKI_ERG: 'Ski erg',
  ASSAULT_BIKE: 'Assault bike',
  JUMP_ROPE: 'Jump rope',
  POOL: 'Pool',
  OUTDOOR: 'Outdoor',
};

export const EQUIPMENT_OPTIONS: { value: ExerciseEquipment; label: string }[] = Object.values(
  ExerciseEquipment,
).map((value) => ({ value, label: EQUIPMENT_LABELS[value] }));

/** Search + filter chips + "Mine" (gym_plan.md §1.3). Archived rows never show. */
export function filterExercises(library: ExerciseDto[], filters: LibraryFilters): ExerciseDto[] {
  const q = filters.query.trim().toLowerCase();
  return library
    .filter((e) => !e.archived)
    .filter((e) => !filters.mineOnly || e.ownerId !== null)
    .filter((e) => !filters.equipment || e.equipment === filters.equipment)
    .filter((e) => !filters.muscleGroup || exerciseMatchesFilterGroup(e, filters.muscleGroup))
    .filter(
      (e) =>
        q.length === 0 ||
        e.name.toLowerCase().includes(q) ||
        e.aliases.some((a) => a.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
