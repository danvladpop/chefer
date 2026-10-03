import { activeSessionStore } from './active-session-store';
import { outbox } from './outbox';

/** Workouts that exist only on this phone: queued uploads plus a workout in progress. */
export function unsyncedGymWorkoutCount(): number {
  return outbox.getState().entries.length + (activeSessionStore.get() ? 1 : 0);
}
