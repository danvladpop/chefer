import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { COACHING_COPY, FRIENDS_COPY } from '@chefer/types';
import { Button, CountPill, KeyboardAwareScrollView, Screen, Text } from '@chefer/ui-mobile';
import { FeedbackCard } from '../../src/features/feedback/feedback-card';
import { useFriendsBadge } from '../../src/features/friends/api/use-friends-badge';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { openLegal } from '../../src/features/legal/open-legal';
import { useSignOut } from '../../src/features/settings/use-sign-out';
import { useCoachingAvailability } from '../../src/features/trainer/api/use-coaching-availability';
import { track } from '../../src/lib/analytics';
import { getWebUrl } from '../../src/lib/api-url';
import { CURRENT_BUILD, CURRENT_VERSION_LABEL } from '../../src/lib/current-build';

// Secondary nav hub — the mobile counterpart of web's MobileNavDrawer
// (SECONDARY_NAV_ITEMS in apps/web/src/features/nav/nav-items.ts). P2-2 /
// P2-8: Tracker moved into Today ("See full day"), Pantry into Shop ("In my
// kitchen"), History into My weeks. Their screens still open by route.
type MoreItem = {
  href: Href;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  testID: string;
};

const ITEMS: MoreItem[] = [
  { href: '/chat', label: 'AI Chef', icon: 'chatbubble-ellipses-outline', testID: 'more-ai chef' },
  { href: '/progress', label: 'Progress', icon: 'stats-chart-outline', testID: 'more-progress' },
  { href: '/my-weeks', label: 'My weeks', icon: 'repeat-outline', testID: 'more-my-weeks' },
  // UX-ACC-19: Household is a home, Following is people — two different icons.
  { href: '/household', label: 'Household', icon: 'home-outline', testID: 'more-household' },
  { href: '/profile', label: 'Profile', icon: 'person-outline', testID: 'more-profile' },
  // T-00.9: "Preferences" renamed to "Settings" and points to the new hub —
  // the individual preference cards are still reachable from there.
  {
    href: '/settings',
    label: 'Settings',
    icon: 'settings-outline',
    testID: 'more-settings',
  },
];

// Following (docs/friends/ux-design.md §2.1): directly below Profile, only
// while `friends.availability` says yes — with it off, nothing renders and
// nothing but `availability` is queried. The pill is pending requests +
// unread Activity: the in-app notification badge (there is no push).
const FOLLOWING_ITEM: MoreItem = {
  href: '/friends',
  label: FRIENDS_COPY.nav.label,
  icon: 'people-outline',
  testID: 'more-friends',
};

// Trainer coaching (WP-18, spec §2.3 / §2.1): right below Following. "Your trainer" for anyone while
// `coaching.availability` says enabled; "Trainer tools" only for users who may be a trainer. With the
// flag off neither row exists and nothing but `availability` is queried.
const YOUR_TRAINER_ITEM: MoreItem = {
  href: '/coaching',
  label: COACHING_COPY.yourTrainer.title,
  icon: 'person-circle-outline',
  testID: 'more-your-trainer',
};
const TRAINER_TOOLS_ITEM: MoreItem = {
  href: '/trainer',
  label: COACHING_COPY.trainer.title,
  icon: 'clipboard-outline',
  testID: 'more-trainer-tools',
};

function withExtras(following: boolean, yourTrainer: boolean, trainerTools: boolean): MoreItem[] {
  const extras = [
    ...(following ? [FOLLOWING_ITEM] : []),
    ...(yourTrainer ? [YOUR_TRAINER_ITEM] : []),
    ...(trainerTools ? [TRAINER_TOOLS_ITEM] : []),
  ];
  if (extras.length === 0) return ITEMS;
  const at = ITEMS.findIndex((item) => item.testID === 'more-profile') + 1;
  return [...ITEMS.slice(0, at), ...extras, ...ITEMS.slice(at)];
}

export default function MoreScreen() {
  const [showBuildDetails, setShowBuildDetails] = useState(false);
  const { available, badgeCount } = useFriendsBadge();
  const coaching = useCoachingAvailability();
  const items = withExtras(available, coaching.enabled, coaching.canBeTrainer);
  const signOut = useSignOut('more-sign-out-confirm');

  return (
    <Screen className="gap-4 px-0">
      <ModeSwitch className="mx-4 mt-3" />
      <Text variant="title" className="px-4">
        More
      </Text>
      {/* UX-X-05 / UX-ACC-25: the feedback field and its Send button stay clear of the keyboard. */}
      <KeyboardAwareScrollView testID="more-scroll" contentContainerClassName="gap-4 px-4 pb-8">
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((item, i) => {
            const isFollowing = item === FOLLOWING_ITEM;
            const badge = isFollowing ? badgeCount : 0;
            return (
              <Pressable
                key={item.label}
                testID={item.testID}
                accessibilityRole="button"
                // Same wording as CountPill's own label: the real count, never `9+`.
                accessibilityLabel={badge > 0 ? `${item.label}, ${badge} new` : undefined}
                onPress={() => {
                  if (isFollowing) track('friends_opened', { source: 'more' });
                  router.push(item.href);
                }}
                className={
                  i > 0
                    ? 'min-h-12 flex-row items-center gap-3 border-t border-border px-4'
                    : 'min-h-12 flex-row items-center gap-3 px-4'
                }
              >
                <Ionicons name={item.icon} size={20} color="#944a00" />
                <Text className="min-w-0 flex-1 text-sm font-medium text-gray-800">
                  {item.label}
                </Text>
                {badge > 0 ? (
                  <CountPill count={badge} testID="more-friends-badge" className="self-center" />
                ) : null}
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </Pressable>
            );
          })}
        </View>

        <FeedbackCard />

        {/* Legal pages — both app stores require them in the app (F-M-PROF-1-1);
            they open in-app like everywhere else (UX-ACC-19). Support is the website. */}
        <View className="flex-row justify-center gap-6">
          <Pressable
            accessibilityRole="link"
            testID="more-terms"
            onPress={() => openLegal('terms')}
            className="min-h-11 justify-center"
          >
            <Text className="text-sm text-gray-500 underline">Terms</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            testID="more-privacy"
            onPress={() => openLegal('privacy')}
            className="min-h-11 justify-center"
          >
            <Text className="text-sm text-gray-500 underline">Privacy</Text>
          </Pressable>
          <Pressable
            testID="more-support"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(getWebUrl('/support'))}
            className="min-h-11 justify-center"
          >
            <Text className="text-sm text-gray-500 underline">Support</Text>
          </Pressable>
        </View>

        <Button
          testID="logout-button"
          variant="outline"
          loading={signOut.isPending}
          onPress={signOut.request}
        >
          Sign out
        </Button>
        {signOut.confirmSheet}

        {/* R-15: users see "Version 1.0.1"; the full build/OTA line (variant,
            update id) is for support — long-press to reveal it. */}
        <Pressable
          testID="build-info"
          accessibilityLabel={showBuildDetails ? CURRENT_BUILD : CURRENT_VERSION_LABEL}
          onLongPress={() => setShowBuildDetails((shown) => !shown)}
          delayLongPress={600}
          className="min-h-11 items-center justify-center"
        >
          <Text className="text-center text-xs text-muted-foreground">
            {showBuildDetails ? CURRENT_BUILD : CURRENT_VERSION_LABEL}
          </Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
