import { ShellChromeProvider } from '../src/features/shell/shell-chrome';
import RecipesScreen from './(food)/recipes';

// New shell: the cookbook, pushed from Plan (it was the Cookbook tab).
export default function Cookbook() {
  return (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/plan' }}>
      <RecipesScreen />
    </ShellChromeProvider>
  );
}
