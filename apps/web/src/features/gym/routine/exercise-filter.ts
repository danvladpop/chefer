// Search + muscle-group filter over the bootstrap library, shared by the
// routine editor's exercise picker. Mirrors apps/mobile's
// src/features/gym/library/exercise-picker.tsx filterExercises so both
// platforms agree on what "matches" means; kept local per G5-B's file
// ownership (apps/web/src/features/gym/routine/**).
import type { ExerciseDto, LibraryFilterGroup } from '@chefer/types';
import { exerciseMatchesFilterGroup } from '@chefer/utils';
import { isCardioExercise } from '../shared/cardio';

export interface ExerciseFilterOptions {
  query: string;
  group: LibraryFilterGroup | null;
  excludeIds?: readonly string[] | undefined;
}

export function filterExercises(
  library: ExerciseDto[],
  opts: ExerciseFilterOptions,
): ExerciseDto[] {
  const q = opts.query.trim().toLowerCase();
  const exclude = opts.excludeIds ?? [];
  return (
    library
      // T-42.5 (Q-31): the web renders cardio but never logs it — pickers exclude it.
      .filter((e) => !e.archived && !exclude.includes(e.id) && !isCardioExercise(e))
      .filter((e) => (opts.group ? exerciseMatchesFilterGroup(e, opts.group) : true))
      .filter((e) =>
        q.length === 0
          ? true
          : e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  );
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
