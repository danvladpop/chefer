import { useLocalSearchParams } from 'expo-router';
import { SessionDetailScreen } from '../../../src/features/gym/history/session-detail-screen';
import { ShellChromeProvider } from '../../../src/features/shell/shell-chrome';
import { useShellV2 } from '../../../src/features/shell/shell-store';

// Gym stack route: a past session in detail (gym_plan.md §1.3). New shell
// (10 Oct redesign): pushed from Train's past workouts / Stats › History, so it
// draws the shell's top bar (Back falls back to Train); the old shell keeps
// its stack Back button.
export default function GymSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shellV2 = useShellV2();
  const screen = <SessionDetailScreen sessionId={id} />;
  return shellV2 ? (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/train' }}>
      {screen}
    </ShellChromeProvider>
  ) : (
    screen
  );
}
