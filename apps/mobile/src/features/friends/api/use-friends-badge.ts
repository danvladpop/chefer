import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useFriendsMe, type FriendsMeState } from './use-friends-me';

/**
 * `useFriendsMe` + a refetch each time the calling screen regains focus (UX
 * §2.1 "refetched on app focus"): coming back to More from Following, a
 * profile or Activity shows the new count at once instead of on the next
 * 60 s tick. The first focus is skipped — the mount already fetched.
 */
export function useFriendsBadge(): FriendsMeState {
  const state = useFriendsMe();
  const { refetch } = state;
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) refetch();
      focusedBefore.current = true;
    }, [refetch]),
  );
  return state;
}
