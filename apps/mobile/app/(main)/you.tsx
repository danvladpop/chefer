import { AskChefAction } from '../../src/features/shell/add-action';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { YouScreen } from '../../src/features/shell/you-screen';
import { useT } from '../../src/lib/i18n';

// New shell: You. The old More tabs, the gear and the avatar in one place.
// F5: it names itself in the shared top bar, on the Ask Chef row, like every tab.
export default function YouTab() {
  const { t } = useT();
  return (
    <ShellChromeProvider
      value={{ kind: 'tab-root', title: t('nav.items.you'), actions: <AskChefAction /> }}
    >
      <YouScreen />
    </ShellChromeProvider>
  );
}
