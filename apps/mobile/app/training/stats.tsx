import { StatsTab } from '../../src/features/gym/stats/stats-tab';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { useT } from '../../src/lib/i18n';

// New shell: Stats and history, pushed from Train (it was a Gym tab). The top
// bar names the page next to Back, so the body drops its own "Stats" title.
export default function TrainingStats() {
  const { t } = useT();
  return (
    <ShellChromeProvider
      value={{ kind: 'pushed', fallback: '/train', title: t('nav.items.stats') }}
    >
      <StatsTab />
    </ShellChromeProvider>
  );
}
