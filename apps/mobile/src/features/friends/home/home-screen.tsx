import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  FRIENDS_COPY,
  FRIENDS_LIMITS,
  type FriendsMeDto,
  type FriendUserSummary,
} from '@chefer/types';
import {
  colors,
  duration,
  EmptyState,
  ErrorState,
  keyboardDismissMode,
  Screen,
  SearchField,
  SegmentedControl,
  Text,
  useReducedMotion,
} from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';
import { isFriendsNotActivatedError, isFriendsUnavailableError } from '../api/friends-errors';
import { useIsOnline } from '../api/use-is-online';
import { FollowingHeader } from '../components/following-header';
import { FriendsUnavailableScreen } from '../components/friends-gate';
import { InviteCard, useInvite } from '../components/invite';
import { PersonRow } from '../components/person-row';
import { RelationButton } from '../components/relation-button';
import { RequestRow } from '../components/request-row';
import { formatSavedTime } from './activity-time';
import { useFollowerActions } from './follower-actions';
import {
  loadMore,
  useFollowersList,
  useFollowingList,
  useRequestsList,
  useSuggestions,
} from './friends-lists';
import { SearchResults } from './search-results';
import { PersonRowsSkeleton } from './skeletons';
import { SuggestionRow, type SuggestionRowData } from './suggestion-row';

// ─── Following home (UX §5, PRD FR-06–FR-09) ──────────────────────────────────
// One virtualised FlatList of section rows under the fixed header and search
// field: Requests (≤ 3 + See all), the `You follow | Followers` segmented
// lists (20 per page, infinite scroll) and Suggested for you (≤ 5). Searching
// swaps the list body for the results and keeps this list mounted (hidden), so
// clearing the field restores the sections with the scroll position preserved
// (UX §6). Pull to refresh refetches everything, including the badge. A
// failed section shows its own compact error and the others still render: a
// failed load never looks empty.

const REQUESTS_PREVIEW = 3;

type Segment = 'following' | 'followers';
/** `You follow | Followers`, remembered for the session (UX §5.1). */
let rememberedSegment: Segment = 'following';

/** Test hook: the remembered segment is module state. */
export function resetRememberedSegment(): void {
  rememberedSegment = 'following';
}

type Row =
  | { type: 'requestsHeader'; key: string; count: number }
  | { type: 'request'; key: string; person: FriendUserSummary }
  | { type: 'requestsAll'; key: string; count: number }
  | { type: 'requestsError'; key: string }
  | { type: 'segments'; key: string }
  | { type: 'skeleton'; key: string }
  | { type: 'listError'; key: string }
  | { type: 'listEmpty'; key: string }
  | { type: 'person'; key: string; person: FriendUserSummary; segment: Segment }
  | { type: 'listMore'; key: string }
  | { type: 'suggestionsHeader'; key: string; showAll: boolean }
  | { type: 'suggestion'; key: string; person: SuggestionRowData }
  | { type: 'suggestionsEmpty'; key: string }
  | { type: 'suggestionsError'; key: string };

function SectionHeading({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text
      testID={testID}
      accessibilityRole="header"
      variant="muted"
      className="px-4 pb-1 pt-4 text-xs font-medium uppercase"
    >
      {children}
    </Text>
  );
}

export type FriendsHomeProps = {
  me: FriendsMeDto;
  unread: number;
  refetchMe: () => void;
};

export function FriendsHome({ me, unread, refetchMe }: FriendsHomeProps) {
  const reduced = useReducedMotion();
  const online = useIsOnline();
  const utils = trpc.useUtils();
  const invite = useInvite();
  const followerActions = useFollowerActions();

  const [segment, setSegmentState] = useState<Segment>(rememberedSegment);
  const setSegment = (next: Segment) => {
    rememberedSegment = next;
    setSegmentState(next);
  };

  // `/friends?list=followers` (Sharing & privacy › Private confirm › Review
  // followers) opens on Followers, also when it updates a mounted home.
  const { list: listParam } = useLocalSearchParams<{ list?: string }>();
  useEffect(() => {
    if (listParam === 'followers') {
      rememberedSegment = 'followers';
      setSegmentState('followers');
    }
  }, [listParam]);

  // Search: `raw` is what's typed, `query` the debounced value (250 ms / submit).
  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState('');
  const searching = raw.trim().length > 0;

  const requests = useRequestsList();
  const following = useFollowingList(segment === 'following');
  const followers = useFollowersList(segment === 'followers');
  const suggestions = useSuggestions(FRIENDS_LIMITS.suggestionsHome);
  const list = segment === 'following' ? following : followers;

  // Switched off, or turned off on another device, while the screen is open.
  const errors = [requests.query.error, list.query.error, suggestions.error];
  const unavailable = errors.some(isFriendsUnavailableError);
  const notActivated = errors.some(isFriendsNotActivatedError);
  useEffect(() => {
    if (notActivated) void utils.friends.me.invalidate();
  }, [notActivated, utils]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    refetchMe();
    await Promise.allSettled([
      requests.query.refetch(),
      list.query.refetch(),
      suggestions.refetch(),
    ]);
    setRefreshing(false);
  }, [refetchMe, requests.query, list.query, suggestions]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    // Requests: only when there are some; a failed load says so.
    if (requests.people.length > 0) {
      const count = Math.max(requests.people.length, me.counts.pendingRequests);
      out.push({ type: 'requestsHeader', key: 'requests-h', count });
      for (const person of requests.people.slice(0, REQUESTS_PREVIEW)) {
        out.push({ type: 'request', key: `request-${person.id}`, person });
      }
      if (count > REQUESTS_PREVIEW) out.push({ type: 'requestsAll', key: 'requests-all', count });
    } else if (requests.query.isError) {
      out.push({ type: 'requestsError', key: 'requests-error' });
    }

    // You follow | Followers.
    out.push({ type: 'segments', key: 'segments' });
    if (list.query.isLoading) out.push({ type: 'skeleton', key: 'list-skeleton' });
    else if (list.query.isError && list.people.length === 0) {
      out.push({ type: 'listError', key: 'list-error' });
    } else if (list.people.length === 0) out.push({ type: 'listEmpty', key: 'list-empty' });
    else {
      for (const person of list.people) {
        out.push({ type: 'person', key: `${segment}-${person.id}`, person, segment });
      }
      if (list.query.isFetchingNextPage) out.push({ type: 'listMore', key: 'list-more' });
    }

    // Suggested for you.
    const suggested = suggestions.data ?? [];
    if (suggestions.isError && suggestions.data === undefined) {
      out.push({ type: 'suggestionsHeader', key: 'suggestions-h', showAll: false });
      out.push({ type: 'suggestionsError', key: 'suggestions-error' });
    } else if (suggested.length > 0) {
      out.push({ type: 'suggestionsHeader', key: 'suggestions-h', showAll: true });
      for (const person of suggested) {
        out.push({ type: 'suggestion', key: `suggestion-${person.id}`, person });
      }
    } else if (suggestions.isSuccess) {
      out.push({ type: 'suggestionsEmpty', key: 'suggestions-empty' });
    }
    return out;
  }, [requests, list, segment, suggestions, me.counts.pendingRequests]);

  if (unavailable) return <FriendsUnavailableScreen />;

  const savedAt = list.query.dataUpdatedAt || requests.query.dataUpdatedAt;

  const renderRow = ({ item: row }: ListRenderItemInfo<Row>) => {
    switch (row.type) {
      case 'requestsHeader':
        return (
          <SectionHeading testID="friends-requests-heading">
            {FRIENDS_COPY.home.requests(row.count)}
          </SectionHeading>
        );
      case 'request':
        return (
          <Animated.View
            // MO-04: an answered row fades out and the rest settle.
            exiting={reduced ? undefined : FadeOut.duration(duration.base)}
            layout={reduced ? undefined : LinearTransition.duration(duration.base)}
          >
            <RequestRow person={row.person} via="home" />
          </Animated.View>
        );
      case 'requestsAll':
        return (
          <Pressable
            testID="friends-requests-see-all"
            accessibilityRole="button"
            accessibilityLabel={FRIENDS_COPY.home.seeAllRequests(row.count)}
            onPress={() => router.push('/friends/requests')}
            className="min-h-11 flex-row items-center gap-1 px-4"
          >
            <Text className="text-sm font-medium text-primary">
              {FRIENDS_COPY.home.seeAllRequests(row.count)}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        );
      case 'requestsError':
        return (
          <ErrorState
            testID="friends-requests-section-error"
            className="py-4"
            title={FRIENDS_COPY.home.sectionError('requests')}
            description=""
            onRetry={() => void requests.query.refetch()}
          />
        );
      case 'segments':
        return (
          <View className="px-4 pb-1 pt-4">
            <SegmentedControl
              testID="friends-segments"
              size="sm"
              value={segment}
              onChange={setSegment}
              options={[
                {
                  value: 'following',
                  label: FRIENDS_COPY.home.youFollow(me.counts.following),
                  testID: 'friends-segment-following',
                },
                {
                  value: 'followers',
                  label: FRIENDS_COPY.home.followers(me.counts.followers),
                  testID: 'friends-segment-followers',
                },
              ]}
            />
          </View>
        );
      case 'skeleton':
        return <PersonRowsSkeleton testID="friends-list-loading" />;
      case 'listError':
        return (
          <ErrorState
            testID="friends-list-error"
            className="py-4"
            title={FRIENDS_COPY.home.sectionError('list')}
            description=""
            onRetry={() => void list.query.refetch()}
          />
        );
      case 'listEmpty':
        return segment === 'following' ? (
          <EmptyState
            testID="friends-empty-following"
            icon={<Ionicons name="people-outline" size={40} color="#9ca3af" />}
            title={FRIENDS_COPY.empty.youFollow.title}
            description={FRIENDS_COPY.empty.youFollow.body}
          />
        ) : (
          <EmptyState
            testID="friends-empty-followers"
            icon={<Ionicons name="people-outline" size={40} color="#9ca3af" />}
            title={FRIENDS_COPY.empty.followers.title}
            description={FRIENDS_COPY.empty.followers.body}
            action={{
              label: FRIENDS_COPY.invite.cta,
              testID: 'friends-empty-followers-invite',
              onPress: () => void invite(),
            }}
          />
        );
      case 'person':
        return (
          <PersonRow
            testID={`friends-${row.segment}-${row.person.id}`}
            person={row.person}
            secondary={
              row.segment === 'following' && row.person.followsYou
                ? FRIENDS_COPY.reason.followsYou
                : null
            }
            trailing={
              <View className="flex-row items-center">
                <RelationButton
                  testID={`friends-${row.segment}-${row.person.id}-relation`}
                  userId={row.person.id}
                  relation={row.person.relation}
                  followsYou={row.person.followsYou}
                  name={row.person.displayName}
                  firstName={row.person.firstName}
                  source="followers"
                />
                {row.segment === 'followers' ? (
                  <Pressable
                    testID={`friends-followers-${row.person.id}-more`}
                    accessibilityRole="button"
                    accessibilityLabel={FRIENDS_COPY.profile.moreOptions(row.person.displayName)}
                    onPress={() =>
                      followerActions.open({
                        id: row.person.id,
                        firstName: row.person.firstName,
                        displayName: row.person.displayName,
                      })
                    }
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color="#6b7280" />
                  </Pressable>
                ) : null}
              </View>
            }
          />
        );
      case 'listMore':
        return (
          <View className="py-4">
            <ActivityIndicator />
          </View>
        );
      case 'suggestionsHeader':
        return (
          <View className="flex-row items-end justify-between pr-2">
            <SectionHeading testID="friends-suggestions-heading">
              {FRIENDS_COPY.home.suggested}
            </SectionHeading>
            {row.showAll ? (
              <Pressable
                testID="friends-suggestions-see-all"
                accessibilityRole="button"
                accessibilityLabel={FRIENDS_COPY.home.seeAll}
                onPress={() => router.push('/friends/suggestions')}
                className="min-h-11 flex-row items-center gap-1 px-2"
              >
                <Text className="text-sm font-medium text-primary">{FRIENDS_COPY.home.seeAll}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        );
      case 'suggestion':
        return <SuggestionRow person={row.person} />;
      case 'suggestionsEmpty':
        return (
          <View className="px-4 pt-4">
            <InviteCard />
          </View>
        );
      case 'suggestionsError':
        return (
          <ErrorState
            testID="friends-suggestions-section-error"
            className="py-4"
            title={FRIENDS_COPY.home.sectionError('suggestions')}
            description=""
            onRetry={() => void suggestions.refetch()}
          />
        );
    }
  };

  return (
    <Screen testID="friends-home" edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <FollowingHeader unread={unread} />
      <View className="px-4 pb-2 pt-1">
        <SearchField
          testID="friends-search"
          accessibilityLabel={FRIENDS_COPY.home.searchLabel}
          placeholder={online ? FRIENDS_COPY.home.searchPlaceholder : FRIENDS_COPY.search.offline}
          editable={online}
          onChangeText={setRaw}
          onDebouncedChange={setQuery}
        />
      </View>
      {!online ? (
        <Text testID="friends-offline-line" variant="muted" className="px-4 pb-2 text-xs">
          {FRIENDS_COPY.offline.line(formatSavedTime(savedAt ? new Date(savedAt) : new Date()))}
        </Text>
      ) : null}

      <View style={{ flex: 1, display: searching ? 'none' : 'flex' }}>
        <FlatList
          testID="friends-home-list"
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          initialNumToRender={20}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={keyboardDismissMode()}
          onEndReached={() => loadMore(list.query)}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
          contentContainerClassName="pb-8"
        />
      </View>
      {searching ? (
        <View style={{ flex: 1 }}>
          <SearchResults query={query} pending={raw.trim() !== query.trim()} online={online} />
        </View>
      ) : null}
      {followerActions.sheets}
    </Screen>
  );
}
