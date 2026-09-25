// Default exercise-picker selection for the strength-trend chart (gym_plan.md
// §1.3 Stats tab #1: "the user's top 3 compounds (picker)").
import type { ExerciseDto, SessionSummaryDto } from '@chefer/types';

/**
 * The `limit` compound exercises with the most non-skipped exposures across
 * `sessions`, most frequent first (ties broken alphabetically by id for a
 * stable default). Only exercises present in `library` (and not archived)
 * are eligible, so a deleted/renamed exercise never becomes a default.
 */
export function topCompoundsByFrequency(
  sessions: Pick<SessionSummaryDto, 'exercises'>[],
  library: Pick<ExerciseDto, 'id' | 'category' | 'archived'>[],
  limit = 3,
): string[] {
  const compoundIds = new Set(
    library.filter((e) => e.category === 'COMPOUND' && !e.archived).map((e) => e.id),
  );
  const counts = new Map<string, number>();
  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (ex.skipped || !compoundIds.has(ex.exerciseId)) continue;
      counts.set(ex.exerciseId, (counts.get(ex.exerciseId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id);
}
