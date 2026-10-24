import { View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// Same colour vocabulary as the web dashboard's MEAL_COLOURS map.
const MEAL_COLOURS: Record<string, { bg: string; text: string }> = {
  breakfast: { bg: 'bg-positive/15', text: 'text-positive' },
  lunch: { bg: 'bg-attention/15', text: 'text-attention' },
  dinner: { bg: 'bg-info/15', text: 'text-info' },
  snack: { bg: 'bg-brand-tint', text: 'text-brand' },
};

export function MealTypeBadge({ mealType }: { mealType: string }) {
  const colours = MEAL_COLOURS[mealType] ?? {
    bg: 'bg-surface-sunken',
    text: 'text-label-secondary',
  };
  return (
    <View className={cn('self-start rounded-full px-2.5 py-0.5', colours.bg)}>
      <Text className={cn('text-xs font-semibold uppercase', colours.text)}>{mealType}</Text>
    </View>
  );
}
