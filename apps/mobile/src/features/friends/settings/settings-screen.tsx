import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import {
  EmptyState,
  ErrorState,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  Skeleton,
  Text,
} from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';
import { useFriendsMe } from '../api/use-friends-me';
import { FriendsGate } from '../components/friends-gate';
import { FriendsScreenHeader } from '../components/friends-screen-header';
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

function SectionHeading({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text
      testID={testID}
      accessibilityRole="header"
      className="pt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {children}
    </Text>
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
  return (
    <PressableScale
      testID={testID}
      pressScale="card"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-2 py-2"
    >
      <Text className="min-w-0 flex-1">{label}</Text>
      {trailing}
      <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
    </PressableScale>
  );
}

function SettingsBody() {
  const { me, isLoading, isError, refetch } = useFriendsMe();
  // `friends.me` has no id; the preview opens my own profile by it.
  const { data: user } = trpc.auth.me.useQuery(undefined, { staleTime: 30_000 });
  const [turnOffVisible, setTurnOffVisible] = useState(false);

  if (isLoading || (!me && !isError)) {
    return (
      <View testID="friends-settings-loading" className="gap-3 px-4 pt-6">
        <Skeleton className="h-6 w-1/2 rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
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
        title={FRIENDS_COPY.server.notActivated}
        action={{
          label: FRIENDS_COPY.intro.cta,
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
        <SectionHeading testID="friends-settings-who">{FRIENDS_COPY.settings.who}</SectionHeading>
        <VisibilitySection me={me} settings={settings} />

        <SectionHeading testID="friends-settings-name-heading">
          {FRIENDS_COPY.intro.nameHeading}
        </SectionHeading>
        <NameSection me={me} />

        <SectionHeading testID="friends-settings-what">{FRIENDS_COPY.settings.what}</SectionHeading>
        <SharingSection settings={settings} />
        <LinkRow
          testID="friends-settings-preview"
          label={FRIENDS_COPY.settings.preview}
          disabled={!user}
          onPress={() => user && router.push(`/friends/${user.id}`)}
        />

        <SectionHeading testID="friends-settings-safety">
          {FRIENDS_COPY.settings.safety}
        </SectionHeading>
        <LinkRow
          testID="friends-settings-blocked"
          label={FRIENDS_COPY.settings.blocked(me.counts.blocked)}
          onPress={() => router.push('/friends/blocked')}
        />

        <View className="mt-4 border-t border-border pt-2">
          <PressableScale
            testID="friends-settings-turn-off"
            pressScale="card"
            accessibilityRole="button"
            accessibilityLabel={FRIENDS_COPY.settings.turnOff}
            onPress={() => setTurnOffVisible(true)}
            className="min-h-11 justify-center py-2"
          >
            <Text className="font-medium text-destructive">{FRIENDS_COPY.settings.turnOff}</Text>
          </PressableScale>
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
  return (
    <FriendsGate>
      <Screen testID="friends-settings" className="px-0">
        <FriendsScreenHeader
          title={FRIENDS_SCREEN_TITLES.settings}
          testID="friends-settings-header"
        />
        <SettingsBody />
      </Screen>
    </FriendsGate>
  );
}
