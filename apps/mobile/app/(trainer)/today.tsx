import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { todayEyebrow } from '../../src/features/shell/today/today-helpers';
import { TrainerTodayScreen } from '../../src/features/trainer-mode/today/trainer-today-screen';
import { useT } from '../../src/lib/i18n';

// Trainer mode: Today (trainer-mode.md §6.1) — the initial tab, named in the
// shared top bar under the date, like personal Today.
export default function TrainerTodayTab() {
  const { t } = useT();
  return (
    <ShellChromeProvider
      value={{ kind: 'tab-root', title: t('trainer.today.title'), eyebrow: todayEyebrow() }}
    >
      <TrainerTodayScreen />
    </ShellChromeProvider>
  );
}
