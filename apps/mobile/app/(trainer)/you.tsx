import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { TrainerYouScreen } from '../../src/features/trainer-mode/you/trainer-you-screen';
import { useT } from '../../src/lib/i18n';

// Trainer mode: You (trainer-mode.md §6.8).
export default function TrainerYouTab() {
  const { t } = useT();
  return (
    <ShellChromeProvider value={{ kind: 'tab-root', title: t('trainer.you.title') }}>
      <TrainerYouScreen />
    </ShellChromeProvider>
  );
}
