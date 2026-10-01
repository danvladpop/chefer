import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FRIENDS_COPY, type ActivityItemDto } from '@chefer/types';
import { EmptyState, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';
import { isFriendsUnavailableError } from '../api/friends-errors';
import { FriendsGate, FriendsUnavailableScreen } from '../components/friends-gate';
import { FriendsScreenHeader } from '../components/friends-screen-header';
import { PersonRow } from '../components/person-row';
import { RelationButton } from '../components/relation-button';
import { RequestRow } from '../components/request-row';
import { ActivatedGate } from './activated-gate';
import { formatActivityAge } from './activity-time';
import { loadMore, useActivityList } from './friends-lists';
import { PersonRowsSkeleton } from './skeletons';

// ─── Activity (UX §7.2, PRD FR-11, E10) ───────────────────────────────────────
// The in-app inbox: with the badges, the whole notification mechanism (no push,
// no email). `New` is what was unread when the screen opened; `Earlier` the
// rest. Opening it calls `friends.markActivityRead({ upTo })` (the newest item
// shown), and the badge clears once that succeeds (`friends.me` is refetched).
// Rows tap through to the actor's profile. Pending `FOLLOW_REQUEST` → Accept /
// Decline (`RequestRow`); once answered the row reads `You accepted` /
// `You declined` (the live `requestState`, flipped optimistically by
// use-answer-request.ts); `NEW_FOLLOWER` → RelationButton; `REQUEST_ACCEPTED`
// → no control. Items for cancelled requests or blocked people are withdrawn
// by the server and never arrive.

type Row =
  | { type: 'header'; key: string; label: string }
  | { type: 'item'; key: string; item: ActivityItemDto };

/** `{name} wants to follow you` → `wants to follow you` (the name is the row's bold first line). */
export function activitySentenceRest(item: ActivityItemDto): string {
  const copy = FRIENDS_COPY.activity;
  const name = item.actor.displayName;
  const sentence =
    item.kind === 'FOLLOW_REQUEST'
      ? copy.request(name)
      : item.kind === 'NEW_FOLLOWER'
        ? copy.newFollower(name)
        : copy.accepted(name);
  return sentence.startsWith(name) ? sentence.slice(name.length).trim() : sentence;
}

/** `New` / `Earlier` sections from the ids that were unread when the screen opened. */
export function activityRows(
  items: readonly ActivityItemDto[],
  newIds: ReadonlySet<string>,
): Row[] {
  const fresh = items.filter((i) => newIds.has(i.id));
  const earlier = items.filter((i) => !newIds.has(i.id));
  const rows: Row[] = [];
  if (fresh.length > 0) {
    rows.push({ type: 'header', key: 'h-new', label: FRIENDS_COPY.activity.new });
    for (const item of fresh) rows.push({ type: 'item', key: item.id, item });
  }
  if (earlier.length > 0) {
    rows.push({ type: 'header', key: 'h-earlier', label: FRIENDS_COPY.activity.earlier });
    for (const item of earlier) rows.push({ type: 'item', key: item.id, item });
  }
  return rows;
}

function ActivityRowView({ item }: { item: ActivityItemDto }) {
  const { actor } = item;
  const secondary = `${activitySentenceRest(item)} · ${formatActivityAge(item.createdAt)}`;
  const testID = `friends-activity-${item.id}`;

  if (item.kind === 'FOLLOW_REQUEST' && (item.requestState ?? 'pending') === 'pending') {
    return (
      <RequestRow
        testID={`friends-activity-request-${actor.id}`}
        person={actor}
        secondary={secondary}
        via="activity"
      />
    );
  }

  let trailing: React.ReactNode = null;
  if (item.kind === 'FOLLOW_REQUEST') {
    trailing = (
      <Text testID={`${testID}-answered`} variant="muted">
        {item.requestState === 'declined'
          ? FRIENDS_COPY.activity.youDeclined
          : FRIENDS_COPY.activity.youAccepted}
      </Text>
    );
  } else if (item.kind === 'NEW_FOLLOWER') {
    trailing = (
      <RelationButton
        testID={`${testID}-relation`}
        userId={actor.id}
        relation={actor.relation}
        followsYou={actor.followsYou}
        name={actor.displayName}
        firstName={actor.firstName}
        source="activity"
      />
    );
  }
  return <PersonRow testID={testID} person={actor} secondary={secondary} trailing={trailing} />;
}

function ActivityBody() {
  const utils = trpc.useUtils();
  const markRead = trpc.friends.markActivityRead.useMutation();
  const { query, items } = useActivityList();

  // Which items were unread when the screen opened: frozen on the first fresh
  // load, so `New` doesn't empty itself the moment they are marked read.
  const [newIds, setNewIds] = useState<ReadonlySet<string> | null>(null);
  const fresh = query.isFetchedAfterMount;
  useEffect(() => {
    if (newIds !== null || !fresh) return;
    const unread = items.filter((i) => i.readAt === null);
    setNewIds(new Set(unread.map((i) => i.id)));
    const newest = items[0];
    if (unread.length > 0 && newest) {
      markRead.mutate(
        { upTo: newest.createdAt },
        { onSuccess: () => void utils.friends.me.invalidate() },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the first fresh load
  }, [fresh, items, newIds]);

  const rows = useMemo(() => activityRows(items, newIds ?? new Set()), [items, newIds]);

  if (isFriendsUnavailableError(query.error)) return <FriendsUnavailableScreen />;
  if (query.isError && items.length === 0) {
    return (
      <ErrorState
        testID="friends-activity-error"
        title={FRIENDS_COPY.home.sectionError('list')}
        description=""
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isLoading) return <PersonRowsSkeleton testID="friends-activity-loading" count={4} />;
  if (items.length === 0) {
    return (
      <EmptyState
        testID="friends-activity-empty"
        icon={<Ionicons name="notifications-outline" size={40} color="#9ca3af" />}
        title={FRIENDS_COPY.activity.empty.title}
        description={FRIENDS_COPY.activity.empty.body}
      />
    );
  }

  return (
    <FlatList
      testID="friends-activity-list"
      data={rows}
      keyExtractor={(row) => row.key}
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
      renderItem={({ item: row }) =>
        row.type === 'header' ? (
          <Text
            accessibilityRole="header"
            variant="muted"
            className="px-4 pb-1 pt-4 text-xs font-medium uppercase"
          >
            {row.label}
          </Text>
        ) : (
          <ActivityRowView item={row.item} />
        )
      }
      ListFooterComponent={
        <View className="items-center px-4 py-6">
          {query.isFetchingNextPage ? <ActivityIndicator /> : null}
          <Text testID="friends-activity-retention" variant="muted" className="text-center">
            {FRIENDS_COPY.activity.retention}
          </Text>
        </View>
      }
    />
  );
}

export function FriendsActivityScreen() {
  return (
    <FriendsGate>
      <ActivatedGate title={FRIENDS_COPY.activity.title} testID="friends-activity">
        <Screen testID="friends-activity" className="px-0">
          <FriendsScreenHeader
            title={FRIENDS_COPY.activity.title}
            testID="friends-activity-header"
          />
          <ActivityBody />
        </Screen>
      </ActivatedGate>
    </FriendsGate>
  );
}
