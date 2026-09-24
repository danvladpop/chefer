import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, usePathname } from 'expo-router';
import { shouldOpenGymHome } from '../../src/features/gym/mode-store';

// Food mode tab bar. Mirrors PRIMARY_NAV_ITEMS + "More" from
// apps/web/src/features/nav/nav-items.ts. (Renamed from `(tabs)` for the
// Food / Gym mode switch — gym_plan.md §5.1; URLs are unchanged.)
export default function FoodTabsLayout() {
  // "/" is home; in Gym mode home is Today (launch / sign-in in Gym mode).
  // Decided once at mount so switching back to Food never bounces.
  const pathname = usePathname();
  const [openGym] = useState(() => shouldOpenGymHome(pathname));
  if (openGym) {
    return <Redirect href="/today" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#944a00',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="meal-plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Recipes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping-list"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
