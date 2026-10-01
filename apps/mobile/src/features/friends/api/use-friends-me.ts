import { useCallback, useEffect } from 'react';
import type { FriendsMeDto } from '@chefer/types';
import { trpc } from '../../../lib/trpc';
import { isFriendsUnavailableError } from './friends-errors';
import { useFriendsAvailability } from './use-friends-availability';

// ─── Following: `friends.me` + the badge (UX §2.1, PRD E10) ──────────────────
// THIS IS THE NOTIFICATION MECHANISM. There is no push and no email (PRD
// Q-F-14): the badge on More / the More tab / the home's Activity bell is
// `friends.me.badgeCount` (pending requests + unread Activity), kept fresh by
//   • a 60 s poll while the app is in the foreground (TanStack pauses
//     `refetchInterval` in the background: focusManager is fed by AppState in
//     gym/offline/connectivity.ts, and `refetchIntervalInBackground` is off);
//   • a refetch whenever the app returns to the foreground
//     (`refetchOnWindowFocus: 'always'`, the same AppState signal);
//   • a refetch when a screen using `useFriendsBadge` regains focus.
// It never runs while `friends.availability` is off.

/** Foreground poll interval for the badge (UX §2.1). */
export const FRIENDS_BADGE_POLL_MS = 60_000;

export type FriendsMeState = {
  /** `friends.availability` said yes. When false, `me` is always undefined. */
  available: boolean;
  /** The caller's social profile summary (activated or not), once loaded. */
  me: FriendsMeDto | undefined;
  /** Pending requests + unread Activity; 0 while off, loading or not activated. */
  badgeCount: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

export function useFriendsMe(): FriendsMeState {
  const { enabled: available } = useFriendsAvailability();
  const utils = trpc.useUtils();
  const query = trpc.friends.me.useQuery(undefined, {
    enabled: available,
    refetchInterval: available ? FRIENDS_BADGE_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    retry: false,
  });

  // Switched off while the app was open (kill switch): re-ask availability so
  // every entry point disappears instead of showing a stale badge.
  const switchedOff = isFriendsUnavailableError(query.error);
  useEffect(() => {
    if (switchedOff) void utils.friends.availability.invalidate();
  }, [switchedOff, utils]);

  const { refetch: refetchQuery } = query;
  const refetch = useCallback(() => {
    if (available) void refetchQuery();
  }, [available, refetchQuery]);

  const me = available ? query.data : undefined;
  return {
    available,
    me,
    badgeCount: me?.activated ? Math.max(0, me.badgeCount) : 0,
    isLoading: available && query.isLoading,
    isError: available && query.isError,
    refetch,
  };
}
