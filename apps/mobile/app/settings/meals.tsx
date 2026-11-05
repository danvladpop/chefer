import { MealSettingsScreen } from '../../src/features/shell/meals/meal-settings-screen';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { useT } from '../../src/lib/i18n';

// New shell: Meal settings (10 Oct redesign, board PlanSettingsSheet) —
// pushed from You and from Meals › Change week (`?week=0|1`, the week a save
// re-plans). The old shell keeps its Plan settings sheet.
export default function MealSettingsRoute() {
  const { t } = useT();
  return (
    <ShellChromeProvider
      value={{ kind: 'pushed', fallback: '/you', title: t('nav.titles.mealSettings') }}
    >
      <MealSettingsScreen />
    </ShellChromeProvider>
  );
}
