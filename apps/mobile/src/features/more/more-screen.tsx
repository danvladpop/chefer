import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, CountPill, KeyboardAwareScrollView, Screen, Text } from '@chefer/ui-mobile';
import { track } from '../../lib/analytics';
import { getWebUrl } from '../../lib/api-url';
import { CURRENT_BUILD, CURRENT_VERSION_LABEL } from '../../lib/current-build';
import { FeedbackCard } from '../feedback/feedback-card';
import { useFriendsBadge } from '../friends/api/use-friends-badge';
import { ModeSwitch } from '../gym/components/mode-switch';
import { openLegal } from '../legal/open-legal';
import { useSignOut } from '../settings/use-sign-out';
import { FOLLOWING_ITEM, withFollowing, type MoreItem } from './more-items';

// Secondary nav hub shared by the Food and Gym tab groups (FB7-01): each mode
// passes its own item list; the feedback card, legal links, Sign out and the
// version line are identical.
export function MoreScreen({
  items: baseItems,
  mode,
}: {
  items: readonly MoreItem[];
  /** Pin the mode pill (Gym screens never derive it from the route — UX-GYM-20). */
  mode?: 'food' | 'gym';
}) {
  const [showBuildDetails, setShowBuildDetails] = useState(false);
  const { available, badgeCount } = useFriendsBadge();
  const items = withFollowing(baseItems, available);
  const signOut = useSignOut('more-sign-out-confirm');

  return (
    <Screen className="gap-4 px-0">
      <ModeSwitch className="mx-4 mt-3" mode={mode} />
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
