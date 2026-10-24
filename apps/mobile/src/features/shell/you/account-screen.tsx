import { ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { Catalog, Translator } from '@chefer/i18n';
import { ListRow, ListSection, Screen, Text } from '@chefer/ui-mobile';
import { useIsPremium } from '../../../hooks/use-is-premium';
import { useLocaleChoice, useT } from '../../../lib/i18n';
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

/** A row before translation: the title is a catalog key. */
type RowSpec = {
  titleKey: `settings.hub.rows.${keyof Catalog['settings']['hub']['rows']}`;
  testID: string;
  href: Href;
};

const YOU_ROWS: readonly RowSpec[] = [
  { titleKey: 'settings.hub.rows.jobs', testID: 'settings-jobs', href: '/settings/jobs' },
  {
    titleKey: 'settings.hub.rows.goalBody',
    testID: 'settings-goal-body',
    href: '/preferences?section=goal-body',
  },
  {
    titleKey: 'settings.hub.rows.targets',
    testID: 'settings-targets',
    href: '/preferences?section=targets',
  },
];

const LEGAL_ROWS: readonly RowSpec[] = [
  { titleKey: 'settings.hub.rows.terms', testID: 'settings-terms', href: legalHref('terms') },
  {
    titleKey: 'settings.hub.rows.privacyPolicy',
    testID: 'settings-privacy-policy',
    href: legalHref('privacy'),
  },
];

function accountRows(
  t: Translator['t'],
  isPremium: boolean | undefined,
  friendsAvailable: boolean,
  language: { title: string; value: string },
): AccountRow[] {
  return [
    {
      title: t('settings.hub.rows.planPremium'),
      testID: 'settings-plan-premium',
      href: '/profile?section=plan',
      // Nothing while the user loads: no "Free" flash for a Premium account.
      value:
        isPremium === undefined
          ? undefined
          : isPremium
            ? t('settings.account.planPremium')
            : t('settings.account.planFree'),
    },
    {
      title: t('settings.hub.rows.emails'),
      testID: 'settings-emails',
      href: '/preferences?section=weekly-updates',
    },
    // ADR 0004: shows the language in itself ("Română"), so it is findable in any language.
    { ...language, testID: 'settings-language', href: '/settings/language' },
    {
      title: t('settings.hub.rows.privacyData'),
      testID: 'settings-privacy',
      href: '/profile?section=privacy',
    },
    {
      title: t('settings.hub.rows.accountData'),
      testID: 'settings-account-data',
      href: '/profile?section=account',
    },
    // Only while `friends.availability` says yes (same gate as You → Following).
    ...(friendsAvailable
      ? [
          {
            title: t('friends.settings.title'),
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
  const { t, locale } = useT();
  const choice = useLocaleChoice();
  const language = {
    title: t('settings.language.title'),
    value: choice ? t(`settings.language.names.${locale}`) : t('settings.language.automatic'),
  };

  const spec = (item: RowSpec): AccountRow => ({
    title: t(item.titleKey),
    testID: item.testID,
    href: item.href,
  });

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
    <ShellChromeProvider
      value={{ kind: 'pushed', fallback: '/you', title: t('settings.account.title') }}
    >
      <Screen className="bg-canvas px-0">
        <View testID="account-header" className="px-4">
          <ShellTopBar />
        </View>
        <ScrollView testID="account-scroll" contentContainerClassName="gap-6 px-4 pb-8 pt-2">
          <ListSection title={t('settings.hub.groups.you')}>
            {YOU_ROWS.map(spec).map(row)}
          </ListSection>
          <ListSection title={t('settings.hub.groups.account')}>
            {accountRows(t, isPremium, friendsAvailable, language).map(row)}
          </ListSection>
          <ListSection title={t('settings.hub.groups.legal')}>
            {LEGAL_ROWS.map(spec).map(row)}
          </ListSection>
          {/* T-22.3: the medical/legal disclaimer stays visible on this screen. */}
          <Text
            testID="settings-about-disclaimer"
            className="px-4 text-caption text-label-secondary"
          >
            {t('settings.account.disclaimer')}
          </Text>
        </ScrollView>
      </Screen>
    </ShellChromeProvider>
  );
}
