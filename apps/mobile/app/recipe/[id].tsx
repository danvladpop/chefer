import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, KeyboardAwareScrollView, Screen, Text } from '@chefer/ui-mobile';
import {
  cn,
  defaultCookServings,
  formatFractionalQuantity,
  formatPortion,
  formatScaledQuantity,
  labelCaveatLineText,
  scaleNutrition,
  slotPortion,
} from '@chefer/utils';
import { AllergenWarningBanner } from '../../src/features/recipes/allergen-warning';
import { StarRating } from '../../src/features/recipes/star-rating';
import { CheckedForLine } from '../../src/features/safety/checked-for-line';
import { LabelCaveat } from '../../src/features/safety/label-caveat';
import { ReportSafetySheet } from '../../src/features/safety/report-sheet';
import { WhatWeCheckSheet } from '../../src/features/safety/what-we-check-sheet';
import { useHousehold } from '../../src/hooks/use-household';
import { useUnitSystem } from '../../src/hooks/use-unit-system';
import { getRecipeImageUrl } from '../../src/lib/recipe-image';
import { trpc } from '../../src/lib/trpc';

// Recipe detail — port of apps/web (dashboard)/recipes/[id]/page.tsx (M2-3).
// Like web, the star rating shows only when opened from a meal-plan day
// (`day` param) — that's when the user actually ate it. Deviations,
// deliberate: meal-plan swap context stays on the Plan tab's picker sheet.

export default function RecipeDetailScreen() {
  const { id, day, meal, portion } = useLocalSearchParams<{
    id: string;
    day?: string;
    meal?: string;
    portion?: string;
  }>();
  // P1-1: the plan slot's portion (servings of this recipe), when not 1×.
  const planPortion = slotPortion(parseFloat(portion ?? ''));
  const unitSystem = useUnitSystem();

  const { data: recipe, isLoading, isError } = trpc.mealPlan.getRecipe.useQuery({ recipeId: id });
  const { data: savedData } = trpc.recipe.isSaved.useQuery({ recipeId: id });
  // T-02.3: a separate, additive query (mealPlan.getRecipe is another lane's
  // file this wave) — null when the table has nothing to check or report.
  const { data: safetyData } = trpc.recipe.getSafetyChecks.useQuery({ recipeId: id });
  const { data: table } = trpc.safety.getTable.useQuery();

  const utils = trpc.useUtils();
  const toggleFav = trpc.recipe.toggleFavourite.useMutation({
    onSettled: () => {
      void utils.recipe.isSaved.invalidate({ recipeId: id });
      void utils.recipe.list.invalidate();
    },
  });

  const [servings, setServings] = useState<number | null>(null);
  const [whatWeCheckOpen, setWhatWeCheckOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { portionSum } = useHousehold();

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
  // D-18/UX-40: a blank nutrition section (never filled in, or D-19's
  // minimum-only save) shows "Nutrition not added" instead of "0 kcal".
  const nutritionAdded = n.calories > 0 || n.protein > 0 || n.carbs > 0 || n.fat > 0;
  // Opened from a portioned plan slot, quantities start at that portion (P1-1);
  // premium households start from the whole table (P2-3) — the two multiply.
  const selectedServings =
    servings ?? defaultCookServings(recipe.servings, portionSum, planPortion);
  const planN = scaleNutrition(n, planPortion);
  const scale = selectedServings / (recipe.servings || 1);
  // UX-40: "0 min" invents a time nobody entered — a blank prep/cook field
  // is sent as 0 and means "unknown", so the stat is hidden, not shown as 0.
  const timeStats = (
    [
      ['Prep', recipe.prepTimeMins],
      ['Cook', recipe.cookTimeMins],
      ['Total', totalTime],
    ] as const
  ).filter(([, minutes]) => minutes > 0);

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
          <View className="absolute right-3 top-3 flex-row gap-2">
            {/* Owner dogfood 2026-09-30: your own recipes are editable from
                the recipe itself, not only from the Cookbook "Mine" card. */}
            {savedData?.canEdit ? (
              <Pressable
                testID="recipe-edit"
                accessibilityRole="button"
                accessibilityLabel="Edit recipe"
                onPress={() => router.push({ pathname: '/recipe-form', params: { id: recipe.id } })}
                className="h-11 w-11 items-center justify-center rounded-full bg-white/90"
              >
                <Ionicons name="pencil" size={18} color="#944a00" />
              </Pressable>
            ) : null}
            {/* UX-01 (d), T-01.5: report a safety problem — hides this recipe
                from the reporter's plans, swaps and suggestions at once. */}
            <Pressable
              testID="recipe-report-overflow"
              accessibilityRole="button"
              accessibilityLabel="Report a safety problem"
              onPress={() => setReportOpen(true)}
              className="h-11 w-11 items-center justify-center rounded-full bg-white/90"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#1f2937" />
            </Pressable>
          </View>
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
            {/* T-02.3 AC3: never both — the line only shows when the
                existing conflict banner above isn't already showing one. */}
            {(recipe.allergenWarnings?.length ?? 0) === 0 && safetyData?.safetyChecks ? (
              <CheckedForLine
                testID="recipe-checked-for"
                checks={safetyData.safetyChecks}
                onPress={() => setWhatWeCheckOpen(true)}
              />
            ) : null}
            {safetyData?.safetyChecks?.labelCaveats &&
            safetyData.safetyChecks.labelCaveats.length > 0 ? (
              <LabelCaveat
                testID="recipe-label-caveat"
                text={labelCaveatLineText(
                  safetyData.safetyChecks.labelCaveats.map((c) => c.ingredient),
                )}
              />
            ) : null}
          </View>

          {/* Actions: cook is primary (web P1-3), save secondary */}
          <View className="flex-row gap-2">
            <Button
              testID="recipe-cook"
              className="flex-1"
              onPress={() =>
                router.push({
                  pathname: '/cook/[id]',
                  params: {
                    id,
                    ...(meal && { meal }),
                    ...(planPortion !== 1 && { portion: String(planPortion) }),
                  },
                })
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

          {/* Stats — a 0 prep/cook/total time or an empty nutrition is
              hidden rather than shown as "0m" / "0 kcal" (UX-40). */}
          {(timeStats.length > 0 || nutritionAdded) && (
            <View className="flex-row justify-between rounded-2xl border border-border bg-gray-50 px-4 py-3">
              {timeStats.map(([label, minutes]) => (
                <View key={label} className="items-center">
                  <Text className="text-xs text-gray-500">{label}</Text>
                  <Text className="text-sm font-semibold text-gray-800">{minutes}m</Text>
                </View>
              ))}
              {nutritionAdded && (
                <View className="items-center">
                  <Text className="text-xs text-gray-500">Energy</Text>
                  <Text className="text-sm font-semibold text-gray-800">{n.calories} kcal</Text>
                </View>
              )}
            </View>
          )}

          {/* P1-1: the plan sized this slot to the day's targets */}
          {planPortion !== 1 && (
            <View testID="recipe-plan-portion" className="rounded-xl bg-accent px-3 py-2">
              <Text className="text-xs text-primary">
                Your plan has a {formatPortion(planPortion)} portion here — {planN.calories} kcal ·{' '}
                {Math.round(planN.protein)} g protein. Quantities start at it.
              </Text>
            </View>
          )}

          {/* Macros — no Fiber (D-18); hidden entirely when nothing was added. */}
          {nutritionAdded && (
            <View className="flex-row gap-2">
              {(
                [
                  ['Protein', n.protein],
                  ['Carbs', n.carbs],
                  ['Fat', n.fat],
                ] as const
              ).map(([label, value]) => (
                <View key={label} className="flex-1 items-center rounded-xl bg-gray-100 py-2">
                  <Text className="text-xs text-gray-500">{label}</Text>
                  <Text className="text-sm font-semibold text-gray-800">{value}g</Text>
                </View>
              ))}
            </View>
          )}

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
                <Text
                  testID="recipe-servings-count"
                  className="w-8 text-center text-sm font-medium"
                >
                  {formatFractionalQuantity(selectedServings)}
                </Text>
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
                    {formatScaledQuantity(ing.quantity, ing.unit, scale, unitSystem)}
                  </Text>
                  <Text className="min-w-0 flex-1 text-sm text-gray-600">{ing.name}</Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Instructions — D10/UX-40: no steps is a valid recipe, not an
              error; the card reads "No steps yet" instead of rendering empty. */}
          <Card testID="recipe-instructions">
            <Text variant="heading" className="mb-3">
              Instructions
            </Text>
            {recipe.instructions.length > 0 ? (
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
            ) : (
              <Text testID="recipe-no-steps" variant="muted" className="text-sm">
                No steps yet
              </Text>
            )}
          </Card>

          {/* Nutrition facts. bug B-22: the label used to read "per {recipe.
              servings} servings" while sitting right under a stepper that
              changes the SELECTED servings — easy to misread as already
              scaled. The label is fixed; a separate line states the total
              for what's actually selected. */}
          <Card testID="recipe-nutrition-facts">
            <Text variant="heading" className="mb-2">
              Nutrition Facts{' '}
              <Text variant="muted" className="text-xs">
                per serving
              </Text>
            </Text>
            {nutritionAdded ? (
              <>
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
                {selectedServings !== recipe.servings && (
                  <Text testID="recipe-nutrition-scaled" variant="muted" className="mt-2 text-xs">
                    Scaled for {formatFractionalQuantity(selectedServings)} servings:{' '}
                    {Math.round(n.calories * selectedServings)} kcal total
                  </Text>
                )}
              </>
            ) : (
              <Text testID="recipe-nutrition-not-added" variant="muted" className="text-sm">
                Nutrition not added
              </Text>
            )}
          </Card>

          {/* Star rating — shown when opened from a meal-plan day */}
          {day !== undefined && <StarRating recipeId={id} />}
        </View>
      </KeyboardAwareScrollView>

      {table ? (
        <WhatWeCheckSheet
          visible={whatWeCheckOpen}
          onClose={() => setWhatWeCheckOpen(false)}
          table={table}
        />
      ) : null}
      <ReportSafetySheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        recipeId={id}
        recipeName={recipe.name}
        surface="recipe_detail"
      />
    </Screen>
  );
}
