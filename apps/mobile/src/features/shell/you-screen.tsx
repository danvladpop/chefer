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
import { trpc } from '../../lib/trpc';
import { useFriendsBadge } from '../friends/api/use-friends-badge';
import { openLegal } from '../legal/open-legal';
import { FOLLOWING_ITEM } from '../more/more-items';
import { useSignOut } from '../settings/use-sign-out';
import { AskChefAction } from './add-action';
import { ShellPreviewSection } from './shell-preview-row';
import { YouFeedbackRow } from './you/feedback-row';

// ─── You (plan: "You"; 10 Oct redesign board "You") ─────────────────────────
// The old Food More and Gym More tabs, the header gear and the avatar, merged
// into one place — and, since 10 Oct, the single home of every setting:
// Meals, Training, Notifications and Account each get one row here instead
// of a "Settings" hub that mixed them. Grouped the way iOS Settings and
// Google's account pages group: what you've done, how the app behaves, who
// you share with, help. Every row is a push (Send feedback opens a sheet);
// sign out is the one destructive row, at the bottom.

type Row = { title: string; subtitle?: string; href: Href; icon: IconName; testID: string };

const PROGRESS_ROWS: readonly Row[] = [
  { title: 'Stats', href: '/progress', icon: 'progress', testID: 'you-progress' },
  { title: 'My weeks', href: '/my-weeks', icon: 'weeks', testID: 'you-my-weeks' },
];

// Meal settings (`/settings/meals`) and Training settings (`/gym/settings`)
// are where the old Food and Training rows of Settings moved; Account
// (`/settings`) keeps goal, targets, Premium and privacy.
const SETTINGS_ROWS: readonly Row[] = [
  {
    title: 'Meals',
    subtitle: 'Meals, days, allergies, budget',
    href: '/settings/meals',
    icon: 'meals',
    testID: 'you-meal-settings',
  },
  {
    title: 'Training',
    subtitle: 'Units, equipment, reminders',
    href: '/gym/settings',
    icon: 'barbell',
    testID: 'you-training-settings',
  },
  {
    title: 'Notifications',
    href: '/settings/notifications',
    icon: 'notifications',
    testID: 'you-notifications',
  },
  {
    title: 'Account',
    subtitle: 'Goal, targets, Premium, privacy',
    href: '/settings',
    icon: 'account',
    testID: 'you-account',
  },
];

/** "You + Ana", "You + Ana, Ben", "You + 3"; nothing while it's just you. */
export function householdSummary(names: readonly string[]): string | undefined {
  if (names.length === 0) return undefined;
  if (names.length <= 2) return `You + ${names.join(', ')}`;
  return `You + ${names.length}`;
}

export function YouScreen() {
  const colors = useThemeColors();
  const [showBuildDetails, setShowBuildDetails] = useState(false);
  const { available, badgeCount } = useFriendsBadge();
  const signOut = useSignOut('you-sign-out-confirm');
  // Same cached query (and staleTime) as Profile's household row.
  const { data: members = [] } = trpc.household.list.useQuery(undefined, { staleTime: 60_000 });
  const household = householdSummary(members.map((m) => m.name));

  const row = (item: Row) => (
    <ListRow
      key={item.testID}
      testID={item.testID}
      title={item.title}
      {...(item.subtitle ? { subtitle: item.subtitle } : {})}
      icon={<Icon name={item.icon} color={colors.brand} />}
      onPress={() => router.push(item.href)}
    />
  );

  return (
    <Screen className="bg-canvas px-0">
      <KeyboardAwareScrollView testID="you-scroll" contentContainerClassName="gap-6 px-4 pb-8">
        <View>
          <View className="min-h-11 flex-row items-center justify-end">
            <AskChefAction />
          </View>
          <LargeHeader title="You" testID="you-title" />
        </View>

        <ListSection title="Your progress">{PROGRESS_ROWS.map(row)}</ListSection>

        <ListSection title="Settings">{SETTINGS_ROWS.map(row)}</ListSection>

        <ListSection title="People">
          <ListRow
            testID="you-household"
            title="Household"
            {...(household ? { value: household } : {})}
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

        <ShellPreviewSection footer="Admins and test builds only." />

        <ListSection title="Help">
          <YouFeedbackRow />
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
