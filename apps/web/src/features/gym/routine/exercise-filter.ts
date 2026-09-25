// Search + muscle-group filter over the bootstrap library, shared by the
// routine editor's exercise picker. Mirrors apps/mobile's
// src/features/gym/library/exercise-picker.tsx filterExercises so both
// platforms agree on what "matches" means; kept local per G5-B's file
// ownership (apps/web/src/features/gym/routine/**).
import { VOLUME_GROUPS, type ExerciseDto, type VolumeGroup } from '@chefer/types';

export interface ExerciseFilterOptions {
  query: string;
  group: VolumeGroup | null;
  excludeIds?: readonly string[] | undefined;
}

function matchesGroup(exercise: ExerciseDto, group: VolumeGroup): boolean {
  const muscles: readonly string[] = VOLUME_GROUPS[group];
  return exercise.primaryMuscles.some((m) => muscles.includes(m));
}

export function filterExercises(
  library: ExerciseDto[],
  opts: ExerciseFilterOptions,
): ExerciseDto[] {
  const q = opts.query.trim().toLowerCase();
  const exclude = opts.excludeIds ?? [];
  return library
    .filter((e) => !e.archived && !exclude.includes(e.id))
    .filter((e) => (opts.group ? matchesGroup(e, opts.group) : true))
    .filter((e) =>
      q.length === 0
        ? true
        : e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Same-swap-group alternatives first (research: "suggests same-swap-group alternatives first"). */
export function sortBySwapGroupFirst(
  exercises: ExerciseDto[],
  preferSwapGroup: string | null | undefined,
): ExerciseDto[] {
  if (!preferSwapGroup) return exercises;
  const similar = exercises.filter((e) => e.swapGroup === preferSwapGroup);
  const rest = exercises.filter((e) => e.swapGroup !== preferSwapGroup);
  return [...similar, ...rest];
}
