import { isNetworkError, isServerError } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';

// ─── Trainer coaching: availability gate (WP-18, spec §11) ────────────────────
// `coaching.availability` is the ONLY coaching procedure that answers while the `coaching` flag is off
// (it is never gated). Every entry point — the "Trainer tools" rows in More and Settings (lane D),
// every /trainer route — asks it first. A pending, failed or absent answer means OFF: nothing renders
// and no `trainer.*` query runs. An old API with no `coaching` router answers 404, which is off too.

/** How long a "yes"/"no" is trusted before the next mount/foreground re-asks. */
export const COACHING_AVAILABILITY_STALE_MS = 5 * 60_000;

export type CoachingAvailabilityState = {
  /** The coaching flag (or allowlist) is on for this user. */
  enabled: boolean;
  /** `enabled` AND the user may turn trainer tools on (TRAINER_ALLOWLIST). */
  canBeTrainer: boolean;
  /** First answer still in flight (treat as off; render no placeholder). */
  isLoading: boolean;
  /** The check could not be made (offline, 5xx) — not an answer: offer Retry, not "unavailable". */
  unreachable: boolean;
  retry: () => void;
};

export function useCoachingAvailability(): CoachingAvailabilityState {
  const query = trpc.coaching.availability.useQuery(undefined, {
    staleTime: COACHING_AVAILABILITY_STALE_MS,
    // A 4xx (old API, signed out) is an answer: off. Don't hammer it.
    retry: false,
  });
  const ok = !query.isError;
  return {
    enabled: ok && query.data?.enabled === true,
    canBeTrainer: ok && query.data?.canBeTrainer === true,
    isLoading: query.isLoading,
    unreachable:
      // Offline with no answer yet (the request is paused, not failed) is "couldn't ask", not "off".
      (query.isPending && query.fetchStatus === 'paused') ||
      (query.isError &&
        query.data === undefined &&
        (isNetworkError(query.error) || isServerError(query.error))),
    retry: () => {
      void query.refetch();
    },
  };
}

/**
 * True when a "Trainer tools" entry point may render (More, Settings): the user is allowed to be a
 * trainer. Lane D's entry rows use this; the /trainer routes gate themselves with `TrainerGate`.
 */
export function useTrainerToolsAvailable(): boolean {
  return useCoachingAvailability().canBeTrainer;
}
