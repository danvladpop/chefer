import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, KeyboardAwareScrollView, Screen, Text } from '@chefer/ui-mobile';
import { cn, formatQuantity } from '@chefer/utils';
import { AllergenWarningBanner } from '../../src/features/recipes/allergen-warning';
import { StarRating } from '../../src/features/recipes/star-rating';
import { useUnitSystem } from '../../src/hooks/use-unit-system';
import { getRecipeImageUrl } from '../../src/lib/recipe-image';
import { trpc } from '../../src/lib/trpc';

// Recipe detail — port of apps/web (dashboard)/recipes/[id]/page.tsx (M2-3).
// Like web, the star rating shows only when opened from a meal-plan day
// (`day` param) — that's when the user actually ate it. Deviations,
// deliberate: meal-plan swap context stays on the Plan tab's picker sheet.

export default function RecipeDetailScreen() {
  const { id, day, meal } = useLocalSearchParams<{ id: string; day?: string; meal?: string }>();
  const unitSystem = useUnitSystem();

  const { data: recipe, isLoading, isError } = trpc.mealPlan.getRecipe.useQuery({ recipeId: id });
  const { data: savedData } = trpc.recipe.isSaved.useQuery({ recipeId: id });

  const utils = trpc.useUtils();
  const toggleFav = trpc.recipe.toggleFavourite.useMutation({
    onSettled: () => {
      void utils.recipe.isSaved.invalidate({ recipeId: id });
      void utils.recipe.list.invalidate();
    },
  });

  const [servings, setServings] = useState<number | null>(null);

  if (isLoading) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ActivityIndicator size="large" color="#944a00" />
      </Screen>
    );
  }

  if (isError || !recipe) {
    return (
      <Screen
        edges={['top', 'bottom', 'left', 'right']}
        className="items-center justify-center gap-3"
      >
        <Text variant="muted">Recipe not found.</Text>
        <Button variant="outline" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  const isSaved = savedData?.isSaved ?? false;
  const totalTime = recipe.prepTimeMins + recipe.cookTimeMins;
  const n = recipe.nutritionInfo;
  const selectedServings = servings ?? recipe.servings;
  const scale = selectedServings / (recipe.servings || 1);

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-8">
        {/* Hero image + back overlay */}
        <View className="relative">
          <Image
            source={{ uri: getRecipeImageUrl(recipe.imageUrl) }}
            className="h-56 w-full"
            resizeMode="cover"
            accessibilityLabel={recipe.name}
          />
          <Pressable
            testID="recipe-back"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            className="absolute left-3 top-3 h-11 w-11 items-center justify-center rounded-full bg-white/90"
          >
            <Ionicons name="arrow-back" size={20} color="#1f2937" />
          </Pressable>
        </View>

        <View className="gap-4 px-4 pt-4">
          {/* Tags + title */}
          <View className="gap-2">
            <View className="flex-row flex-wrap gap-2">
              <View className="rounded-full bg-accent px-3 py-0.5">
                <Text className="text-xs font-medium text-primary">{recipe.cuisineType}</Text>
              </View>
              {recipe.dietaryTags.slice(0, 2).map((tag) => (
                <View key={tag} className="rounded-full bg-gray-100 px-3 py-0.5">
                  <Text className="text-xs text-gray-600">{tag}</Text>
                </View>
              ))}
            </View>
            <Text testID="recipe-name" variant="title">
              {recipe.name}
            </Text>
            <Text variant="muted" className="text-sm">
              {recipe.description}
            </Text>
            <AllergenWarningBanner warnings={recipe.allergenWarnings} className="mt-2" />
          </View>

          {/* Actions: cook is primary (web P1-3), save secondary */}
          <View className="flex-row gap-2">
            <Button
              testID="recipe-cook"
              className="flex-1"
              onPress={() =>
                router.push({ pathname: '/cook/[id]', params: meal ? { id, meal } : { id } })
              }
            >
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="restaurant-outline" size={16} color="white" />
                <Text className="text-sm font-medium text-primary-foreground">Cook</Text>
              </View>
            </Button>
            <Button
              testID="recipe-save"
              variant={isSaved ? 'secondary' : 'outline'}
              className="flex-1"
              loading={toggleFav.isPending}
              onPress={() => toggleFav.mutate({ recipeId: id })}
            >
              <View className="flex-row items-center gap-1.5">
                <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={16} color="#944a00" />
                <Text className="text-sm font-medium text-primary">
                  {isSaved ? 'Saved' : 'Save'}
                </Text>
              </View>
            </Button>
          </View>

          {/* Stats */}
          <View className="flex-row justify-between rounded-2xl border border-border bg-gray-50 px-4 py-3">
            {(
              [
                ['Prep', `${recipe.prepTimeMins}m`],
                ['Cook', `${recipe.cookTimeMins}m`],
                ['Total', `${totalTime}m`],
                ['Energy', `${n.calories} kcal`],
              ] as const
            ).map(([label, value]) => (
              <View key={label} className="items-center">
                <Text className="text-xs text-gray-500">{label}</Text>
                <Text className="text-sm font-semibold text-gray-800">{value}</Text>
              </View>
            ))}
          </View>

          {/* Macros */}
          <View className="flex-row gap-2">
            {(
              [
                ['Protein', n.protein],
                ['Carbs', n.carbs],
                ['Fat', n.fat],
                ['Fiber', n.fiber],
              ] as const
            ).map(([label, value]) => (
              <View key={label} className="flex-1 items-center rounded-xl bg-gray-100 py-2">
                <Text className="text-xs text-gray-500">{label}</Text>
                <Text className="text-sm font-semibold text-gray-800">{value}g</Text>
              </View>
            ))}
          </View>

          {/* Ingredients + servings adjuster */}
          <Card testID="recipe-ingredients">
            <View className="mb-3 flex-row items-center justify-between">
              <Text variant="heading">Ingredients</Text>
              <View className="flex-row items-center gap-1 rounded-xl border border-border px-1">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease servings"
                  onPress={() => setServings(Math.max(1, selectedServings - 1))}
                  className="h-9 w-9 items-center justify-center"
                >
                  <Text className="text-lg text-gray-600">−</Text>
                </Pressable>
                <Text className="w-8 text-center text-sm font-medium">{selectedServings}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase servings"
                  onPress={() => setServings(Math.min(8, selectedServings + 1))}
                  className="h-9 w-9 items-center justify-center"
                >
                  <Text className="text-lg text-gray-600">+</Text>
                </Pressable>
              </View>
            </View>
            <View className="gap-2">
              {recipe.ingredients.map((ing, i) => (
                <View key={i} className="flex-row items-baseline gap-2">
                  <Text className="shrink-0 text-sm font-medium text-gray-900">
                    {formatQuantity(ing.quantity * scale, ing.unit, unitSystem)}
                  </Text>
                  <Text className="min-w-0 flex-1 text-sm text-gray-600">{ing.name}</Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Instructions */}
          <Card testID="recipe-instructions">
            <Text variant="heading" className="mb-3">
              Instructions
            </Text>
            <View className="gap-4">
              {recipe.instructions.map((step, i) => (
                <View key={i} className="flex-row gap-3">
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
                    <Text className="text-xs font-bold text-primary-foreground">{i + 1}</Text>
                  </View>
                  <Text className="min-w-0 flex-1 text-sm leading-relaxed text-gray-700">
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Nutrition facts */}
          <Card>
            <Text variant="heading" className="mb-2">
              Nutrition Facts{' '}
              <Text variant="muted" className="text-xs">
                per {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}
              </Text>
            </Text>
            <View className="flex-row flex-wrap">
              {(
                [
                  ['Calories', `${n.calories} kcal`],
                  ['Protein', `${n.protein}g`],
                  ['Carbs', `${n.carbs}g`],
                  ['Fat', `${n.fat}g`],
                ] as const
              ).map(([label, value]) => (
                <View key={label} className={cn('w-1/2 flex-row justify-between py-1 pr-4')}>
                  <Text className="text-sm text-gray-500">{label}</Text>
                  <Text className="text-sm font-medium text-gray-800">{value}</Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Star rating — shown when opened from a meal-plan day */}
          {day !== undefined && <StarRating recipeId={id} />}
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
