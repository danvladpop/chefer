import { View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// Same colour vocabulary as the web dashboard's MEAL_COLOURS map.
const MEAL_COLOURS: Record<string, { bg: string; text: string }> = {
  breakfast: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  lunch: { bg: 'bg-orange-100', text: 'text-orange-700' },
  dinner: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  snack: { bg: 'bg-purple-100', text: 'text-purple-700' },
};

export function MealTypeBadge({ mealType }: { mealType: string }) {
  const colours = MEAL_COLOURS[mealType] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <View className={cn('self-start rounded-full px-2.5 py-0.5', colours.bg)}>
      <Text className={cn('text-[12px] font-semibold uppercase', colours.text)}>{mealType}</Text>
    </View>
  );
}
