// Pure transitions for the routine-save CONFLICT dialog (gym_plan.md §5.4):
// `gym.routine.save` throws CONFLICT with `error.data.conflict.current` (the
// server's current RoutineDto) when `expectedVersion` is stale. Kept separate
// from the edit page's React state so the decision logic is unit-testable.
import type { RoutineDto } from '@chefer/types';
import { fromRoutineDto, type DraftRoutine } from './draft';

/** "Keep mine": resubmit the same draft against the server's current version. */
export function keepMineExpectedVersion(current: RoutineDto): number {
  return current.version;
}

/** "Use theirs": discard local edits and adopt the server's current document as the new baseline. */
export function resolveTheirsDraft(current: RoutineDto): {
  draft: DraftRoutine;
  baseline: DraftRoutine;
  version: number;
} {
  const seeded = fromRoutineDto(current);
  return { draft: seeded, baseline: seeded, version: current.version };
}
