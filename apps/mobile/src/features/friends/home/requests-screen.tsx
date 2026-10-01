import { useEffect } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FRIENDS_COPY } from '@chefer/types';
import {
  duration,
  EmptyState,
  ErrorState,
  Screen,
  Text,
  useReducedMotion,
} from '@chefer/ui-mobile';
import { isFriendsUnavailableError } from '../api/friends-errors';
import { FriendsGate, FriendsUnavailableScreen } from '../components/friends-gate';
import { FriendsScreenHeader } from '../components/friends-screen-header';
import { RequestRow } from '../components/request-row';
import { ActivatedGate } from './activated-gate';
import { loadMore, useRequestsList } from './friends-lists';
import { PersonRowsSkeleton } from './skeletons';

// ─── Follow requests (UX §7.1, PRD FR-06) ─────────────────────────────────────
// Every incoming request as a RequestRow, newest first, infinite scroll. The
// subtitle says only the owner sees it. Answering removes the row (MO-04);
// after the last one the empty state fades in (MO-03).

function RequestsBody() {
  const reduced = useReducedMotion();
  const { query, people } = useRequestsList();

  // Answered rows leave page 1 without a refetch: if that empties the list
  // while the server has more, ask for the next page so the rest appear.
  const { hasNextPage, isFetchingNextPage, isFetching } = query;
  useEffect(() => {
    if (people.length === 0 && hasNextPage && !isFetchingNextPage && !isFetching) {
      void query.fetchNextPage();
    }
  }, [people.length, hasNextPage, isFetchingNextPage, isFetching, query]);

  if (isFriendsUnavailableError(query.error)) return <FriendsUnavailableScreen />;
  if (query.isError && people.length === 0) {
    return (
      <ErrorState
        testID="friends-requests-error"
        title={FRIENDS_COPY.home.sectionError('requests')}
        description=""
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isLoading) return <PersonRowsSkeleton testID="friends-requests-loading" />;

  if (people.length === 0 && !hasNextPage) {
    return (
      <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.base)}>
        <EmptyState
          testID="friends-requests-empty"
          icon={<Ionicons name="person-add-outline" size={40} color="#9ca3af" />}
          title={FRIENDS_COPY.requests.empty.title}
          description={FRIENDS_COPY.requests.empty.body}
        />
      </Animated.View>
    );
  }

  return (
    <FlatList
      testID="friends-requests-list"
      data={people}
      keyExtractor={(p) => p.id}
      initialNumToRender={20}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
        />
      }
      onEndReached={() => loadMore(query)}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <Text testID="friends-requests-subtitle" variant="muted" className="px-4 pb-2">
          {FRIENDS_COPY.requests.subtitle}
        </Text>
      }
      renderItem={({ item: person }) => (
        <Animated.View
          // MO-04: an answered row fades out and the rest settle.
          exiting={reduced ? undefined : FadeOut.duration(duration.base)}
          layout={reduced ? undefined : LinearTransition.duration(duration.base)}
        >
          <RequestRow person={person} via="requests" />
        </Animated.View>
      )}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <View className="py-4">
            <ActivityIndicator />
          </View>
        ) : null
      }
    />
  );
}

export function FriendsRequestsScreen() {
  return (
    <FriendsGate>
      <ActivatedGate title={FRIENDS_COPY.requests.title} testID="friends-requests">
        <Screen testID="friends-requests" className="px-0">
          <FriendsScreenHeader
            title={FRIENDS_COPY.requests.title}
            testID="friends-requests-header"
          />
          <RequestsBody />
        </Screen>
      </ActivatedGate>
    </FriendsGate>
  );
}
