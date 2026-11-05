import { AskChefAction } from '../../src/features/shell/add-action';
import { MealsScreen } from '../../src/features/shell/meals/meals-screen';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { useT } from '../../src/lib/i18n';

// New shell: Meals (10 Oct redesign, board "Plan"). Its own screen now — the
// old shell keeps `app/(food)/meal-plan.tsx` untouched. The Cookbook moved
// from a top-bar icon into the screen's Cookbook card.
export default function PlanTab() {
  const { t } = useT();
  return (
    <ShellChromeProvider
      value={{ kind: 'tab-root', title: t('nav.items.meals'), actions: <AskChefAction /> }}
    >
      <MealsScreen />
    </ShellChromeProvider>
  );
}
