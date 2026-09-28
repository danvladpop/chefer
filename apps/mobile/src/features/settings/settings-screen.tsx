import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { ConfirmSheet, Screen, Text } from '@chefer/ui-mobile';
import { WELLNESS_COPY } from '@chefer/utils';
import { clearToken } from '../../lib/auth-store';
import { trpc } from '../../lib/trpc';

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
}

interface SettingsGroup {
  title: string;
  rows: SettingsRow[];
}

const GROUPS: SettingsGroup[] = [
  {
    title: 'You',
    rows: [
      { label: 'What you use Chefer for', testID: 'settings-jobs', href: '/preferences' },
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
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSettled: async () => {
      // Even if the network call failed, drop the local session — the token
      // may already be dead server-side.
      await clearToken();
      utils.invalidate().catch(() => {
        // Cache cleanup only; the auth gate has already routed to login.
      });
    },
  });

  return (
    <Screen className="gap-2 px-0">
      <Text variant="title" className="px-4">
        Settings
      </Text>
      <ScrollView contentContainerClassName="gap-2 pb-8">
        {GROUPS.map((group) => (
          <View key={group.title}>
            <GroupTitle>{group.title}</GroupTitle>
            <View className="mx-4 overflow-hidden rounded-2xl border border-border bg-card">
              {group.rows.map((row, i) => (
                <SettingsRowItem
                  key={row.testID}
                  label={row.label}
                  testID={row.testID}
                  isFirst={i === 0}
                  onPress={() => router.push(row.href)}
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
        body="You can sign back in any time."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          setSignOutVisible(false);
          logout.mutate();
        }}
      />
    </Screen>
  );
}
