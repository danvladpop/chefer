import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import { Button, Screen, Text } from '@chefer/ui-mobile';
import { WELLNESS_COPY } from '@chefer/utils';
import { track } from '../../lib/analytics';
import { CURRENT_VERSION_LABEL } from '../../lib/current-build';
import { useFriendsAvailability } from '../friends/api/use-friends-availability';
import { useGymBootstrap } from '../gym/use-gym-bootstrap';
import { legalHref } from '../legal/legal-docs';
import { ShellPreviewSection } from '../shell/shell-preview-row';
import { useShellV2 } from '../shell/shell-store';
import { AccountScreen } from '../shell/you/account-screen';
import { useSignOut } from './use-sign-out';

// ─── Settings hub (T-00.9, PAT-9 §2.9; UX-ACC-04, UX-ACC-19) ───────────────────
// One Settings entry from both modes (the ModeSwitch gear). Every row opens the
// screen that really holds the setting, and — where a screen holds several —
// with `?section=<id>` so it scrolls to and tints the right card and titles
// itself after the row (section-anchor.tsx). Rows that share a card say so on
// purpose: "Emails" opens the Weekly updates card; "Notifications" opens its
// own screen (UX-PO-08), which gathers every reminder — Weekly updates
// included.

interface SettingsRow {
  label: string;
  testID: string;
  href: Href;
  onOpen?: () => void;
}

interface SettingsGroup {
  title: string;
  rows: SettingsRow[];
  /** Shows the "Set up training" call to action instead of the rows. */
  setUpCta?: boolean;
}

const YOU_GROUP: SettingsGroup = {
  title: 'You',
  rows: [
    { label: 'What you use Chefer for', testID: 'settings-jobs', href: '/settings/jobs' },
    {
      label: 'Goal & body',
      testID: 'settings-goal-body',
      href: '/preferences?section=goal-body',
    },
    { label: 'Your targets', testID: 'settings-targets', href: '/preferences?section=targets' },
  ],
};

// "How you cook" is gone: its three questions (who you cook for, units and
// currency, budget) are the Household, Money & units and Weekly budget rows.
const FOOD_GROUP: SettingsGroup = {
  title: 'Food',
  rows: [
    { label: 'Allergies & diets', testID: 'settings-safety', href: '/preferences?section=safety' },
    { label: 'Household', testID: 'settings-household', href: '/household' },
    {
      label: 'Money & units',
      testID: 'settings-money-units',
      href: '/preferences?section=display',
    },
    { label: 'Weekly budget', testID: 'settings-budget', href: '/preferences?section=budget' },
    {
      label: 'Plan my week automatically',
      testID: 'settings-auto-plan',
      href: '/preferences?section=auto-plan',
    },
  ],
};

const TRAINING_GROUP: SettingsGroup = {
  title: 'Training',
  rows: [
    {
      label: 'Training days & reminders',
      testID: 'settings-training-days',
      href: '/gym/settings?section=reminders',
    },
    { label: 'Pause training', testID: 'settings-pause', href: '/gym/settings?section=pause' },
    {
      label: 'Units, equipment & weekly goal',
      testID: 'settings-gym-units',
      href: '/gym/settings?section=units',
    },
    // The History segment of the Stats tab (a completed-sessions list).
    { label: 'Workout history', testID: 'settings-workout-history', href: '/stats?tab=history' },
    { label: 'Export workouts', testID: 'settings-export', href: '/gym/settings?section=export' },
  ],
};

const ACCOUNT_ROWS: SettingsRow[] = [
  { label: 'Plan & Premium', testID: 'settings-plan-premium', href: '/profile?section=plan' },
  { label: 'Emails', testID: 'settings-emails', href: '/preferences?section=weekly-updates' },
  {
    label: 'Notifications',
    testID: 'settings-notifications',
    href: '/settings/notifications',
  },
  { label: 'Privacy & data', testID: 'settings-privacy', href: '/profile?section=privacy' },
  {
    label: 'Download or delete my data',
    testID: 'settings-account-data',
    href: '/profile?section=account',
  },
];

const LEGAL_GROUP: SettingsGroup = {
  title: 'Legal',
  rows: [
    { label: 'Terms of Service', testID: 'settings-terms', href: legalHref('terms') },
    { label: 'Privacy Policy', testID: 'settings-privacy-policy', href: legalHref('privacy') },
  ],
};

// Following (docs/friends/ux-design.md §2.1): the first Account row, and Gym
// mode's way in (Gym has no More tab). Only while `friends.availability` says
// yes — with it off the row doesn't exist and nothing else is queried.
const FOLLOWING_ROW: SettingsRow = {
  label: FRIENDS_COPY.nav.label,
  testID: 'settings-friends',
  href: '/friends',
  onOpen: () => track('friends_opened', { source: 'settings' }),
};

function groupsFor(friendsAvailable: boolean, hasTraining: boolean): SettingsGroup[] {
  return [
    YOU_GROUP,
    FOOD_GROUP,
    // UX-ACC-04: five training rows that all open "Set up your training first"
    // are one "Set up training" action until training is set up.
    hasTraining ? TRAINING_GROUP : { title: 'Training', rows: [], setUpCta: true },
    {
      title: 'Account',
      rows: friendsAvailable ? [FOLLOWING_ROW, ...ACCOUNT_ROWS] : ACCOUNT_ROWS,
    },
    LEGAL_GROUP,
  ];
}

function GroupTitle({ children }: { children: string }) {
  return (
    <Text className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </Text>
  );
}

function SettingsRowItem({
  label,
  testID,
  isFirst,
  destructive,
  onPress,
}: {
  label: string;
  testID: string;
  isFirst: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      className={
        isFirst
          ? 'min-h-12 flex-row items-center gap-3 px-4'
          : 'min-h-12 flex-row items-center gap-3 border-t border-border px-4'
      }
    >
      <Text
        className={
          destructive
            ? 'flex-1 text-sm font-medium text-red-600'
            : 'flex-1 text-sm font-medium text-gray-800'
        }
      >
        {label}
      </Text>
      {!destructive && <Ionicons name="chevron-forward" size={16} color="#9ca3af" />}
    </Pressable>
  );
}

function TrainingSetupCta() {
  return (
    <View testID="settings-training-setup" className="gap-2 p-4">
      <Text className="text-sm font-medium text-gray-800">Training isn’t set up yet</Text>
      <Text variant="muted" className="text-sm">
        Choose your training days, units and equipment to start logging workouts. Everything else in
        Chefer works without it.
      </Text>
      <Button testID="settings-set-up-training" onPress={() => router.push('/gym/setup')}>
        Set up training
      </Button>
    </View>
  );
}

/** `/settings`: "Account" in the new shell (10 Oct redesign), the hub in the old one. */
export function SettingsScreen() {
  return useShellV2() ? <AccountScreen /> : <LegacySettingsScreen />;
}

function LegacySettingsScreen() {
  const { enabled: friendsAvailable } = useFriendsAvailability();
  // Only a *loaded* "no gym profile" swaps the Training rows for the CTA — a
  // slow or failed load keeps the rows rather than flashing a setup prompt.
  const bootstrap = useGymBootstrap();
  const trainingSetUp = !(bootstrap.isSuccess && !bootstrap.data.profile);
  const groups = groupsFor(friendsAvailable, trainingSetUp);
  const signOut = useSignOut('settings-sign-out-confirm');

  return (
    <Screen className="gap-2 px-0">
      {/* UX-ACC-04: Settings was the one stack screen with no back control. */}
      <View className="flex-row items-center gap-3 px-4">
        <Pressable
          testID="settings-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <Text testID="settings-title" variant="title">
          Settings
        </Text>
      </View>
      <ScrollView contentContainerClassName="gap-2 pb-8">
        {groups.map((group) => (
          <View key={group.title}>
            <GroupTitle>{group.title}</GroupTitle>
            <View className="mx-4 overflow-hidden rounded-2xl border border-border bg-card">
              {group.setUpCta && <TrainingSetupCta />}
              {group.rows.map((row, i) => (
                <SettingsRowItem
                  key={row.testID}
                  label={row.label}
                  testID={row.testID}
                  isFirst={i === 0}
                  onPress={() => {
                    row.onOpen?.();
                    router.push(row.href);
                  }}
                />
              ))}
              {group.title === 'Account' && (
                <SettingsRowItem
                  label="Sign out"
                  testID="settings-sign-out"
                  isFirst={false}
                  destructive
                  onPress={signOut.request}
                />
              )}
            </View>
          </View>
        ))}
        {/* Mobile UX revamp: admins and test builds can preview the new shell. */}
        <View className="mx-4 mt-2">
          <ShellPreviewSection />
        </View>
        {/* T-22.3: the medical/legal disclaimer, always visible on Settings. */}
        <Text testID="settings-about-disclaimer" variant="muted" className="px-4 text-xs">
          {WELLNESS_COPY.aboutMedicalDisclaimer}
        </Text>
        <Text testID="settings-version" variant="muted" className="px-4 text-center text-xs">
          {CURRENT_VERSION_LABEL}
        </Text>
      </ScrollView>

      {signOut.confirmSheet}
    </Screen>
  );
}
