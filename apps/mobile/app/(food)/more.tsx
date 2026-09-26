import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Button, Screen, Text } from '@chefer/ui-mobile';
import { FeedbackCard } from '../../src/features/feedback/feedback-card';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { getWebUrl } from '../../src/lib/api-url';
import { clearToken } from '../../src/lib/auth-store';
import { CURRENT_BUILD } from '../../src/lib/current-build';
import { trpc } from '../../src/lib/trpc';

// Secondary nav hub — the mobile counterpart of web's MobileNavDrawer
// (SECONDARY_NAV_ITEMS in apps/web/src/features/nav/nav-items.ts). P2-2 /
// P2-8: Tracker moved into Today ("See full day"), Pantry into Shop ("In my
// kitchen"), History into My weeks. Their screens still open by route.
const ITEMS: {
  href: Href;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  testID: string;
}[] = [
  { href: '/chat', label: 'AI Chef', icon: 'chatbubble-ellipses-outline', testID: 'more-ai chef' },
  { href: '/progress', label: 'Progress', icon: 'stats-chart-outline', testID: 'more-progress' },
  { href: '/my-weeks', label: 'My weeks', icon: 'repeat-outline', testID: 'more-my-weeks' },
  { href: '/household', label: 'Household', icon: 'people-outline', testID: 'more-household' },
  { href: '/profile', label: 'Profile', icon: 'person-outline', testID: 'more-profile' },
  {
    href: '/preferences',
    label: 'Preferences',
    icon: 'settings-outline',
    testID: 'more-preferences',
  },
];

export default function MoreScreen() {
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
    <Screen className="gap-4 px-0">
      <ModeSwitch className="mx-4 mt-3" />
      <Text variant="title" className="px-4">
        More
      </Text>
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {ITEMS.map((item, i) => (
            <Pressable
              key={item.label}
              testID={item.testID}
              accessibilityRole="button"
              onPress={() => router.push(item.href)}
              className={
                i > 0
                  ? 'min-h-12 flex-row items-center gap-3 border-t border-border px-4'
                  : 'min-h-12 flex-row items-center gap-3 px-4'
              }
            >
              <Ionicons name={item.icon} size={20} color="#944a00" />
              <Text className="flex-1 text-sm font-medium text-gray-800">{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </Pressable>
          ))}
        </View>

        <FeedbackCard />

        {/* Legal pages — both app stores require them in the app (F-M-PROF-1-1). */}
        <View className="flex-row justify-center gap-6">
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(getWebUrl('/terms'))}
            className="min-h-11 justify-center"
          >
            <Text className="text-sm text-gray-500 underline">Terms</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(getWebUrl('/privacy'))}
            className="min-h-11 justify-center"
          >
            <Text className="text-sm text-gray-500 underline">Privacy</Text>
          </Pressable>
          <Pressable
            testID="more-support"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(getWebUrl('/support'))}
            className="min-h-11 justify-center"
          >
            <Text className="text-sm text-gray-500 underline">Support</Text>
          </Pressable>
        </View>

        <Button
          testID="logout-button"
          variant="outline"
          loading={logout.isPending}
          onPress={() => logout.mutate()}
        >
          Sign out
        </Button>

        <Text testID="build-info" className="text-center text-xs text-gray-400">
          {CURRENT_BUILD}
        </Text>
      </ScrollView>
    </Screen>
  );
}
