import { trpc } from '../../../lib/trpc';

// ─── Following: availability gate (implementation-plan §8) ────────────────────
// `friends.availability` is the ONLY friends procedure that answers while the
// `friends` flag is off (or the user isn't on FRIENDS_ALLOWLIST), and the
// only one any entry point may call before it says yes. Every entry point
// (More row, More tab badge, Settings row, privacy row) and every other
// `friends.*` query is gated on `enabled` from here.
//
// A failed, pending or absent response means OFF: nothing renders, and the
// rest of the namespace stays silent. An old API with no `friends` router
// answers 404 → off as well.

/** How long a "yes"/"no" is trusted before the next mount/foreground re-asks. */
export const FRIENDS_AVAILABILITY_STALE_MS = 5 * 60_000;

export type FriendsAvailability = {
  /** True only after the server said `{ enabled: true }`. */
  enabled: boolean;
  /** First answer still in flight (treat as off; don't render a placeholder). */
  isLoading: boolean;
};

export function useFriendsAvailability(): FriendsAvailability {
  const query = trpc.friends.availability.useQuery(undefined, {
    staleTime: FRIENDS_AVAILABILITY_STALE_MS,
    // A 4xx (old API, signed out) is an answer: off. Don't hammer it.
    retry: false,
  });
  return {
    enabled: query.data?.enabled === true && !query.isError,
    isLoading: query.isLoading,
  };
}
