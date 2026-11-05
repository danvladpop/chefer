import { router, type Href } from 'expo-router';
import {
  CountPill,
  KeyboardAwareScrollView,
  ListRow,
  ListSection,
  Screen,
  Stagger,
  useFirstEntrance,
  useThemeColors,
} from '@chefer/ui-mobile';
import { PROGRESS_COPY } from '@chefer/utils';
import { Icon, type IconName } from '../../components/icon';
import { track } from '../../lib/analytics';
import { getTranslator, useT } from '../../lib/i18n';
import { trpc } from '../../lib/trpc';
import { AppearanceRow } from '../appearance/appearance-screen';
import { useFriendsBadge } from '../friends/api/use-friends-badge';
import { noticeText, useHouseholdNotices } from '../household/sharing/household-notices';
import { FOLLOWING_ITEM, TRAINER_TOOLS_ITEM, YOUR_TRAINER_ITEM } from '../more/more-items';
import { TierRow } from '../premium/tier-row';
import { ChefCard } from '../progress/chef-card';
import { useProgressEnabled } from '../progress/use-progress';
import { ModeSwitchSection } from '../trainer-mode/mode-switch-row';
import { useTrainerBadges, useTrainerModeAvailability } from '../trainer-mode/use-trainer-mode';
import { useCoachingAvailability } from '../trainer/api/use-coaching-availability';
import { ShellTopBar } from './shell-chrome';
import { ShellPreviewSection } from './shell-preview-row';
import { YouFeedbackRow } from './you/feedback-row';
import { YouHelpSection, YouSignOutFooter } from './you/you-footer';

// ─── You (plan: "You"; 10 Oct redesign board "You") ─────────────────────────
// The old Food More and Gym More tabs, the header gear and the avatar, merged
// into one place — and, since 10 Oct, the single home of every setting:
// Meals, Training, Notifications and Account each get one row here instead
// of a "Settings" hub that mixed them. Grouped the way iOS Settings and
// Google's account pages group: what you've done, how the app behaves, who
// you share with, help. Every row is a push (Send feedback opens a sheet);
// sign out is the one destructive row, at the bottom.
// Trainer mode (trainer-mode.md §6.9): for an active trainer with the
// `trainerMode` flag, the first row is "Switch to trainer mode" with the
// trainer badge, and "Trainer tools" goes (trainer mode replaces it). A user
// who may be a trainer but hasn't turned the tools on keeps "Trainer tools":
// it leads to the turn-on screen.

/** The row titles and subtitles this screen translates (catalog keys). */
type RowKey =
  | 'nav.items.stats'
  | 'nav.items.myWeeks'
  | 'today.shell.you.meals'
  | 'today.shell.you.mealsDetail'
  | 'today.shell.you.training'
  | 'today.shell.you.trainingDetail'
  | 'today.shell.you.notifications'
  | 'today.shell.you.account'
  | 'today.shell.you.accountDetail';

// `title` is literal text (the gamification rows' PROGRESS_COPY), `titleKey` a catalog key.
type Row = {
  title?: string;
  titleKey?: RowKey;
  subtitleKey?: RowKey;
  href: Href;
  icon: IconName;
  testID: string;
};

// Kitchen progress rows (shown only when it is on): Achievements leads "Your
// progress", Rewards & motivation leads "Settings".
const ACHIEVEMENTS_ROW: Row = {
  title: PROGRESS_COPY.achievementsTitle,
  href: '/achievements',
  icon: 'trophy',
  testID: 'you-achievements',
};
const REWARDS_ROW: Row = {
  title: PROGRESS_COPY.settingsTitle,
  href: '/settings/rewards',
  icon: 'trophy',
  testID: 'you-rewards',
};

const PROGRESS_ROWS: readonly Row[] = [
  { titleKey: 'nav.items.stats', href: '/progress', icon: 'progress', testID: 'you-progress' },
  { titleKey: 'nav.items.myWeeks', href: '/my-weeks', icon: 'weeks', testID: 'you-my-weeks' },
];

// Meal settings (`/settings/meals`) and Training settings (`/gym/settings`)
// are where the old Food and Training rows of Settings moved; Account
// (`/settings`) keeps goal, targets, Premium and privacy.
const SETTINGS_ROWS: readonly Row[] = [
  {
    titleKey: 'today.shell.you.meals',
    subtitleKey: 'today.shell.you.mealsDetail',
    href: '/settings/meals',
    icon: 'meals',
    testID: 'you-meal-settings',
  },
  {
    titleKey: 'today.shell.you.training',
    subtitleKey: 'today.shell.you.trainingDetail',
    href: '/gym/settings',
    icon: 'barbell',
    testID: 'you-training-settings',
  },
  {
    titleKey: 'today.shell.you.notifications',
    href: '/settings/notifications',
    icon: 'notifications',
    testID: 'you-notifications',
  },
  {
    titleKey: 'today.shell.you.account',
    subtitleKey: 'today.shell.you.accountDetail',
    href: '/settings',
    icon: 'account',
    testID: 'you-account',
  },
];

/** "You + Ana", "You + Ana, Ben", "You + 3"; nothing while it's just you. */
export function householdSummary(names: readonly string[]): string | undefined {
  if (names.length === 0) return undefined;
  const { t } = getTranslator();
  if (names.length <= 2) return t('today.shell.you.householdNames', { names: names.join(', ') });
  return t('today.shell.you.householdCount', { count: names.length });
}

export function YouScreen() {
  const { t } = useT();
  const colors = useThemeColors();
  // MO-03: the sections rise in on the first visit of the session only.
  const firstEntrance = useFirstEntrance('you');
  const { available, badgeCount } = useFriendsBadge();
  // WP-18: "Your trainer" for everyone while coaching is on, "Trainer tools" for allowed trainers.
  const coaching = useCoachingAvailability();
  const trainerMode = useTrainerModeAvailability();
  const trainerBadges = useTrainerBadges();
  // Same cached query (and staleTime) as Profile's household row.
  const { data: members = [] } = trpc.household.list.useQuery(undefined, { staleTime: 60_000 });
  const household = householdSummary(members.map((m) => m.name));
  // Kitchen progress (gamification flag + revamp shell + availability): extra rows, the Chef card.
  const progressOn = useProgressEnabled();
  // ADR 0003: "Maria joined your household" waits on the Household row (no server push).
  const householdNotices = useHouseholdNotices();
  const latestNotice = householdNotices[0];

  const row = (item: Row) => (
    <ListRow
      key={item.testID}
      testID={item.testID}
      title={item.titleKey ? t(item.titleKey) : (item.title ?? '')}
      {...(item.subtitleKey ? { subtitle: t(item.subtitleKey) } : {})}
      icon={<Icon name={item.icon} color={colors.brand} />}
      onPress={() => router.push(item.href)}
    />
  );

  return (
    <Screen className="bg-canvas px-0">
      <KeyboardAwareScrollView testID="you-scroll" contentContainerClassName="gap-6 px-4 pb-8">
        <Stagger enabled={firstEntrance}>
          <ShellTopBar />

          {trainerMode ? (
            <ModeSwitchSection
              to="trainer"
              waiting={trainerBadges.total}
              testID="you-switch-to-trainer"
            />
          ) : null}

          <ChefCard />

          <TierRow />

          <ListSection title={t('today.shell.you.progressSection')}>
            {(progressOn ? [ACHIEVEMENTS_ROW, ...PROGRESS_ROWS] : PROGRESS_ROWS).map(row)}
          </ListSection>

          <ListSection title={t('today.shell.you.settingsSection')}>
            {(progressOn ? [REWARDS_ROW, ...SETTINGS_ROWS] : SETTINGS_ROWS)
              .filter((r) => r.testID !== 'you-account')
              .map(row)}
            {/* Night mode: Automatic · Day · Night, just above Account. */}
            <AppearanceRow />
            {SETTINGS_ROWS.filter((r) => r.testID === 'you-account').map(row)}
          </ListSection>

          <ListSection title={t('today.shell.you.peopleSection')}>
            <ListRow
              testID="you-household"
              title={t('today.shell.you.household')}
              {...(household ? { value: household } : {})}
              {...(latestNotice ? { subtitle: noticeText(latestNotice) } : {})}
              badge={
                householdNotices.length > 0 ? (
                  <CountPill count={householdNotices.length} testID="you-household-badge" />
                ) : null
              }
              icon={<Icon name="household" color={colors.brand} />}
              onPress={() => router.push('/household')}
            />
            {available ? (
              <ListRow
                testID="you-friends"
                title={FOLLOWING_ITEM.label}
                icon={<Icon name="following" color={colors.brand} />}
                badge={
                  badgeCount > 0 ? (
                    <CountPill count={badgeCount} testID="you-friends-badge" />
                  ) : null
                }
                onPress={() => {
                  track('friends_opened', { source: 'more' });
                  router.push(FOLLOWING_ITEM.href);
                }}
              />
            ) : null}
            {coaching.enabled ? (
              <ListRow
                testID="you-your-trainer"
                title={YOUR_TRAINER_ITEM.label}
                icon={<Icon name="yourTrainer" color={colors.brand} />}
                onPress={() => router.push(YOUR_TRAINER_ITEM.href)}
              />
            ) : null}
            {coaching.canBeTrainer && !trainerMode ? (
              <ListRow
                testID="you-trainer-tools"
                title={TRAINER_TOOLS_ITEM.label}
                icon={<Icon name="trainerTools" color={colors.brand} />}
                onPress={() => router.push(TRAINER_TOOLS_ITEM.href)}
              />
            ) : null}
          </ListSection>

          <ShellPreviewSection footer={t('today.shell.you.previewFooter')} />

          <YouHelpSection feedback={<YouFeedbackRow />} />

          <YouSignOutFooter />
        </Stagger>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
