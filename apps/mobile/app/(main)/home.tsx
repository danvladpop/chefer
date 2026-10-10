import { AddAction, AskChefAction } from '../../src/features/shell/add-action';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import HomeScreen from '../(food)/index';

// New shell: Today. The existing dashboard, with Ask Chef and Add in its top
// bar (plan: "Today").
export default function HomeTab() {
  return (
    <ShellChromeProvider
      value={{
        kind: 'tab-root',
        actions: (
          <>
            <AskChefAction />
            <AddAction />
          </>
        ),
      }}
    >
      <HomeScreen />
    </ShellChromeProvider>
  );
}
