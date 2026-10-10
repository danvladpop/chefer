import { Appearance, Platform } from 'react-native';

// UX-X-07 (mobile UX revamp, phase 0): the app is light-only, but the binary
// ships `userInterfaceStyle: 'automatic'`, so on a phone in dark mode iOS
// drew the keyboard, alerts, the share sheet and pickers dark over light
// screens. Overriding the app's own style at launch fixes that over the air;
// the planned native fix (`userInterfaceStyle: 'light'`) can still land with
// the next binary. iOS only: on Android the override goes through
// AppCompatDelegate's night mode, which can recreate the activity, and the
// reported mismatch was iOS. Phase 4's Appearance setting replaces this with
// the user's choice (System, Light, Dark).
export function forceLightAppearance(): void {
  if (Platform.OS !== 'ios') return;
  try {
    Appearance.setColorScheme('light');
  } catch {
    // An older native runtime without the override: keep today's behaviour.
  }
}
