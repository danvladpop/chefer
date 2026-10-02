import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import { ConfirmSheet, Screen, Text } from '@chefer/ui-mobile';
import { WELLNESS_COPY } from '@chefer/utils';
import { track } from '../../lib/analytics';
import { useFriendsAvailability } from '../friends/api/use-friends-availability';
import { unsyncedWorkoutsText, useSignOut } from './use-sign-out';

// ─── Settings hub (T-00.9, PAT-9 §2.9) ─────────────────────────────────────────
// One Settings entry from both modes (the ModeSwitch gear). Every row below
// points at an EXISTING screen — several rows share a destination because
// the anchor/card the settings map describes there (targets card, jobs
// editor, training-day kinds, Emails/Privacy sections…) is wave-1 work
// (UX-03, UX-35, UX-06, UX-39); this wave only wires the hub shell so no
// lane needs to touch navigation again to add its row.

interface SettingsRow {
  label: string;
  testID: string;
  href: Href;
  destructive?: boolean;
  onOpen?: () => void;
}

interface SettingsGroup {
  title: string;
  rows: SettingsRow[];
}

const GROUPS: SettingsGroup[] = [
  {
    title: 'You',
    rows: [
      { label: 'What you use Chefer for', testID: 'settings-jobs', href: '/settings/jobs' },
      { label: 'Goal & body', testID: 'settings-goal-body', href: '/preferences' },
      { label: 'Your targets', testID: 'settings-targets', href: '/preferences' },
    ],
  },
  {
    title: 'Food',
    rows: [
      { label: 'Allergies & diets', testID: 'settings-safety', href: '/preferences' },
      { label: 'How you cook', testID: 'settings-how-you-cook', href: '/preferences' },
      { label: 'Household', testID: 'settings-household', href: '/household' },
      { label: 'Money & units', testID: 'settings-money-units', href: '/preferences' },
      { label: 'Weekly budget', testID: 'settings-budget', href: '/preferences' },
      { label: 'Plan my week automatically', testID: 'settings-auto-plan', href: '/preferences' },
    ],
  },
  {
    title: 'Training',
    rows: [
      {
        label: 'Training days & reminders',
        testID: 'settings-training-days',
        href: '/gym/settings',
      },
      { label: 'Pause training', testID: 'settings-pause', href: '/gym/settings' },
      {
        label: 'Units, equipment & weekly goal',
        testID: 'settings-gym-units',
        href: '/gym/settings',
      },
      { label: 'Workout history', testID: 'settings-workout-history', href: '/stats' },
      { label: 'Export workouts', testID: 'settings-export', href: '/gym/settings' },
    ],
  },
  {
    title: 'Account',
    rows: [
      { label: 'Plan & Premium', testID: 'settings-plan-premium', href: '/profile' },
      { label: 'Emails', testID: 'settings-emails', href: '/profile' },
      { label: 'Privacy & data', testID: 'settings-privacy', href: '/profile' },
    ],
  },
];

// Following (docs/friends/ux-design.md §2.1): the first Account row, and Gym
// mode's way in (Gym has no More tab). Only while `friends.availability` says
// yes — with it off the row doesn't exist and nothing else is queried.
const FOLLOWING_ROW: SettingsRow = {
  label: FRIENDS_COPY.nav.label,
  testID: 'settings-friends',
  href: '/friends',
  onOpen: () => track('friends_opened', { source: 'settings' }),
};

function groupsFor(friendsAvailable: boolean): SettingsGroup[] {
  if (!friendsAvailable) return GROUPS;
  return GROUPS.map((group) =>
    group.title === 'Account' ? { ...group, rows: [FOLLOWING_ROW, ...group.rows] } : group,
  );
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

export function SettingsScreen() {
  const [signOutVisible, setSignOutVisible] = useState(false);
  const { enabled: friendsAvailable } = useFriendsAvailability();
  const groups = groupsFor(friendsAvailable);
  const signOut = useSignOut('settings-sign-out-warning');

  return (
    <Screen className="gap-2 px-0">
      <Text variant="title" className="px-4">
        Settings
      </Text>
      <ScrollView contentContainerClassName="gap-2 pb-8">
        {groups.map((group) => (
          <View key={group.title}>
            <GroupTitle>{group.title}</GroupTitle>
            <View className="mx-4 overflow-hidden rounded-2xl border border-border bg-card">
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
                  onPress={() => setSignOutVisible(true)}
                />
              )}
            </View>
          </View>
        ))}
        {/* T-22.3: the medical/legal disclaimer, always visible on Settings. */}
        <Text testID="settings-about-disclaimer" variant="muted" className="px-4 text-xs">
          {WELLNESS_COPY.aboutMedicalDisclaimer}
        </Text>
      </ScrollView>

      <ConfirmSheet
        testID="settings-sign-out-confirm"
        visible={signOutVisible}
        onClose={() => setSignOutVisible(false)}
        title="Sign out of Chefer?"
        // UX-ACC-12: workouts that exist only on this phone are deleted by signing out.
        body={
          signOut.unsynced > 0
            ? unsyncedWorkoutsText(signOut.unsynced)
            : 'You can sign back in any time.'
        }
        confirmLabel={signOut.unsynced > 0 ? 'Sign out anyway' : 'Sign out'}
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          setSignOutVisible(false);
          signOut.proceed();
        }}
      />
    </Screen>
  );
}
