import { router } from 'expo-router';
import { IconButton, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../src/components/icon';
import { AskChefAction } from '../../src/features/shell/add-action';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import MealPlanScreen from '../(food)/meal-plan';

// New shell: Plan. The week's plan, with the cookbook one tap away in its top
// bar: Recipes stopped being a tab of its own (plan: "Plan").
export default function PlanTab() {
  const colors = useThemeColors();
  return (
    <ShellChromeProvider
      value={{
        kind: 'tab-root',
        title: 'Plan',
        actions: (
          <>
            <AskChefAction />
            <IconButton
              testID="shell-recipes"
              accessibilityLabel="Recipes"
              variant="tinted"
              icon={<Icon name="recipes" color={colors.brand} />}
              onPress={() => router.push('/cookbook')}
            />
          </>
        ),
      }}
    >
      <MealPlanScreen />
    </ShellChromeProvider>
  );
}
