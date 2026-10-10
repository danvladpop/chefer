import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  CountPill,
  KeyboardAwareScrollView,
  LargeHeader,
  ListRow,
  ListSection,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon, type IconName } from '../../components/icon';
import { track } from '../../lib/analytics';
import { getWebUrl } from '../../lib/api-url';
import { CURRENT_BUILD, CURRENT_VERSION_LABEL } from '../../lib/current-build';
import { FeedbackCard } from '../feedback/feedback-card';
import { useFriendsBadge } from '../friends/api/use-friends-badge';
import { openLegal } from '../legal/open-legal';
import { FOLLOWING_ITEM } from '../more/more-items';
import { useSignOut } from '../settings/use-sign-out';
import { ShellPreviewSection } from './shell-preview-row';

// ─── You (plan: "You") ──────────────────────────────────────────────────────
// The old Food More and Gym More tabs, and the header gear and avatar, merged
// into one place, grouped the way iOS Settings and Google's account pages
// group: what you've done, who you share with, how the app behaves, help.
// Every row is a push; sign out is the one destructive row, at the bottom.

type Row = { title: string; href: Href; icon: IconName; testID: string };

const PROGRESS_ROWS: readonly Row[] = [
  { title: 'Progress', href: '/progress', icon: 'progress', testID: 'you-progress' },
  { title: 'My weeks', href: '/my-weeks', icon: 'weeks', testID: 'you-my-weeks' },
];

const SETTINGS_ROWS: readonly Row[] = [
  { title: 'Profile', href: '/profile', icon: 'you', testID: 'you-profile' },
  { title: 'Settings', href: '/settings', icon: 'settings', testID: 'you-settings' },
  { title: 'Gym settings', href: '/gym/settings', icon: 'gymSettings', testID: 'you-gym-settings' },
];

export function YouScreen() {
  const colors = useThemeColors();
  const [showBuildDetails, setShowBuildDetails] = useState(false);
  const { available, badgeCount } = useFriendsBadge();
  const signOut = useSignOut('you-sign-out-confirm');

  const row = (item: Row) => (
    <ListRow
      key={item.testID}
      testID={item.testID}
      title={item.title}
      icon={<Icon name={item.icon} color={colors.brand} />}
      onPress={() => router.push(item.href)}
    />
  );

  return (
    <Screen className="bg-canvas px-0">
      <KeyboardAwareScrollView testID="you-scroll" contentContainerClassName="gap-6 px-4 pb-8">
        <LargeHeader title="You" testID="you-title" />

        <ListSection title="Your progress">{PROGRESS_ROWS.map(row)}</ListSection>

        <ListSection title="People">
          <ListRow
            testID="you-household"
            title="Household"
            subtitle="Who you cook and shop for"
            icon={<Icon name="household" color={colors.brand} />}
            onPress={() => router.push('/household')}
          />
          {available ? (
            <ListRow
              testID="you-friends"
              title={FOLLOWING_ITEM.label}
              icon={<Icon name="following" color={colors.brand} />}
              badge={
                badgeCount > 0 ? <CountPill count={badgeCount} testID="you-friends-badge" /> : null
              }
              onPress={() => {
                track('friends_opened', { source: 'more' });
                router.push(FOLLOWING_ITEM.href);
              }}
            />
          ) : null}
        </ListSection>

        <ListSection title="Account and settings">{SETTINGS_ROWS.map(row)}</ListSection>

        <ShellPreviewSection />

        <FeedbackCard />

        <ListSection title="Help">
          <ListRow
            testID="you-support"
            title="Support"
            icon={<Icon name="help" color={colors.brand} />}
            onPress={() => void Linking.openURL(getWebUrl('/support'))}
          />
          <ListRow
            testID="you-terms"
            title="Terms"
            icon={<Icon name="legal" color={colors.brand} />}
            onPress={() => openLegal('terms')}
          />
          <ListRow
            testID="you-privacy"
            title="Privacy"
            icon={<Icon name="legal" color={colors.brand} />}
            onPress={() => openLegal('privacy')}
          />
        </ListSection>

        <ListSection>
          <ListRow
            testID="logout-button"
            title={signOut.isPending ? 'Signing out…' : 'Sign out'}
            icon={<Icon name="signOut" color={colors.danger} />}
            destructive
            disabled={signOut.isPending}
            onPress={signOut.request}
          />
        </ListSection>
        {signOut.confirmSheet}

        {/* R-15: "Version 1.0.1" for everyone; long-press for the support line. */}
        <Pressable
          testID="build-info"
          accessibilityLabel={showBuildDetails ? CURRENT_BUILD : CURRENT_VERSION_LABEL}
          onLongPress={() => setShowBuildDetails((shown) => !shown)}
          delayLongPress={600}
          className="min-h-11 items-center justify-center"
        >
          <View>
            <Text className="text-center text-caption text-label-tertiary">
              {showBuildDetails ? CURRENT_BUILD : CURRENT_VERSION_LABEL}
            </Text>
          </View>
        </Pressable>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
