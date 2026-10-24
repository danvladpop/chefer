import { PROGRESS_COPY } from '@chefer/utils';
import { AchievementsScreen } from '../src/features/progress/achievements-screen';
import { ShellChromeProvider } from '../src/features/shell/shell-chrome';

// Kitchen progress (docs/gamification-2026-10): Achievements, pushed from You →
// "Your progress". Revamp shell only; the screen gates itself on `progress.availability`.
export default function AchievementsRoute() {
  return (
    <ShellChromeProvider
      value={{ kind: 'pushed', fallback: '/you', title: PROGRESS_COPY.achievementsTitle }}
    >
      <AchievementsScreen />
    </ShellChromeProvider>
  );
}
