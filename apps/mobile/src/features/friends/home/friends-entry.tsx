import { useRef } from 'react';
import { View } from 'react-native';
import { FRIENDS_COPY, type ActivateResultDto, type ProfileVisibility } from '@chefer/types';
import { ErrorState, Screen, Skeleton, useSnackbar } from '@chefer/ui-mobile';
import { useFriendsBadge } from '../api/use-friends-badge';
import { FriendsScreenHeader } from '../components/friends-screen-header';
import { FriendsHome } from './home-screen';
import { FriendsIntro } from './intro';
import { PersonRowsSkeleton } from './skeletons';

// ─── `/friends`: the intro, or the home (UX §4, §5) ───────────────────────────
// `friends.me.activated === false` → the intro; otherwise the home. The entry
// outlives the switch from one to the other, so it owns what happens right
// after turning Following on: the snackbar `Following is on. …`, then — queued
// after it — the hidden-recipes line when the word filter hid some.

/** Gap before the second snackbar (the first is on screen ~6 s; this reads as "after it"). */
export const ACTIVATED_SNACKBAR_GAP_MS = 6_500;

function HomeSkeleton() {
  return (
    <Screen testID="friends-home-loading" className="px-0">
      <FriendsScreenHeader title={FRIENDS_COPY.home.title} testID="friends-home-loading-header" />
      <View className="gap-3 pt-1">
        <View className="px-4">
          <Skeleton className="h-11 w-full rounded-full" />
        </View>
        <PersonRowsSkeleton count={3} />
        <View className="px-4">
          <Skeleton className="h-8 w-full rounded-lg" />
        </View>
        <PersonRowsSkeleton count={3} />
      </View>
    </Screen>
  );
}

export function FriendsEntry() {
  const { me, badgeCount, isLoading, isError, refetch } = useFriendsBadge();
  const snackbar = useSnackbar();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onActivated = (result: ActivateResultDto, visibility: ProfileVisibility) => {
    snackbar.show({
      message:
        visibility === 'PUBLIC' ? FRIENDS_COPY.activated.public : FRIENDS_COPY.activated.private,
      tone: 'success',
    });
    if (result.filterHiddenRecipes > 0) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        snackbar.show({ message: FRIENDS_COPY.activated.filterHidden(result.filterHiddenRecipes) });
      }, ACTIVATED_SNACKBAR_GAP_MS);
    }
  };

  if (!me) {
    if (isError && !isLoading) {
      return (
        <Screen testID="friends-home-error" className="px-0">
          <FriendsScreenHeader title={FRIENDS_COPY.home.title} testID="friends-home-error-header" />
          <ErrorState
            title={FRIENDS_COPY.home.sectionError('list')}
            description=""
            onRetry={refetch}
          />
        </Screen>
      );
    }
    return <HomeSkeleton />;
  }
  if (!me.activated) return <FriendsIntro me={me} onActivated={onActivated} />;
  return <FriendsHome me={me} unread={badgeCount} refetchMe={refetch} />;
}
