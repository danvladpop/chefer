import { ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import { ListRow, ListSection, Screen, Text } from '@chefer/ui-mobile';
import { useIsPremium } from '../../../hooks/use-is-premium';
import { useFriendsAvailability } from '../../friends/api/use-friends-availability';
import { legalHref } from '../../legal/legal-docs';
import { ShellChromeProvider, ShellTopBar } from '../shell-chrome';

// ─── Account (10 Oct redesign board "Settings", now titled "Account") ──────
// The new shell's `/settings`. You is the home of every setting, so this
// screen keeps only what is about the person and their account: who they
// are (jobs, goal & body, targets), their plan, emails and data, and the
// legal pages. What left it, and where it lives now:
//   Food rows (allergies, household, money & units, budget, auto-plan)
//     → You → Meals (`/settings/meals`); Household also You → People.
//   Training rows (days & reminders, pause, units, export) → You → Training
//     (`/gym/settings`); Workout history → Train.
//   Notifications, Following, Preview, Sign out, version → You.
// Every row opens the screen that holds the setting, with `?section=` where
// that screen holds several (section-anchor.tsx scrolls to and tints it).

type AccountRow = {
  title: string;
  testID: string;
  href: Href;
  value?: string | undefined;
};

const YOU_ROWS: readonly AccountRow[] = [
  { title: 'What you use Chefer for', testID: 'settings-jobs', href: '/settings/jobs' },
  { title: 'Goal & body', testID: 'settings-goal-body', href: '/preferences?section=goal-body' },
  { title: 'Your targets', testID: 'settings-targets', href: '/preferences?section=targets' },
];

const LEGAL_ROWS: readonly AccountRow[] = [
  { title: 'Terms of Service', testID: 'settings-terms', href: legalHref('terms') },
  { title: 'Privacy Policy', testID: 'settings-privacy-policy', href: legalHref('privacy') },
];

/**
 * The board's shorter wording of WELLNESS_COPY.aboutMedicalDisclaimer (the
 * full text stays in the legacy Settings screen and on web).
 */
export const ACCOUNT_DISCLAIMER =
  "Chefer suggests meals and workouts as general guidance only. It isn't a medical device. Suggestions, including AI ones, can be wrong, even about allergens.";

function accountRows(isPremium: boolean | undefined, friendsAvailable: boolean): AccountRow[] {
  return [
    {
      title: 'Plan & Premium',
      testID: 'settings-plan-premium',
      href: '/profile?section=plan',
      // Nothing while the user loads: no "Free" flash for a Premium account.
      value: isPremium === undefined ? undefined : isPremium ? 'Premium' : 'Free',
    },
    { title: 'Emails', testID: 'settings-emails', href: '/preferences?section=weekly-updates' },
    { title: 'Privacy & data', testID: 'settings-privacy', href: '/profile?section=privacy' },
    {
      title: 'Download or delete my data',
      testID: 'settings-account-data',
      href: '/profile?section=account',
    },
    // Only while `friends.availability` says yes (same gate as You → Following).
    ...(friendsAvailable
      ? [
          {
            title: FRIENDS_COPY.settings.title,
            testID: 'settings-sharing',
            href: '/friends/settings' as Href,
          },
        ]
      : []),
  ];
}

export function AccountScreen() {
  const isPremium = useIsPremium();
  const { enabled: friendsAvailable } = useFriendsAvailability();

  const row = (item: AccountRow) => (
    <ListRow
      key={item.testID}
      testID={item.testID}
      title={item.title}
      {...(item.value ? { value: item.value } : {})}
      onPress={() => router.push(item.href)}
    />
  );

  return (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/you', title: 'Account' }}>
      <Screen className="bg-canvas px-0">
        <View testID="account-header" className="px-4">
          <ShellTopBar />
        </View>
        <ScrollView testID="account-scroll" contentContainerClassName="gap-6 px-4 pb-8 pt-2">
          <ListSection title="You">{YOU_ROWS.map(row)}</ListSection>
          <ListSection title="Account">
            {accountRows(isPremium, friendsAvailable).map(row)}
          </ListSection>
          <ListSection title="Legal">{LEGAL_ROWS.map(row)}</ListSection>
          {/* T-22.3: the medical/legal disclaimer stays visible on this screen. */}
          <Text
            testID="settings-about-disclaimer"
            className="px-4 text-caption text-label-secondary"
          >
            {ACCOUNT_DISCLAIMER}
          </Text>
        </ScrollView>
      </Screen>
    </ShellChromeProvider>
  );
}
