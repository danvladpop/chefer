import type { RoutineDto } from '@chefer/types';
import { routineDtoToDraft } from './mapping';
import type { RoutineDraft } from './types';

// Save conflict resolution (gym_plan.md §5.4): `routine.save` throws CONFLICT
// with `error.data.conflict = { kind: 'routine', current: RoutineDto }`
// (apps/api/src/lib/conflict.ts) when `expectedVersion` is stale. The editor
// offers "keep mine" (re-save with the newer version) or "use the other
// version" (reload the draft) — both pure so they're unit-testable without a
// live tRPC client.

/** The server's current routine from a `routine.save` CONFLICT error, or null
 * for any other error shape. */
export function extractRoutineConflict(error: unknown): RoutineDto | null {
  if (typeof error !== 'object' || error === null || !('data' in error)) return null;
  const data = (error as { data?: { conflict?: unknown } }).data;
  const conflict = data?.conflict;
  if (
    conflict !== null &&
    typeof conflict === 'object' &&
    (conflict as { kind?: unknown }).kind === 'routine'
  ) {
    return (conflict as { kind: 'routine'; current: RoutineDto }).current;
  }
  return null;
}

/** "Keep mine": resend the same local edits, stamped with the server's newer version. */
export function keepMineAfterConflict(
  draft: RoutineDraft,
  serverCurrent: RoutineDto,
): RoutineDraft {
  return { ...draft, version: serverCurrent.version };
}

/** "Use the other version": discard local edits and load the server's copy. */
export function loadTheirsAfterConflict(serverCurrent: RoutineDto): RoutineDraft {
  return routineDtoToDraft(serverCurrent);
}
