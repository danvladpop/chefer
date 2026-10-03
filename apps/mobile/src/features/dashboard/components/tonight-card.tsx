import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { localDateStr, slotPortion, userFacingErrorMessage, verifiedLabels } from '@chefer/utils';
import { trackMealLogged } from '../../../lib/analytics-events';
import { getRecipeImageUrl } from '../../../lib/recipe-image';
import { trpc, type RouterOutputs } from '../../../lib/trpc';
import { StarRating } from '../../recipes/star-rating';
import { CheckedForChip } from '../../safety/checked-for-chip';
import { recordRebalance } from '../../tracker/rebalance-store';

// Tonight card (UX-04 §3, T-04.4) — evolves HeroMealCard for the 16:00–21:29
// band: today's DINNER specifically, never a breakfast. Collapses to a
// 56 pt done row after cook mode/logging (AC3); kcal and "I ate this" only
// for goal/tracking users (B-31, `showNutrition`).

/** 0 = Monday … 6 = Sunday, the Plan tab's day index. */
function mondayFirstDayIndex(now: Date = new Date()): number {
  const jsDay = now.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

type Tonight = NonNullable<RouterOutputs['dashboard']['summary']['tonight']>;

export function TonightCard({
  meal,
  showNutrition,
  onLogged,
}: {
  meal: Tonight;
  showNutrition: boolean;
  onLogged: () => void;
}) {
  const utils = trpc.useUtils();
  // UX-FOOD-04: "Rate it" opens the real StarRating (the one cook mode's
  // finish screen uses) inline; the link is gone once a rating exists.
  const [rateOpen, setRateOpen] = useState(false);
  const myRating = trpc.recipe.getMyRating.useQuery(
    { recipeId: meal.recipe.id },
    { enabled: meal.done },
  );
  const canRate = !myRating.isLoading && !myRating.data;
  const logMutation = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (result) => {
      trackMealLogged('planned', meal.mealType);
      recordRebalance(result.rebalance);
      void utils.dashboard.summary.invalidate();
      void utils.tracker.getDay.invalidate();
      void utils.tracker.weeklySummary.invalidate();
      onLogged();
    },
  });

  // The slot's portion multiplier is already baked into recipe.kcal above;
  // logRecipe still wants its own 0.5–2× clamp, same default as HeroMealCard.
  const logPortion = Math.min(2, Math.max(0.5, slotPortion(undefined)));
  const openCookMode = () =>
    router.push({
      pathname: '/cook/[id]',
      params: { id: meal.recipe.id, meal: meal.mealType },
    });
  // UX-FOOD-18: Plan opens on NEXT week on Friday/Saturday evenings, which is
  // not tonight's dinner. Name this week and today's weekday explicitly, and
  // ask Plan to open the dinner's replace picker (`at` = a fresh link).
  const openSwap = () =>
    router.push({
      pathname: '/(food)/meal-plan',
      params: {
        week: '0',
        day: String(mondayFirstDayIndex()),
        swap: 'dinner',
        at: String(Date.now()),
      },
    });

  if (meal.done) {
    return (
      <Card testID="tonight-card-done" className="gap-2 py-3">
        <View className="flex-row items-center gap-2.5">
          <Text className="text-base">✓</Text>
          <Text className="min-w-0 flex-1 text-sm font-medium text-gray-800" numberOfLines={1}>
            Dinner done · {meal.recipe.name}
          </Text>
          {canRate && !rateOpen && (
            <Pressable
              testID="tonight-rate-it"
              accessibilityRole="button"
              onPress={() => setRateOpen(true)}
              className="min-h-11 justify-center px-2"
            >
              <Text className="text-xs font-semibold text-primary">Rate it</Text>
            </Pressable>
          )}
        </View>
        {rateOpen && (
          <StarRating
            recipeId={meal.recipe.id}
            title="How was it?"
            hint="Your rating shapes what the chef cooks up next week."
            className="border-0 p-0 shadow-none"
          />
        )}
      </Card>
    );
  }

  return (
    <Card testID="tonight-card" className="overflow-hidden p-0">
      <Pressable
        testID="tonight-card-open"
        accessibilityRole="button"
        accessibilityLabel={`Tonight: ${meal.recipe.name}, for ${meal.recipe.servings}.`}
        onPress={() => router.push(`/recipe/${meal.recipe.id}`)}
        className="active:opacity-80"
      >
        <Image
          source={{ uri: getRecipeImageUrl(meal.recipe.imageUrl) }}
          className="h-40 w-full"
          resizeMode="cover"
          accessibilityLabel={meal.recipe.name}
        />
        <View className="gap-2 px-4 pt-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="self-start rounded-full bg-primary px-2.5 py-0.5">
              <Text className="text-xs font-semibold uppercase text-primary-foreground">
                Tonight · Dinner
              </Text>
            </View>
            {verifiedLabels(meal.safetyChecks).length > 0 && (
              <CheckedForChip
                testID="tonight-checked-for"
                labels={verifiedLabels(meal.safetyChecks)}
              />
            )}
          </View>
          <Text className="text-lg font-bold leading-snug text-gray-900">{meal.recipe.name}</Text>
          <Text className="text-xs text-gray-500">
            {meal.recipe.prepTimeMins + (meal.recipe.cookTimeMins ?? 0)} min · for{' '}
            {meal.recipe.servings}
            {showNutrition ? ` · ${meal.recipe.kcal} kcal` : ''}
          </Text>
        </View>
      </Pressable>

      <View className="flex-row gap-2 p-4">
        <Button testID="tonight-cook-it" className="flex-1" onPress={openCookMode}>
          Cook it
        </Button>
        <Button testID="tonight-swap" variant="outline" className="flex-1" onPress={openSwap}>
          Swap
        </Button>
      </View>
      {showNutrition && (
        <Pressable
          testID="tonight-ate-this"
          accessibilityRole="button"
          onPress={() =>
            logMutation.mutate({
              date: localDateStr(),
              recipeId: meal.recipe.id,
              mealType: meal.mealType,
              slotIndex: meal.slotIndex,
              portionMultiplier: logPortion,
            })
          }
          className="min-h-12 items-center justify-center border-t border-border py-2.5"
        >
          <Text className="text-sm font-semibold text-primary">
            {logMutation.isPending ? 'Logging…' : 'I ate this'}
          </Text>
        </Pressable>
      )}
      {logMutation.isError && (
        <Text className="px-4 pb-3 text-xs text-red-600">
          Couldn&apos;t log it: {userFacingErrorMessage(logMutation.error)}
        </Text>
      )}
    </Card>
  );
}

export function NothingTonightCard() {
  return (
    <Card testID="nothing-tonight-card">
      <Text className="text-sm font-semibold text-gray-800">Nothing planned tonight</Text>
      <Text variant="muted" className="mt-0.5 text-xs">
        Pick something quick from your recipes
      </Text>
      <Pressable
        testID="nothing-tonight-find-recipe"
        accessibilityRole="button"
        onPress={() => router.push('/recipes')}
        className="mt-2 min-h-11 justify-center self-start"
      >
        <Text className="text-sm font-semibold text-primary">Find a recipe</Text>
      </Pressable>
    </Card>
  );
}
