import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { FriendUserSummary } from '@chefer/types';
import {
  duration,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
  useReducedMotion,
  useThemeColors,
} from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { TrainButton } from '../../shell/train/train-button';
import { FriendsGate } from '../components/friends-gate';
import { PersonRow } from '../components/person-row';
import { FRIENDS_SCREEN_TITLES } from '../components/screen-titles';
import { UnblockConfirmSheet } from '../safety/safety-confirm-sheets';
import { SettingsTopBar } from './settings-screen';

// ─── Blocked people (`/friends/blocked`, UX §11.6, FR-13.3) ────────────────────
// A plain list (PersonRow, not pressable: a blocked profile is unreachable)
// with an `Unblock` outline button per row → `Unblock {first}?` confirm → the
// row exits (MO-04: fade, `duration.base`; instant under reduced motion). The
// removal itself is core's `useUnblock` (cache write + refetch marks).
// 20 per page, infinite scroll.
// 11 Oct restyle: the shell's top bar, canvas and colour roles.

function BlockedBody() {
  const { t } = useT();
  const query = trpc.friends.blocked.useInfiniteQuery(
    {},
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const reduced = useReducedMotion();
  const colors = useThemeColors();
  const [target, setTarget] = useState<FriendUserSummary | null>(null);
  const [visible, setVisible] = useState(false);

  const people = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isLoading) {
    return (
      <View testID="friends-blocked-loading" className="gap-3 px-4 pt-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-card" />
        ))}
      </View>
    );
  }
  if (query.isError && people.length === 0) {
    return (
      <ErrorState
        testID="friends-blocked-error"
        title={t('friends.home.sectionError.list')}
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
        contentContainerClassName="pt-3"
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
            icon={<Ionicons name="ban-outline" size={40} color={colors.labelTertiary} />}
            title={t('friends.blocked.empty')}
          />
        }
        renderItem={({ item }) => (
          <Animated.View exiting={FadeOut.duration(reduced ? 0 : duration.base)}>
            <PersonRow
              person={item}
              onPress={false}
              testID={`friends-blocked-row-${item.id}`}
              trailing={
                <TrainButton
                  testID={`friends-blocked-unblock-${item.id}`}
                  label={t('friends.unblock.cta')}
                  variant="outline"
                  accessibilityLabel={t('friends.blocked.unblockLabel', { name: item.displayName })}
                  onPress={() => {
                    setTarget(item);
                    setVisible(true);
                  }}
                />
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
  const { t } = useT();
  return (
    <FriendsGate>
      <Screen testID="friends-blocked" className="bg-canvas px-0">
        <SettingsTopBar
          title={t(FRIENDS_SCREEN_TITLES.blocked)}
          fallback="/friends/settings"
          testID="friends-blocked-header"
        />
        <BlockedBody />
      </Screen>
    </FriendsGate>
  );
}
