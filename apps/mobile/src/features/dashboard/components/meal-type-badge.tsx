import { View } from 'react-native';
import type { Translator } from '@chefer/i18n';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useT } from '../../../lib/i18n';

// Same colour vocabulary as the web dashboard's MEAL_COLOURS map.
const MEAL_COLOURS: Record<string, { bg: string; text: string }> = {
  breakfast: { bg: 'bg-positive/15', text: 'text-positive' },
  lunch: { bg: 'bg-attention/15', text: 'text-attention' },
  dinner: { bg: 'bg-info/15', text: 'text-info' },
  snack: { bg: 'bg-brand-tint', text: 'text-brand' },
};

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type KnownMealType = (typeof MEAL_TYPES)[number];
const isKnownMealType = (mealType: string): mealType is KnownMealType =>
  (MEAL_TYPES as readonly string[]).includes(mealType);

/** "Breakfast" in the UI language; an unknown type keeps its own word, capitalised. */
export function mealTypeName(t: Translator['t'], mealType: string): string {
  return isKnownMealType(mealType)
    ? t(`today.home.mealTypes.${mealType}`)
    : mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

export function MealTypeBadge({ mealType }: { mealType: string }) {
  const { t } = useT();
  const colours = MEAL_COLOURS[mealType] ?? {
    bg: 'bg-surface-sunken',
    text: 'text-label-secondary',
  };
  return (
    <View className={cn('self-start rounded-full px-2.5 py-0.5', colours.bg)}>
      <Text className={cn('text-xs font-semibold uppercase', colours.text)}>
        {mealTypeName(t, mealType)}
      </Text>
    </View>
  );
}
