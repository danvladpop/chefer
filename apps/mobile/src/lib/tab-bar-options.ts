/**
 * Shared tab-bar look for BOTH mode tab bars (Food / Gym). Labels are 12pt
 * semibold instead of React Navigation's 10pt default (dogfood #10: text too
 * small on the phone); icons are drawn 2pt larger in each layout.
 */
export const TAB_BAR_SCREEN_OPTIONS = {
  headerShown: false,
  tabBarActiveTintColor: '#944a00',
  tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
} as const;
