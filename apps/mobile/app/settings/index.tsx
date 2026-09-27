import { SettingsScreen } from '../../src/features/settings/settings-screen';

// One Settings entry from both modes (T-00.9, PAT-9 §2.9): opened by the
// `settings-outline` gear in the ModeSwitch header row, and by More's
// "Settings" row (renamed from "Preferences").
export default function SettingsRoute() {
  return <SettingsScreen />;
}
