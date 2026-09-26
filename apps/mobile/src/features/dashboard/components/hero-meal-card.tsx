import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card, Text } from '@chefer/ui-mobile';
import { formatPortion } from '@chefer/utils';
import { getRecipeImageUrl } from '../../../lib/recipe-image';
import type { RouterOutputs } from '../../../lib/trpc';
import { MealTypeBadge } from './meal-type-badge';

type HeroMeal = NonNullable<RouterOutputs['dashboard']['summary']['nextMeal']>;

export function HeroMealCard({ meal, isTomorrow }: { meal: HeroMeal; isTomorrow: boolean }) {
  // The whole card opens the recipe (dogfood #8 — it looked tappable but wasn't).
  return (
    <Pressable
      testID="hero-meal-card-open"
      accessibilityRole="button"
      accessibilityLabel={`Open ${meal.recipe.name}`}
      onPress={() =>
        router.push(
          // P1-1: a portioned plan slot opens pre-set to its portion.
          `/recipe/${meal.recipe.id}${meal.portion !== undefined ? `?portion=${meal.portion}` : ''}`,
        )
      }
      className="active:opacity-80"
    >
      <Card testID="hero-meal-card" className="overflow-hidden p-0">
        <Image
          source={{ uri: getRecipeImageUrl(meal.recipe.imageUrl) }}
          className="h-40 w-full"
          resizeMode="cover"
          accessibilityLabel={meal.recipe.name}
        />
        <View className="gap-2 p-4">
          <View className="flex-row flex-wrap gap-2">
            <View className="self-start rounded-full bg-primary px-2.5 py-0.5">
              <Text className="text-[12px] font-semibold uppercase text-primary-foreground">
                {isTomorrow ? 'Tomorrow' : 'Next Meal'}
              </Text>
            </View>
            <MealTypeBadge mealType={meal.mealType} />
          </View>
          <Text className="text-lg font-bold leading-snug text-gray-900">{meal.recipe.name}</Text>
          <Text numberOfLines={2} className="text-xs text-gray-500">
            {meal.recipe.description}
          </Text>
          <View className="mt-1 flex-row items-center gap-4">
            <View className="flex-row items-center gap-1">
              <Ionicons name="time-outline" size={14} color="#6b7280" />
              <Text className="text-xs text-gray-500">{meal.recipe.prepTimeMins} min</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Ionicons name="flame-outline" size={14} color="#944a00" />
              <Text className="text-xs text-gray-500">
                {meal.recipe.kcal} kcal
                {meal.portion !== undefined && ` · ${formatPortion(meal.portion)} portion`}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
