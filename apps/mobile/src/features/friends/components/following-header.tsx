import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import { CountPill } from '@chefer/ui-mobile';
import { FriendsScreenHeader } from './friends-screen-header';

// ─── Following home header (UX §3.2, §5.1) ────────────────────────────────────
// `← Following   🔔² ⚙`: the Activity bell carries the unread count (the
// in-app notification badge — there is no push) and opens Activity; the gear
// opens Sharing & privacy. Both are 44 pt icon buttons.

export type FollowingHeaderProps = {
  /** Unread Activity + pending requests (`friends.me.badgeCount`). */
  unread: number;
  onBack?: () => void;
  testID?: string;
};

export function FollowingHeader({
  unread,
  onBack,
  testID = 'friends-header',
}: FollowingHeaderProps) {
  return (
    <FriendsScreenHeader
      testID={testID}
      title={FRIENDS_COPY.home.title}
      {...(onBack ? { onBack } : {})}
      right={
        <>
          <Pressable
            testID={`${testID}-activity`}
            accessibilityRole="button"
            accessibilityLabel={FRIENDS_COPY.home.activityLabel(unread)}
            onPress={() => router.push('/friends/activity')}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="notifications-outline" size={22} color="#1f2937" />
            {/* The button's label already says the count; the pill is visual only. */}
            <View
              className="absolute right-0.5 top-0.5"
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <CountPill count={unread} testID={`${testID}-activity-count`} />
            </View>
          </Pressable>
          <Pressable
            testID={`${testID}-settings`}
            accessibilityRole="button"
            accessibilityLabel={FRIENDS_COPY.home.settingsLabel}
            onPress={() => router.push('/friends/settings')}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="settings-outline" size={22} color="#1f2937" />
          </Pressable>
        </>
      }
    />
  );
}
