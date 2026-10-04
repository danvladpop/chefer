// Gym Today's "Ana updated your routine · 2 Oct" stays until the client opens the
// routine. The seen-marker lives on this device only (spec §2.6: no server state).

const PREFIX = 'chefer.coaching.routineSeen.';

/** Remember that the routine changed at `changedAt` has been looked at. */
export function markRoutineSeen(routineId: string, changedAt: string): void {
  try {
    window.localStorage.setItem(`${PREFIX}${routineId}`, changedAt);
  } catch {
    // Storage blocked: the line simply stays.
  }
}

/** True when the change at `changedAt` has not been opened yet. */
export function isRoutineChangeUnseen(routineId: string, changedAt: string): boolean {
  try {
    const seen = window.localStorage.getItem(`${PREFIX}${routineId}`);
    return seen === null || new Date(seen).getTime() < new Date(changedAt).getTime();
  } catch {
    return true;
  }
}
