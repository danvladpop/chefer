import { useEffect, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FRIENDS_COPY, FRIENDS_LIMITS, type FriendUserSummary } from '@chefer/types';
import {
  duration,
  EmptyState,
  ErrorState,
  Text,
  timing,
  useReducedMotion,
} from '@chefer/ui-mobile';
import { track } from '../../../lib/analytics';
import { friendsErrorData } from '../api/friends-errors';
import { useInvite } from '../components/invite';
import { PersonRow } from '../components/person-row';
import { RelationButton } from '../components/relation-button';
import { loadMore, useSearchResults } from './friends-lists';
import { PersonRowsSkeleton } from './skeletons';

// ─── Search by name (UX §6, PRD FR-07, E3) ────────────────────────────────────
// The home's field swaps the list body for these results. NAME ONLY: there is
// no email field, no email hint and no email matching (PRD Q-F-5).
//   1 character        `Keep typing…`, no request
//   ≥ 2, debouncing    the previous results stay, dimmed to 60% (`duration.fast`),
//                      or 3 skeleton rows on the first search
//   results            PersonRow + RelationButton sm; `Follows you` / `Followed by {name}`
//   no results         `No one found for “{query}”` + Invite someone
//   rate limited       inline `Too many searches. Try again in a minute.`
//   error              compact ErrorState + Try again
// After each settled search the count is announced and `friends_search` is
// tracked (a bucket, never the query or anyone's id).

export const SEARCH_DIMMED_OPACITY = 0.6;

type Bucket = '0' | '1' | '2-5' | '6+';
export function searchBucket(count: number): Bucket {
  if (count === 0) return '0';
  if (count === 1) return '1';
  return count <= 5 ? '2-5' : '6+';
}

/** `Follows you`, `Followed by {name}` (someone I follow follows them), or nothing. */
export function searchSecondary(
  person: FriendUserSummary & { mutualName?: string },
): string | null {
  if (person.followsYou) return FRIENDS_COPY.reason.followsYou;
  if (person.mutualName) return FRIENDS_COPY.reason.mutualOne(person.mutualName);
  return null;
}

function announce(message: string): void {
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // No accessibility service (tests, some Android builds).
  }
}

export type SearchResultsProps = {
  /** The debounced query (the field's text after 250 ms of quiet, or on submit). */
  query: string;
  /** The field's text differs from `query`: a new search is about to start. */
  pending: boolean;
  online: boolean;
};

export function SearchResults({ query, pending, online }: SearchResultsProps) {
  const reduced = useReducedMotion();
  const { active, query: search, results } = useSearchResults(query);
  const trimmed = query.trim();
  const invite = useInvite();

  const dim = pending || search.isPlaceholderData;
  const opacity = useSharedValue(1);
  useEffect(() => {
    const target = dim ? SEARCH_DIMMED_OPACITY : 1;
    if (reduced) opacity.set(target);
    else opacity.set(withTiming(target, timing(duration.fast)));
  }, [dim, reduced, opacity]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  // One announcement + one analytics event per settled search.
  const settledFor = useRef<string | null>(null);
  const settled = active && search.isSuccess && !search.isPlaceholderData && !search.isFetching;
  const firstPageCount = search.data?.pages[0]?.items.length ?? 0;
  useEffect(() => {
    if (!settled || settledFor.current === trimmed) return;
    settledFor.current = trimmed;
    announce(FRIENDS_COPY.search.announce(results.length));
    track('friends_search', { resultBucket: searchBucket(firstPageCount) });
  }, [settled, trimmed, results.length, firstPageCount]);

  if (trimmed.length < FRIENDS_LIMITS.searchMinChars) {
    return (
      <Text testID="friends-search-hint" variant="muted" className="px-4 py-3">
        {FRIENDS_COPY.search.keepTyping}
      </Text>
    );
  }

  const code = friendsErrorData(search.error).code;
  if (search.isError && code === 'TOO_MANY_REQUESTS') {
    return (
      <Text
        testID="friends-search-rate-limited"
        accessibilityRole="alert"
        variant="muted"
        className="px-4 py-3"
      >
        {FRIENDS_COPY.search.rateLimited}
      </Text>
    );
  }
  if (search.isError && results.length === 0) {
    return (
      <ErrorState
        testID="friends-search-error"
        title={FRIENDS_COPY.search.error}
        description=""
        onRetry={() => void search.refetch()}
      />
    );
  }
  if (search.isLoading) return <PersonRowsSkeleton testID="friends-search-loading" />;

  if (results.length === 0 && !pending) {
    return (
      <EmptyState
        testID="friends-search-empty"
        icon={<Ionicons name="search-outline" size={40} color="#9ca3af" />}
        title={FRIENDS_COPY.search.noResults.title(trimmed)}
        description={FRIENDS_COPY.search.noResults.body}
        action={{
          label: FRIENDS_COPY.invite.cta,
          testID: 'friends-search-invite',
          onPress: () => void invite(),
        }}
      />
    );
  }

  return (
    <Animated.View style={[{ flex: 1 }, dimStyle]}>
      <FlatList
        testID="friends-search-list"
        data={results}
        keyExtractor={(p) => p.id}
        initialNumToRender={20}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onEndReached={() => loadMore(search)}
        onEndReachedThreshold={0.5}
        renderItem={({ item: person }) => (
          <PersonRow
            testID={`friends-search-result-${person.id}`}
            person={person}
            secondary={searchSecondary(person)}
            trailing={
              <RelationButton
                testID={`friends-search-result-${person.id}-relation`}
                userId={person.id}
                relation={person.relation}
                followsYou={person.followsYou}
                name={person.displayName}
                firstName={person.firstName}
                source="search"
                disabled={!online}
              />
            }
          />
        )}
        ListFooterComponent={
          search.isFetchingNextPage ? (
            <View className="items-center py-4">
              <ActivityIndicator />
            </View>
          ) : null
        }
      />
    </Animated.View>
  );
}
