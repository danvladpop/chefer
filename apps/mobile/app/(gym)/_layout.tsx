import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { TAB_BAR_SCREEN_OPTIONS } from '../../src/lib/tab-bar-options';

// Gym mode tab bar (gym_plan.md D3): Today / Routine / Exercises / Stats.
// Screens are not `index` — both tab groups resolve at the root, and "/"
// belongs to the food dashboard.
export default function GymTabsLayout() {
  return (
    <Tabs screenOptions={TAB_BAR_SCREEN_OPTIONS}>
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
    </Tabs>
  );
}
