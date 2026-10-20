import { coachedOutboxes } from '../../trainer-coach/coached-outbox';
import { coachedSessionStore } from '../../trainer-coach/coached-session-store';
import { activeSessionStore } from './active-session-store';
import { outbox } from './outbox';

/**
 * Workouts that exist only on this phone: queued uploads plus a workout in progress — the trainer's
 * own and (trainer mode M3) the ones they coached for clients, which a sign-out deletes just the same.
 */
export function unsyncedGymWorkoutCount(): number {
  return (
    outbox.getState().entries.length +
    (activeSessionStore.get() ? 1 : 0) +
    coachedOutboxes.totalCount() +
    coachedSessionStore.all().length
  );
}
