import { StatsTab } from '../../src/features/gym/stats/stats-tab';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';

// New shell: Stats and history, pushed from Train (it was a Gym tab).
export default function TrainingStats() {
  return (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/train' }}>
      <StatsTab />
    </ShellChromeProvider>
  );
}
