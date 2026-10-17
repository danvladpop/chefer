import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Text } from '@chefer/ui-mobile';
import type { RouterOutputs } from '../../../lib/trpc';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { MealTypeBadge } from './meal-type-badge';

type RestOfToday = RouterOutputs['dashboard']['summary']['restOfToday'];

/** Today's "Later today" list: the meals still to come, each opening its recipe. */
export function LaterTodayCard({ meals }: { meals: RestOfToday }) {
  // WP-08: protein-only mode lists the meals without kcal.
  const { proteinOnly } = useNumbersMode();
  if (meals.length === 0) return null;
  return (
    <Card testID="rest-of-today">
      <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Later today
      </Text>
      <View className="gap-2.5">
        {meals.map((meal, i) => (
          <Pressable
            key={`${meal.mealType}-${i}`}
            testID={`later-today-${meal.mealType}`}
            accessibilityRole="button"
            disabled={!meal.recipeId}
            onPress={() => {
              if (meal.recipeId) router.push(`/recipe/${meal.recipeId}`);
            }}
            className="min-h-11 flex-row items-center gap-3 active:opacity-70"
          >
            <MealTypeBadge mealType={meal.mealType} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                {meal.recipeName}
              </Text>
              <Text className="text-xs text-gray-500">{meal.scheduledLabel}</Text>
            </View>
            {meal.kcal > 0 && !proteinOnly && (
              <Text className="text-xs text-gray-500">{meal.kcal} kcal</Text>
            )}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
