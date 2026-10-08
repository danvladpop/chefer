import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors, countPillText } from '@chefer/ui-mobile';
import { SnackbarAwareTabBar } from '../../src/components/snackbar-tab-bar';
import { useFriendsMe } from '../../src/features/friends/api/use-friends-me';
import { TAB_BAR_SCREEN_OPTIONS } from '../../src/lib/tab-bar-options';

// Gym mode tab bar (gym_plan.md D3): Today / Routine / Exercises / Stats /
// More (FB7-01). Screens are not `index` and not `more` — both tab groups
// resolve at the root, so "/" belongs to the food dashboard and "/more" to the
// food More tab; Gym's is `gym-more`.
export default function GymTabsLayout() {
  // Same in-app Following badge as Food's More tab (pending requests + unread
  // Activity, hidden at 0). Shares the useFriendsMe cache with the Food layout.
  const { badgeCount } = useFriendsMe();
  return (
    <Tabs
      screenOptions={TAB_BAR_SCREEN_OPTIONS}
      // R-11: lets the global snackbar sit above the tab bar.
      tabBar={(props) => <SnackbarAwareTabBar {...props} />}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="today-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="routine"
        options={{
          title: 'Routine',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          title: 'Exercises',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="barbell-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="gym-more"
        options={{
          title: 'More',
          tabBarBadge: badgeCount > 0 ? countPillText(badgeCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            fontSize: 12,
          },
          tabBarAccessibilityLabel: badgeCount > 0 ? `More, ${badgeCount} new` : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" color={color} size={size + 2} />
          ),
        }}
      />
    </Tabs>
  );
}
