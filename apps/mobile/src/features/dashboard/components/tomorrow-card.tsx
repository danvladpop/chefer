import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { getRecipeImageUrl } from '../../../lib/recipe-image';
import type { RouterOutputs } from '../../../lib/trpc';
import { MealTypeBadge } from './meal-type-badge';

// Tomorrow card (UX-04 §2/§3, T-04.4): the 21:30–03:59 band, or once
// tonight's dinner is done — "TOMORROW · {MEAL}", never "Next meal" after
// 21:30. Tomorrow hasn't happened yet, so it's always a read-only preview
// ("View recipe"), same as HeroMealCard's isTomorrow branch.

type Tomorrow = NonNullable<RouterOutputs['dashboard']['summary']['tomorrow']>;

export function TomorrowCard({ meal }: { meal: Tomorrow }) {
  const openRecipe = () => router.push(`/recipe/${meal.recipe.id}`);

  return (
    <Card testID="tomorrow-card" className="overflow-hidden p-0">
      <Pressable
        testID="tomorrow-card-open"
        accessibilityRole="button"
        accessibilityLabel={`Tomorrow: ${meal.recipe.name}`}
        onPress={openRecipe}
        className="active:opacity-80"
      >
        <Image
          source={{ uri: getRecipeImageUrl(meal.recipe.imageUrl) }}
          className="h-32 w-full"
          resizeMode="cover"
          accessibilityLabel={meal.recipe.name}
        />
        <View className="gap-2 px-4 pt-4">
          <View className="flex-row flex-wrap gap-2">
            <View className="self-start rounded-full bg-primary px-2.5 py-0.5">
              <Text className="text-[12px] font-semibold uppercase text-primary-foreground">
                Tomorrow
              </Text>
            </View>
            <MealTypeBadge mealType={meal.mealType} />
          </View>
          <Text className="text-base font-bold leading-snug text-gray-900">{meal.recipe.name}</Text>
        </View>
      </Pressable>
      <View className="p-4 pt-2">
        <Button testID="tomorrow-view-recipe" variant="outline" onPress={openRecipe}>
          View recipe
        </Button>
      </View>
    </Card>
  );
}
