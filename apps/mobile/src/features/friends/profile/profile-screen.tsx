import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { FRIENDS_COPY, type FriendProfileDto } from '@chefer/types';
import {
  duration,
  EmptyState,
  ErrorState,
  Screen,
  SegmentedControl,
  Text,
  useReducedMotion,
} from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { getMode, type AppMode } from '../../gym/mode-store';
import {
  isFriendsNotActivatedError,
  isFriendsUnavailableError,
  isProfileNotAvailableError,
} from '../api/friends-errors';
import { useFriendsMe } from '../api/use-friends-me';
import { useIsOnline } from '../api/use-is-online';
import { FriendsGate, FriendsUnavailableScreen } from '../components/friends-gate';
import { FriendsScreenHeader } from '../components/friends-screen-header';
import { LockedPanel } from '../components/locked-panel';
import { FoodTab } from './food/food-tab';
import { formatClock } from './format';
import { GymTab } from './gym/gym-tab';
import { ProfileHeader, ProfileHeaderSkeleton } from './profile-header';
import { isLocked, lockedPanel } from './sections';

// ─── Someone's profile: /friends/[userId] (UX §8, PRD E7) ─────────────────────
// Header (scrolls away) → the Food | Gym switch (sticky, MO-12 hairline) →
// the tab. The switch is a plain kit SegmentedControl with LOCAL state,
// initialised from the viewer's app mode: it never calls `setMode` and never
// navigates (`ModeSwitch` would persist the app's mode — UX §8.1, plan §15).
// The nav bar shows the person's name once the header has scrolled away.
//
// States (UX §8.2): loading skeleton · non-follower (header + locked panel,
// both tabs) · section not shared · not available (blocked / off / missing —
// one NOT_FOUND, no hint why) · error · offline (the last loaded copy + the
// offline line; the relation button disables itself) · my own profile as a
// preview of what followers see (§8.3).

export type ProfileTab = AppMode;

/** How close to the bottom (pt) the recipes grid starts loading its next page. */
const LOAD_MORE_THRESHOLD = 400;

export function FriendProfileScreen({ userId }: { userId: string }) {
  return (
    <FriendsGate>
      <ProfileBody userId={userId} />
    </FriendsGate>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/friends');
}

function ProfileBody({ userId }: { userId: string }) {
  const utils = trpc.useUtils();
  const query = trpc.friends.profile.useQuery({ userId }, { retry: false });
  const { me } = useFriendsMe();
  const online = useIsOnline();
  // Local only — read once from the app mode, never written back.
  const [tab, setTab] = useState<ProfileTab>(() => getMode());
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrolledPast, setScrolledPast] = useState(false);
  const loadMore = useRef<(() => void) | null>(null);
  const registerLoadMore = useCallback((fn: (() => void) | null) => {
    loadMore.current = fn;
  }, []);

  const switchedOff = isFriendsUnavailableError(query.error);
  useEffect(() => {
    if (switchedOff) void utils.friends.availability.invalidate();
  }, [switchedOff, utils]);

  const profile = query.data;

  if (!profile) {
    if (query.isLoading) {
      return (
        <Screen testID="friends-profile" className="px-0">
          <FriendsScreenHeader title="" testID="friends-profile-nav" />
          <ProfileHeaderSkeleton />
        </Screen>
      );
    }
    if (isFriendsNotActivatedError(query.error)) return <Redirect href="/friends" />;
    if (switchedOff) return <FriendsUnavailableScreen />;
    if (isProfileNotAvailableError(query.error)) return <ProfileNotAvailable />;
    return (
      <Screen testID="friends-profile" className="px-0">
        <FriendsScreenHeader title="" testID="friends-profile-nav" />
        <ErrorState
          testID="friends-profile-error"
          title={FRIENDS_COPY.profile.error}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  // A profile that became unavailable while open (blocked from elsewhere).
  if (query.isError && isProfileNotAvailableError(query.error)) return <ProfileNotAvailable />;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const past = headerHeight > 0 && contentOffset.y >= headerHeight;
    if (past !== scrolledPast) setScrolledPast(past);
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - LOAD_MORE_THRESHOLD) {
      loadMore.current?.();
    }
  };

  return (
    <Screen testID="friends-profile" className="px-0">
      <FriendsScreenHeader
        title={scrolledPast ? profile.user.displayName : ''}
        testID="friends-profile-nav"
      />
      <ScrollView
        testID="friends-profile-scroll"
        stickyHeaderIndices={[1]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerClassName="pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View onLayout={(e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height)}>
          {!online && query.dataUpdatedAt > 0 ? (
            <Text
              testID="friends-profile-offline"
              variant="muted"
              className="px-4 pb-2 text-center"
            >
              {FRIENDS_COPY.offline.line(formatClock(query.dataUpdatedAt))}
            </Text>
          ) : null}
          <ProfileHeader profile={profile} me={me} />
        </View>
        {/* MO-12: the hairline appears once the switch is stuck under the nav bar. */}
        <View
          className={cn(
            'items-center bg-background px-4 py-2',
            scrolledPast && 'border-b border-border',
          )}
        >
          <SegmentedControl<ProfileTab>
            testID="profile-mode-switch"
            accessibilityLabel={`${FRIENDS_COPY.profile.food} or ${FRIENDS_COPY.profile.gym}`}
            size="xs"
            className="w-36"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'food', label: FRIENDS_COPY.profile.food, testID: 'profile-mode-food' },
              { value: 'gym', label: FRIENDS_COPY.profile.gym, testID: 'profile-mode-gym' },
            ]}
          />
        </View>
        <ProfileContent profile={profile} me={me} tab={tab} registerLoadMore={registerLoadMore} />
      </ScrollView>
    </Screen>
  );
}

function ProfileContent({
  profile,
  me,
  tab,
  registerLoadMore,
}: {
  profile: FriendProfileDto;
  me: ReturnType<typeof useFriendsMe>['me'];
  tab: ProfileTab;
  registerLoadMore: (fn: (() => void) | null) => void;
}) {
  const reduced = useReducedMotion();
  const locked = isLocked(profile);
  // Unfollow → the locked panel fades in; follow on a public profile → the
  // content loads in place (UX §8.2). Keyed so the swap crossfades, and the
  // Food|Gym switch crossfades its content too (`duration.fast`).
  const key = locked ? `locked-${profile.user.relation}` : `open-${tab}`;
  return (
    <Animated.View
      key={key}
      entering={reduced ? undefined : FadeIn.duration(locked ? duration.base : duration.fast)}
      className="px-4 pt-2"
    >
      {locked ? (
        <LockedPanel testID="friends-profile-locked" {...lockedPanel(profile)} />
      ) : tab === 'food' ? (
        <FoodTab profile={profile} me={me} registerLoadMore={registerLoadMore} />
      ) : (
        <GymTab profile={profile} me={me} />
      )}
    </Animated.View>
  );
}

function ProfileNotAvailable() {
  return (
    <Screen testID="friends-profile" className="px-0">
      <FriendsScreenHeader title="" testID="friends-profile-nav" />
      <View className="flex-1 justify-center">
        <EmptyState
          testID="friends-profile-not-available"
          icon={<Ionicons name="person-outline" size={40} color="#9ca3af" />}
          title={FRIENDS_COPY.notAvailable.title}
          description={FRIENDS_COPY.notAvailable.body}
          action={{
            label: FRIENDS_COPY.notAvailable.cta,
            testID: 'friends-profile-not-available-back',
            onPress: goBack,
          }}
        />
      </View>
    </Screen>
  );
}
