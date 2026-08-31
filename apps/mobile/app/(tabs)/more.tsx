import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Button, Screen, Text } from '@chefer/ui-mobile';
import { clearToken } from '../../src/lib/auth-store';
import { trpc } from '../../src/lib/trpc';

// Secondary nav hub — the mobile counterpart of web's MobileNavDrawer
// (SECONDARY_NAV_ITEMS in apps/web/src/features/nav/nav-items.ts). Rows are
// added as their screens land in Wave 2.
const ITEMS: { href: Href; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { href: '/chat', label: 'AI Chef', icon: 'chatbubble-ellipses-outline' },
  { href: '/tracker', label: 'Tracker', icon: 'pulse-outline' },
  { href: '/pantry', label: 'Pantry', icon: 'file-tray-stacked-outline' },
  { href: '/profile', label: 'Profile', icon: 'person-outline' },
  { href: '/preferences', label: 'Preferences', icon: 'settings-outline' },
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
      <Text variant="title" className="px-4 pt-4">
        More
      </Text>
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {ITEMS.map((item, i) => (
            <Pressable
              key={item.label}
              testID={`more-${item.label.toLowerCase()}`}
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

        <Button
          testID="logout-button"
          variant="outline"
          loading={logout.isPending}
          onPress={() => logout.mutate()}
        >
          Sign out
        </Button>
      </ScrollView>
    </Screen>
  );
}
