import { View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { cn, sumPlanDay } from '@chefer/utils';

// Day totals for the Plan tab — port of web's DayRecapBar. Each slot counts at
// its portion (P1-1), the calorie chip uses the same ±15% band as web, and a
// protein-short day says so honestly (DayPlanDto.proteinGapG) instead of
// passing as on target.

/** Matches the API's PLAN_KCAL_TOLERANCE and web's DayRecapBar. */
const TARGET_BAND = 0.15;

type Meal = Parameters<typeof sumPlanDay>[0][number];

export function PlanDayTotals({
  meals,
  calorieTarget,
  proteinGapG,
  testID = 'plan-day-totals',
}: {
  meals: Meal[];
  calorieTarget?: number | undefined;
  proteinGapG?: number | undefined;
  testID?: string;
}) {
  const totals = sumPlanDay(meals);
  const delta = calorieTarget ? totals.kcal - calorieTarget : 0;
  const offTarget = calorieTarget ? Math.abs(delta) / calorieTarget > TARGET_BAND : false;

  return (
    <View testID={testID} className="gap-1 rounded-xl bg-gray-50 px-3 py-2">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text className="text-xs font-semibold uppercase text-gray-500">Day total</Text>
        <Text testID={`${testID}-kcal`} className="text-sm font-bold text-primary">
          {totals.kcal.toLocaleString('en-GB')} kcal
        </Text>
        <Text className="text-xs text-gray-500">
          P {totals.protein}g · C {totals.carbs}g · F {totals.fat}g
        </Text>
      </View>
      {offTarget && (
        <View
          className={cn(
            'self-start rounded-full px-2 py-0.5',
            delta < 0 ? 'bg-amber-100' : 'bg-red-100',
          )}
        >
          <Text
            className={cn('text-xs font-semibold', delta < 0 ? 'text-amber-800' : 'text-red-700')}
          >
            {delta < 0 ? `${Math.abs(delta)} kcal under target` : `${delta} kcal over target`}
          </Text>
        </View>
      )}
      {proteinGapG !== undefined && proteinGapG > 0 && (
        <Text
          testID={`${testID}-protein-gap`}
          className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
        >
          Protein short by {proteinGapG} g — add a snack
        </Text>
      )}
    </View>
  );
}
