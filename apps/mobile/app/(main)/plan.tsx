import { AskChefAction } from '../../src/features/shell/add-action';
import { MealsScreen } from '../../src/features/shell/meals/meals-screen';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';

// New shell: Meals (10 Oct redesign, board "Plan"). Its own screen now — the
// old shell keeps `app/(food)/meal-plan.tsx` untouched. The Cookbook moved
// from a top-bar icon into the screen's Cookbook card.
export default function PlanTab() {
  return (
    <ShellChromeProvider value={{ kind: 'tab-root', title: 'Meals', actions: <AskChefAction /> }}>
      <MealsScreen />
    </ShellChromeProvider>
  );
}
