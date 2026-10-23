import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import type { Catalog } from '@chefer/i18n';
import { COACHING_COPY } from '@chefer/types';
import { Button, Screen, Text } from '@chefer/ui-mobile';
import { WELLNESS_COPY } from '@chefer/utils';
import { track } from '../../lib/analytics';
import { CURRENT_VERSION_LABEL } from '../../lib/current-build';
import { useT } from '../../lib/i18n';
import { useFriendsAvailability } from '../friends/api/use-friends-availability';
import { useGymBootstrap } from '../gym/use-gym-bootstrap';
import { legalHref } from '../legal/legal-docs';
import { ShellPreviewSection } from '../shell/shell-preview-row';
import { useShellV2 } from '../shell/shell-store';
import { AccountScreen } from '../shell/you/account-screen';
import { useCoachingAvailability } from '../trainer/api/use-coaching-availability';
import { useSignOut } from './use-sign-out';

// ─── Settings hub (T-00.9, PAT-9 §2.9; UX-ACC-04, UX-ACC-19) ───────────────────
// One Settings entry from both modes (the ModeSwitch gear). Every row opens the
// screen that really holds the setting, and — where a screen holds several —
// with `?section=<id>` so it scrolls to and tints the right card and titles
// itself after the row (section-anchor.tsx). Rows that share a card say so on
// purpose: "Emails" opens the Weekly updates card; "Notifications" opens its
// own screen (UX-PO-08), which gathers every reminder — Weekly updates
// included.

/** A row's label: a catalog key, or text that is not ours to translate (COACHING_COPY). */
type RowKey =
  | `settings.hub.rows.${keyof Catalog['settings']['hub']['rows']}`
  | 'settings.language.title'
  | 'friends.nav.label';
type Label = { key: RowKey } | { text: string };

interface SettingsRow {
  label: Label;
  testID: string;
  href: Href;
  onOpen?: () => void;
}

type GroupId = 'you' | 'food' | 'training' | 'account' | 'legal';

interface SettingsGroup {
  id: GroupId;
  rows: SettingsRow[];
  /** Shows the "Set up training" call to action instead of the rows. */
  setUpCta?: boolean;
}

const GROUP_TITLE: Record<GroupId, `settings.hub.groups.${GroupId}`> = {
  you: 'settings.hub.groups.you',
  food: 'settings.hub.groups.food',
  training: 'settings.hub.groups.training',
  account: 'settings.hub.groups.account',
  legal: 'settings.hub.groups.legal',
};

const YOU_GROUP: SettingsGroup = {
  id: 'you',
  rows: [
    {
      label: { key: 'settings.hub.rows.jobs' },
      testID: 'settings-jobs',
      href: '/settings/jobs',
    },
    {
      label: { key: 'settings.hub.rows.goalBody' },
      testID: 'settings-goal-body',
      href: '/preferences?section=goal-body',
    },
    {
      label: { key: 'settings.hub.rows.targets' },
      testID: 'settings-targets',
      href: '/preferences?section=targets',
    },
  ],
};

// "How you cook" is gone: its three questions (who you cook for, units and
// currency, budget) are the Household, Money & units and Weekly budget rows.
const FOOD_GROUP: SettingsGroup = {
  id: 'food',
  rows: [
    {
      label: { key: 'settings.hub.rows.safety' },
      testID: 'settings-safety',
      href: '/preferences?section=safety',
    },
    {
      label: { key: 'settings.hub.rows.household' },
      testID: 'settings-household',
      href: '/household',
    },
    {
      label: { key: 'settings.hub.rows.moneyUnits' },
      testID: 'settings-money-units',
      href: '/preferences?section=display',
    },
    {
      label: { key: 'settings.hub.rows.budget' },
      testID: 'settings-budget',
      href: '/preferences?section=budget',
    },
    {
      label: { key: 'settings.hub.rows.autoPlan' },
      testID: 'settings-auto-plan',
      href: '/preferences?section=auto-plan',
    },
  ],
};

const TRAINING_GROUP: SettingsGroup = {
  id: 'training',
  rows: [
    {
      label: { key: 'settings.hub.rows.trainingDays' },
      testID: 'settings-training-days',
      href: '/gym/settings?section=reminders',
    },
    {
      label: { key: 'settings.hub.rows.pause' },
      testID: 'settings-pause',
      href: '/gym/settings?section=pause',
    },
    {
      label: { key: 'settings.hub.rows.gymUnits' },
      testID: 'settings-gym-units',
      href: '/gym/settings?section=units',
    },
    // The History segment of the Stats tab (a completed-sessions list).
    {
      label: { key: 'settings.hub.rows.workoutHistory' },
      testID: 'settings-workout-history',
      href: '/stats?tab=history',
    },
    {
      label: { key: 'settings.hub.rows.exportWorkouts' },
      testID: 'settings-export',
      href: '/gym/settings?section=export',
    },
  ],
};

const ACCOUNT_ROWS: SettingsRow[] = [
  {
    label: { key: 'settings.hub.rows.planPremium' },
    testID: 'settings-plan-premium',
    href: '/profile?section=plan',
  },
  {
    label: { key: 'settings.hub.rows.emails' },
    testID: 'settings-emails',
    href: '/preferences?section=weekly-updates',
  },
  // ADR 0004. Reads "Language" / "Limbă" in the current language, and the
  // language screen shows each language in itself.
  {
    label: { key: 'settings.language.title' },
    testID: 'settings-language',
    href: '/settings/language',
  },
  {
    label: { key: 'settings.hub.rows.notifications' },
    testID: 'settings-notifications',
    href: '/settings/notifications',
  },
  {
    label: { key: 'settings.hub.rows.privacyData' },
    testID: 'settings-privacy',
    href: '/profile?section=privacy',
  },
  {
    label: { key: 'settings.hub.rows.accountData' },
    testID: 'settings-account-data',
    href: '/profile?section=account',
  },
];

const LEGAL_GROUP: SettingsGroup = {
  id: 'legal',
  rows: [
    {
      label: { key: 'settings.hub.rows.terms' },
      testID: 'settings-terms',
      href: legalHref('terms'),
    },
    {
      label: { key: 'settings.hub.rows.privacyPolicy' },
      testID: 'settings-privacy-policy',
      href: legalHref('privacy'),
    },
  ],
};

// Following (docs/friends/ux-design.md §2.1): the first Account row, and Gym
// mode's way in (Gym has no More tab). Only while `friends.availability` says
// yes — with it off the row doesn't exist and nothing else is queried.
const FOLLOWING_ROW: SettingsRow = {
  label: { key: 'friends.nav.label' },
  testID: 'settings-friends',
  href: '/friends',
  onOpen: () => track('friends_opened', { source: 'settings' }),
};

// Trainer coaching (WP-18): "Your trainer" for anyone while `coaching.availability` says enabled,
// "Trainer tools" only for users who may be a trainer — Gym mode's way in (Gym has no More tab).
// COACHING_COPY is translated in phase 4; its text is shown as is until then.
const YOUR_TRAINER_ROW: SettingsRow = {
  label: { text: COACHING_COPY.yourTrainer.title },
  testID: 'settings-your-trainer',
  href: '/coaching',
};
const TRAINER_TOOLS_ROW: SettingsRow = {
  label: { text: COACHING_COPY.trainer.title },
  testID: 'settings-trainer-tools',
  href: '/trainer',
};

function groupsFor(
  friendsAvailable: boolean,
  hasTraining: boolean,
  coaching: { yourTrainer: boolean; trainerTools: boolean } = {
    yourTrainer: false,
    trainerTools: false,
  },
): SettingsGroup[] {
  const accountRows = [
    ...(friendsAvailable ? [FOLLOWING_ROW] : []),
    ...(coaching.yourTrainer ? [YOUR_TRAINER_ROW] : []),
    ...(coaching.trainerTools ? [TRAINER_TOOLS_ROW] : []),
    ...ACCOUNT_ROWS,
  ];
  return [
    YOU_GROUP,
    FOOD_GROUP,
    // UX-ACC-04: five training rows that all open "Set up your training first"
    // are one "Set up training" action until training is set up.
    hasTraining ? TRAINING_GROUP : { id: 'training', rows: [], setUpCta: true },
    {
      id: 'account',
      rows: accountRows,
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
  const { t } = useT();
  return (
    <View testID="settings-training-setup" className="gap-2 p-4">
      <Text className="text-sm font-medium text-gray-800">
        {t('settings.hub.trainingSetup.title')}
      </Text>
      <Text variant="muted" className="text-sm">
        {t('settings.hub.trainingSetup.body')}
      </Text>
      <Button testID="settings-set-up-training" onPress={() => router.push('/gym/setup')}>
        {t('settings.hub.trainingSetup.cta')}
      </Button>
    </View>
  );
}

/** `/settings`: "Account" in the new shell (10 Oct redesign), the hub in the old one. */
export function SettingsScreen() {
  return useShellV2() ? <AccountScreen /> : <LegacySettingsScreen />;
}

function LegacySettingsScreen() {
  const { t } = useT();
  const { enabled: friendsAvailable } = useFriendsAvailability();
  const coachingAvailability = useCoachingAvailability();
  // Only a *loaded* "no gym profile" swaps the Training rows for the CTA — a
  // slow or failed load keeps the rows rather than flashing a setup prompt.
  const bootstrap = useGymBootstrap();
  const trainingSetUp = !(bootstrap.isSuccess && !bootstrap.data.profile);
  const groups = groupsFor(friendsAvailable, trainingSetUp, {
    yourTrainer: coachingAvailability.enabled,
    trainerTools: coachingAvailability.canBeTrainer,
  });
  const signOut = useSignOut('settings-sign-out-confirm');

  return (
    <Screen className="gap-2 px-0">
      {/* UX-ACC-04: Settings was the one stack screen with no back control. */}
      <View className="flex-row items-center gap-3 px-4">
        <Pressable
          testID="settings-back"
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <Text testID="settings-title" variant="title">
          {t('settings.hub.title')}
        </Text>
      </View>
      <ScrollView contentContainerClassName="gap-2 pb-8">
        {groups.map((group) => (
          <View key={group.id}>
            <GroupTitle>{t(GROUP_TITLE[group.id])}</GroupTitle>
            <View className="mx-4 overflow-hidden rounded-2xl border border-border bg-card">
              {group.setUpCta && <TrainingSetupCta />}
              {group.rows.map((row, i) => (
                <SettingsRowItem
                  key={row.testID}
                  label={'key' in row.label ? t(row.label.key) : row.label.text}
                  testID={row.testID}
                  isFirst={i === 0}
                  onPress={() => {
                    row.onOpen?.();
                    router.push(row.href);
                  }}
                />
              ))}
              {group.id === 'account' && (
                <SettingsRowItem
                  label={t('settings.hub.rows.signOut')}
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
