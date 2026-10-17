import { GymSettingsScreen } from '../../src/features/gym/settings/settings-screen';
import { useShellV2 } from '../../src/features/shell/shell-store';
import { TrainingSettingsRoute } from '../../src/features/shell/train/training-settings-screen';

// Gym stack route (G2-B): units, equipment, reminders, pause, sync status.
// New shell (10 Oct redesign): "Training settings" — an overview whose rows
// open one legacy section each (`?section=<part>`); the old shell is unchanged.
export default function GymSettingsRoute() {
  const shellV2 = useShellV2();
  return shellV2 ? <TrainingSettingsRoute /> : <GymSettingsScreen />;
}
