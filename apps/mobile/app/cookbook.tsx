import { AskChefAction } from '../src/features/shell/add-action';
import { CookbookScreen } from '../src/features/shell/cookbook/cookbook-screen';
import { ShellChromeProvider } from '../src/features/shell/shell-chrome';
import { useShellV2 } from '../src/features/shell/shell-store';
import RecipesScreen from './(food)/recipes';

// New shell: the cookbook, pushed from Meals (it was the Cookbook tab). The
// 10 Oct redesign gives it its own tile screen; were the route ever reached
// on the old shell, it keeps showing the old tab's screen.
export default function Cookbook() {
  const shellV2 = useShellV2();
  if (!shellV2) {
    return (
      <ShellChromeProvider value={{ kind: 'pushed', fallback: '/plan' }}>
        <RecipesScreen />
      </ShellChromeProvider>
    );
  }
  return (
    <ShellChromeProvider
      value={{ kind: 'pushed', fallback: '/plan', title: 'Cookbook', actions: <AskChefAction /> }}
    >
      <CookbookScreen />
    </ShellChromeProvider>
  );
}
