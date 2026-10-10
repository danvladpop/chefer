import { MealSettingsScreen } from '../../src/features/shell/meals/meal-settings-screen';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';

// New shell: Meal settings (10 Oct redesign, board PlanSettingsSheet) —
// pushed from You and from Meals › Change week (`?week=0|1`, the week a save
// re-plans). The old shell keeps its Plan settings sheet.
export default function MealSettingsRoute() {
  return (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/you', title: 'Meal settings' }}>
      <MealSettingsScreen />
    </ShellChromeProvider>
  );
}
