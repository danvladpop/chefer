import { PROGRESS_COPY } from '@chefer/utils';
import { RewardsSettingsScreen } from '../../src/features/progress/rewards-settings-screen';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';

// Kitchen progress: Rewards & motivation, pushed from You → Settings. Revamp
// shell only; the screen gates itself on `progress.availability`.
export default function RewardsSettingsRoute() {
  return (
    <ShellChromeProvider
      value={{ kind: 'pushed', fallback: '/you', title: PROGRESS_COPY.settingsTitle }}
    >
      <RewardsSettingsScreen />
    </ShellChromeProvider>
  );
}
