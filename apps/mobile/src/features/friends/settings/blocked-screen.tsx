import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FRIENDS_COPY, type FriendUserSummary } from '@chefer/types';
import {
  Button,
  duration,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
  useReducedMotion,
} from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';
import { FriendsGate } from '../components/friends-gate';
import { FriendsScreenHeader } from '../components/friends-screen-header';
import { PersonRow } from '../components/person-row';
import { FRIENDS_SCREEN_TITLES } from '../components/screen-titles';
import { UnblockConfirmSheet } from '../safety/safety-confirm-sheets';

// ─── Blocked people (`/friends/blocked`, UX §11.6, FR-13.3) ────────────────────
// A plain list (PersonRow, not pressable: a blocked profile is unreachable)
// with an `Unblock` outline button per row → `Unblock {first}?` confirm → the
// row exits (MO-04: fade, `duration.base`; instant under reduced motion). The
// removal itself is core's `useUnblock` (cache write + refetch marks).
// 20 per page, infinite scroll.

function BlockedBody() {
  const query = trpc.friends.blocked.useInfiniteQuery(
    {},
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const reduced = useReducedMotion();
  const [target, setTarget] = useState<FriendUserSummary | null>(null);
  const [visible, setVisible] = useState(false);

  const people = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isLoading) {
    return (
      <View testID="friends-blocked-loading" className="gap-3 px-4 pt-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </View>
    );
  }
  if (query.isError && people.length === 0) {
    return (
      <ErrorState
        testID="friends-blocked-error"
        title={FRIENDS_COPY.home.sectionError('list')}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <>
      <FlatList
        testID="friends-blocked-list"
        data={people}
        keyExtractor={(person) => person.id}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
          />
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        ListEmptyComponent={
          <EmptyState
            testID="friends-blocked-empty"
            icon={<Ionicons name="ban-outline" size={40} color="#9ca3af" />}
            title={FRIENDS_COPY.blocked.empty}
          />
        }
        renderItem={({ item }) => (
          <Animated.View exiting={FadeOut.duration(reduced ? 0 : duration.base)}>
            <PersonRow
              person={item}
              onPress={false}
              testID={`friends-blocked-row-${item.id}`}
              trailing={
                <Button
                  testID={`friends-blocked-unblock-${item.id}`}
                  variant="outline"
                  size="sm"
                  accessibilityLabel={`${FRIENDS_COPY.unblock.cta} ${item.displayName}`}
                  onPress={() => {
                    setTarget(item);
                    setVisible(true);
                  }}
                >
                  {FRIENDS_COPY.unblock.cta}
                </Button>
              }
            />
          </Animated.View>
        )}
      />
      {target ? (
        <UnblockConfirmSheet
          visible={visible}
          person={{ id: target.id, firstName: target.firstName }}
          onClose={() => setVisible(false)}
          onExited={() => setTarget(null)}
        />
      ) : null}
    </>
  );
}

export function FriendsBlockedScreen() {
  return (
    <FriendsGate>
      <Screen testID="friends-blocked" className="px-0">
        <FriendsScreenHeader
          title={FRIENDS_SCREEN_TITLES.blocked}
          testID="friends-blocked-header"
        />
        <BlockedBody />
      </Screen>
    </FriendsGate>
  );
}
