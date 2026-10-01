import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import { ErrorState, Screen, Skeleton } from '@chefer/ui-mobile';
import { useFriendsMe } from '../api/use-friends-me';
import { FriendsScreenHeader } from '../components/friends-screen-header';

// ─── Activated gate (the sub-screens: requests, Activity, suggestions) ────────
// Those routes can be reached by a stale link before the person turned
// Following on (their queries would answer `friendsNotActivated`). Until `me`
// says activated they render a skeleton; a person who isn't goes back to the
// intro at `/friends`. Always rendered inside `FriendsGate` (availability).

export function ActivatedGate({
  title,
  testID,
  children,
}: {
  title: string;
  testID: string;
  children: ReactNode;
}) {
  const { me, isLoading, isError, refetch } = useFriendsMe();
  if (me?.activated) return <>{children}</>;
  if (me && !me.activated) return <Redirect href="/friends" />;
  return (
    <Screen testID={testID} className="px-0">
      <FriendsScreenHeader title={title} testID={`${testID}-header`} />
      {isError && !isLoading ? (
        <ErrorState
          testID={`${testID}-error`}
          title={FRIENDS_COPY.home.sectionError('list')}
          description=""
          onRetry={refetch}
        />
      ) : (
        <View className="gap-1 px-4 py-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </View>
      )}
    </Screen>
  );
}
