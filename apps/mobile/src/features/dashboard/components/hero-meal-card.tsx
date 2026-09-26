import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { formatPortion, localDateStr, slotPortion } from '@chefer/utils';
import { getRecipeImageUrl } from '../../../lib/recipe-image';
import { trpc, type RouterOutputs } from '../../../lib/trpc';
import { recordRebalance } from '../../tracker/rebalance-store';
import { MealTypeBadge } from './meal-type-badge';

// Today's next meal (P2-2) — mobile twin of web's NextMealCard. "I ate this"
// logs the planned recipe in one tap (tracker.logRecipe: atomic, idempotent),
// and the summary refetch moves the spotlight on to the next meal still to
// eat (F-PM-10). Logging used to take Home → More → Tracker → ✓ → Save.

type HeroMeal = NonNullable<RouterOutputs['dashboard']['summary']['nextMeal']>;

export function HeroMealCard({ meal, isTomorrow }: { meal: HeroMeal; isTomorrow: boolean }) {
  const utils = trpc.useUtils();
  const [lastLogged, setLastLogged] = useState<string | null>(null);

  const logMutation = trpc.tracker.logRecipe.useMutation({
    onSuccess: (result) => {
      // A premium log can rebalance the week — same hand-off as the tracker.
      recordRebalance(result.rebalance);
      setLastLogged(meal.recipe.name);
      void utils.dashboard.summary.invalidate();
      void utils.tracker.getDay.invalidate();
      void utils.tracker.weeklySummary.invalidate();
    },
  });

  // P1-1: a portioned plan slot opens, cooks and logs at its portion (kcal
  // is already scaled to it). logRecipe takes 0.5–2×, like the tracker.
  const portion = meal.portion;
  const logPortion = Math.min(2, Math.max(0.5, slotPortion(portion)));
  const openRecipe = () =>
    router.push(`/recipe/${meal.recipe.id}${portion !== undefined ? `?portion=${portion}` : ''}`);
  const totalMins = meal.recipe.prepTimeMins + (meal.recipe.cookTimeMins ?? 0);

  return (
    <Card testID="hero-meal-card" className="overflow-hidden p-0">
      {/* Photo + text open the recipe (dogfood #8 — it looked tappable but wasn't). */}
      <Pressable
        testID="hero-meal-card-open"
        accessibilityRole="button"
        accessibilityLabel={`Open ${meal.recipe.name}`}
        onPress={openRecipe}
        className="active:opacity-80"
      >
        <Image
          source={{ uri: getRecipeImageUrl(meal.recipe.imageUrl) }}
          className="h-40 w-full"
          resizeMode="cover"
          accessibilityLabel={meal.recipe.name}
        />
        <View className="gap-2 px-4 pt-4">
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
              <Text testID="hero-meal-time" className="text-xs text-gray-500">
                {totalMins} min
              </Text>
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
      </Pressable>

      <View className="flex-row gap-2 p-4">
        {isTomorrow ? (
          <Button variant="outline" className="flex-1" onPress={openRecipe}>
            View recipe
          </Button>
        ) : (
          <>
            <Button
              testID="today-ate-this"
              className="flex-1"
              loading={logMutation.isPending}
              onPress={() =>
                logMutation.mutate({
                  date: localDateStr(),
                  recipeId: meal.recipe.id,
                  mealType: meal.mealType,
                  portionMultiplier: logPortion,
                })
              }
            >
              I ate this
            </Button>
            <Button
              testID="today-cook-it"
              variant="outline"
              className="flex-1"
              onPress={() =>
                router.push({
                  pathname: '/cook/[id]',
                  params: {
                    id: meal.recipe.id,
                    meal: meal.mealType,
                    ...(portion !== undefined && { portion: String(portion) }),
                  },
                })
              }
            >
              Cook it
            </Button>
          </>
        )}
      </View>

      {logMutation.isError && (
        <Text className="px-4 pb-3 text-xs text-red-600">
          Couldn&apos;t log it: {logMutation.error.message}
        </Text>
      )}
      {lastLogged && !logMutation.isError && (
        <Pressable
          testID="today-logged-status"
          accessibilityRole="button"
          accessibilityLabel={`Logged ${lastLogged}. Change it in your full day`}
          onPress={() => router.push('/tracker')}
          className="min-h-11 flex-row flex-wrap items-center gap-x-1 border-t border-border bg-emerald-50 px-4 py-2.5"
        >
          <Text className="text-xs text-emerald-800">Logged {lastLogged}.</Text>
          <Text className="text-xs font-semibold text-emerald-800 underline">
            Change it in your full day
          </Text>
        </Pressable>
      )}
    </Card>
  );
}
