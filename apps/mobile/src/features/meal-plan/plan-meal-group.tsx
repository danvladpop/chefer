import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { PLAN_MEAL_MENU_COPY } from '@chefer/utils';
import { MealTypeBadge } from '../dashboard/components/meal-type-badge';

// FB7-04: several dishes of one meal type on a day (a main + sides) read as ONE
// meal: a single type header, the main card, the compact side cards indented
// under it, and a total line for the whole meal.

export function PlanMealGroup({
  testID,
  mealType,
  dishCount,
  totalLine,
  main,
  sides,
}: {
  testID: string;
  mealType: string;
  dishCount: number;
  /** "687 kcal · P 32 g · C 60 g · F 18 g" (or the protein-only form). */
  totalLine: string;
  /** The main dish's card. */
  main: ReactNode;
  /** The compact side cards, indented under the main. */
  sides: ReactNode;
}) {
  return (
    <View testID={testID} className="gap-2">
      <View className="min-w-0 flex-row items-center gap-2 px-1">
        <MealTypeBadge mealType={mealType} />
        <Text className="text-xs text-gray-500">{PLAN_MEAL_MENU_COPY.dishCount(dishCount)}</Text>
      </View>
      {main}
      <View className="ml-4 gap-2 border-l-2 border-border pl-2">{sides}</View>
      <View
        testID={`${testID}-total`}
        accessible
        accessibilityLabel={`${PLAN_MEAL_MENU_COPY.groupTotal(mealType)}: ${totalLine}`}
        className="min-w-0 flex-row flex-wrap items-center gap-x-2 rounded-xl bg-gray-50 px-3 py-2"
      >
        <Text className="text-xs font-semibold uppercase text-gray-500">
          {PLAN_MEAL_MENU_COPY.groupTotal(mealType)}
        </Text>
        <Text className="min-w-0 flex-shrink text-xs text-gray-700">{totalLine}</Text>
      </View>
    </View>
  );
}
