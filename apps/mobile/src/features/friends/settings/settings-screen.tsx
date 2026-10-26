import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  EmptyState,
  ErrorState,
  IconButton,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  Skeleton,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { useFriendsMe } from '../api/use-friends-me';
import { FriendsGate } from '../components/friends-gate';
import { FRIENDS_SCREEN_TITLES } from '../components/screen-titles';
import { NameSection } from './name-section';
import { SharingSection } from './sharing-section';
import { TurnOffSheet } from './turn-off-sheet';
import { VisibilitySection } from './visibility-section';

// ─── Sharing & privacy (`/friends/settings`, UX §11.1, FR-03–FR-05) ────────────
// Who can follow you · How others will see you (name) · What followers can see ·
// Safety (Blocked people) · Turn off Following. There is NO notifications
// section: Following has no push or email (PRD Q-F-14), the badge is the only
// notification.
//
// 11 Oct restyle: the shell's look — canvas, ShellTopBar's brand chevron +
// title1 top bar (drawn here so the header keeps its testIDs), ListSection-
// style titled groups on hairline surface cards, colour roles only.

/**
 * The page's top bar in the shell's look (ShellTopBar: brand chevron Back +
 * title1). Back falls back to `fallback` when there is no history. Shared by
 * Blocked people.
 */
export function SettingsTopBar({
  title,
  fallback,
  testID,
}: {
  title: string;
  fallback: Href;
  testID: string;
}) {
  const { t } = useT();
  const colors = useThemeColors();
  return (
    <View testID={testID} className="mx-4 mt-3 min-h-11 flex-row items-center gap-1">
      <IconButton
        testID={`${testID}-back`}
        accessibilityLabel={t('common.actions.back')}
        icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
        className="-ml-2"
      />
      <Text
        testID={`${testID}-title`}
        accessibilityRole="header"
        numberOfLines={2}
        className="min-w-0 flex-1 text-title1 font-bold text-label"
      >
        {title}
      </Text>
    </View>
  );
}

function SectionHeading({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text
      testID={testID}
      accessibilityRole="header"
      className="px-4 pb-1.5 pt-5 text-subhead font-semibold text-label-secondary"
    >
      {children}
    </Text>
  );
}

/** A section's body: a hairline surface card, rows inset by px-4. */
function Group({ children }: { children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-card border border-separator bg-surface px-4 py-1">
      {children}
    </View>
  );
}

function LinkRow({
  testID,
  label,
  onPress,
  disabled = false,
  trailing,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <PressableScale
      testID={testID}
      pressScale="card"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn('min-h-11 flex-row items-center gap-2 py-3', disabled && 'opacity-50')}
    >
      <Text className="min-w-0 flex-1 text-body text-label">{label}</Text>
      {trailing}
      <Icon name="chevronRight" size={18} color={colors.labelTertiary} />
    </PressableScale>
  );
}

function SettingsBody() {
  const { t } = useT();
  const { me, isLoading, isError, refetch } = useFriendsMe();
  // `friends.me` has no id; the preview opens my own profile by it.
  const { data: user } = trpc.auth.me.useQuery(undefined, { staleTime: 30_000 });
  const [turnOffVisible, setTurnOffVisible] = useState(false);

  if (isLoading || (!me && !isError)) {
    return (
      <View testID="friends-settings-loading" className="gap-3 px-4 pt-6">
        <Skeleton className="h-6 w-1/2 rounded-inner" />
        <Skeleton className="h-11 w-full rounded-card" />
        <Skeleton className="h-11 w-full rounded-card" />
        <Skeleton className="h-11 w-full rounded-card" />
      </View>
    );
  }
  if (!me) {
    return <ErrorState testID="friends-settings-error" onRetry={refetch} />;
  }
  const settings = me.settings;
  if (!me.activated || !settings) {
    return (
      <EmptyState
        testID="friends-settings-not-activated"
        title={t('friends.settings.notActivated')}
        action={{
          label: t('friends.intro.cta'),
          testID: 'friends-settings-turn-on',
          onPress: () => router.replace('/friends'),
        }}
      />
    );
  }

  return (
    <>
      <KeyboardAwareScrollView
        testID="friends-settings-scroll"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      >
        <SectionHeading testID="friends-settings-who">{t('friends.settings.who')}</SectionHeading>
        <Group>
          <VisibilitySection me={me} settings={settings} />
        </Group>

        <SectionHeading testID="friends-settings-name-heading">
          {t('friends.intro.nameHeading')}
        </SectionHeading>
        <View className="rounded-card border border-separator bg-surface p-4">
          <NameSection me={me} />
        </View>

        <SectionHeading testID="friends-settings-what">{t('friends.settings.what')}</SectionHeading>
        <Group>
          <SharingSection settings={settings} />
          <View className="h-px bg-separator" />
          <LinkRow
            testID="friends-settings-preview"
            label={t('friends.settings.preview')}
            disabled={!user}
            onPress={() => user && router.push(`/friends/${user.id}`)}
          />
        </Group>

        <SectionHeading testID="friends-settings-safety">
          {t('friends.settings.safety')}
        </SectionHeading>
        <Group>
          <LinkRow
            testID="friends-settings-blocked"
            label={t('friends.settings.blocked', { n: me.counts.blocked })}
            onPress={() => router.push('/friends/blocked')}
          />
        </Group>

        <View className="mt-6">
          <Group>
            <PressableScale
              testID="friends-settings-turn-off"
              pressScale="card"
              accessibilityRole="button"
              accessibilityLabel={t('friends.settings.turnOff')}
              onPress={() => setTurnOffVisible(true)}
              className="min-h-11 justify-center py-3"
            >
              <Text className="text-body text-danger">{t('friends.settings.turnOff')}</Text>
            </PressableScale>
          </Group>
        </View>
      </KeyboardAwareScrollView>

      <TurnOffSheet
        visible={turnOffVisible}
        counts={me.counts}
        onClose={() => setTurnOffVisible(false)}
      />
    </>
  );
}

export function FriendsSettingsScreen() {
  const { t } = useT();
  return (
    <FriendsGate>
      <Screen testID="friends-settings" className="bg-canvas px-0">
        <SettingsTopBar
          title={t(FRIENDS_SCREEN_TITLES.settings)}
          fallback="/friends"
          testID="friends-settings-header"
        />
        <SettingsBody />
      </Screen>
    </FriendsGate>
  );
}
