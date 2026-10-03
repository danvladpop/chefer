import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import {
  Avatar,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  Sheet,
  Text,
  useQueryState,
  useSnackbar,
} from '@chefer/ui-mobile';
import {
  cn,
  defaultCookServings,
  formatFractionalQuantity,
  formatPortion,
  formatScaledQuantity,
  isNotFoundError,
  labelCaveatLineText,
  parseNutritionStatus,
  recipeShareText,
  scaleNutrition,
  slotPortion,
  tableBreakdown,
  userFacingErrorMessage,
} from '@chefer/utils';
import { AiGeneratedChip } from '../../src/components/ai-generated-chip';
import { AddToWeekSheet } from '../../src/features/friends/add-to-week/add-to-week-sheet';
import { AppealLink } from '../../src/features/friends/components/appeal-link';
import { SourceLink } from '../../src/features/friends/components/source-link';
import { ReportSheet } from '../../src/features/friends/safety/report-sheet';
import {
  NutritionProvenance,
  nutritionStatusBadge,
} from '../../src/features/ingredients/nutrition-provenance';
import { AllergenWarningBanner } from '../../src/features/recipes/allergen-warning';
import { chunkShoppingLines, shoppingLinesFor } from '../../src/features/recipes/recipe-actions';
import { RecipeImage } from '../../src/features/recipes/recipe-image';
import { StarRating } from '../../src/features/recipes/star-rating';
import { CheckedForLine } from '../../src/features/safety/checked-for-line';
import { LabelCaveat } from '../../src/features/safety/label-caveat';
import { ReportSafetySheet } from '../../src/features/safety/report-sheet';
import { WhatWeCheckSheet } from '../../src/features/safety/what-we-check-sheet';
import { useCookingFor } from '../../src/hooks/use-cooking-for';
import { useHousehold } from '../../src/hooks/use-household';
import { useUnitSystem } from '../../src/hooks/use-unit-system';
import { trpc } from '../../src/lib/trpc';

// Recipe detail — port of apps/web (dashboard)/recipes/[id]/page.tsx (M2-3).
// Like web, the star rating shows only when opened from a meal-plan day
// (`day` param) — that's when the user actually ate it. Deviations,
// deliberate: meal-plan swap context stays on the Plan tab's picker sheet.
//
// Following (UX §9.4, PRD FR-17, all additive — every addition renders only
// when the API sent its field): another person's recipe (`creator`) gets a
// `By {name}` line to their profile, its `Source: {domain}` link, `Add to my
// week` as the primary action (Cook and the heart stay) and `Report recipe`
// in the overflow (next to `Report a safety problem`); a recipe opened from
// someone's week (`?owner=`) offers `Add to my week` too. My copy of
// someone's recipe (`origin`) reads `From {first}` (+ its source link); my
// own auto-hidden recipe (`hidden`) shows the owner-only banner. The viewer's
// own safety block is unchanged: it answers "can I eat this".

// UX-REC-04 / UX-REC-08: ⋯ is a menu on every recipe — Add to my week, Add
// ingredients to the shopping list and Share for all of them; Edit, Duplicate
// and Delete (with Undo) on your own; Report on someone else's. Each choice
// runs from the menu sheet's onExited so iOS never presents one sheet while
// another is still dismissing.
//
// UX-REC-10: a failed hero image becomes a placeholder, and the ← / ✎ / ⋯
// buttons live in a translucent bar pinned above the scroll view, so they
// stay on a surface and never scroll away.
//
// UX-REC-07: the source link shows on every imported recipe (a YouTube
// import has no embed, so the link back to the video is how you reach it).
// UX-REC-11: when the stepper differs from what the recipe makes, a note
// says so and gives the totals for that many servings.

type OverflowChoice =
  | 'safety'
  | 'report'
  | 'week'
  | 'shopping'
  | 'share'
  | 'edit'
  | 'duplicate'
  | 'delete';

/** Back, or the cookbook when this screen was opened cold (a deep link). */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/recipes');
}

function MenuItem({
  testID,
  icon,
  label,
  destructive = false,
  onPress,
}: {
  testID: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-3 rounded-xl border border-border px-4"
    >
      <Ionicons name={icon} size={20} color={destructive ? '#b91c1c' : '#374151'} />
      <Text
        className={cn('min-w-0 flex-1 text-base', destructive ? 'text-red-700' : 'text-gray-900')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function RecipeDetailScreen() {
  const { id, day, meal, portion, owner } = useLocalSearchParams<{
    id: string;
    day?: string;
    meal?: string;
    portion?: string;
    /** Opened from someone's Following week/recipes (UX §9.2). */
    owner?: string;
  }>();
  // P1-1: the plan slot's portion (servings of this recipe), when not 1×.
  const planPortion = slotPortion(parseFloat(portion ?? ''));
  const unitSystem = useUnitSystem();

  const recipeQuery = trpc.mealPlan.getRecipe.useQuery({ recipeId: id });
  const { data: recipe } = recipeQuery;
  // UX-REC-03: a failed load is not "not found" — only a real NOT_FOUND says so.
  const recipeState = useQueryState(recipeQuery);
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
  // Following: the overflow menu (another person's recipe), Report recipe and
  // Add to my week. A follow-up sheet opens from the menu's onExited.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowChoice = useRef<OverflowChoice | null>(null);
  const [reportRecipeOpen, setReportRecipeOpen] = useState(false);
  const [addToWeekOpen, setAddToWeekOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const snackbar = useSnackbar();
  const deleteMine = trpc.recipe.deleteMine.useMutation({ meta: { silent: true } });
  const addShopping = trpc.shoppingList.addCustomItems.useMutation({ meta: { silent: true } });
  const { scaledMembers } = useHousehold();
  const cookingFor = useCookingFor();

  if (recipeState.state === 'loading') {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ActivityIndicator size="large" color="#944a00" />
      </Screen>
    );
  }

  if (recipeState.state === 'error' || !recipe) {
    const notFound = recipeState.state === 'error' && isNotFoundError(recipeQuery.error);
    return (
      <Screen
        edges={['top', 'bottom', 'left', 'right']}
        className="items-center justify-center gap-3"
      >
        {notFound ? (
          <Text testID="recipe-not-found" variant="muted">
            Recipe not found.
          </Text>
        ) : (
          <ErrorState
            testID="recipe-load-error"
            title="Couldn't load this recipe"
            onRetry={recipeState.retry}
          />
        )}
        <Button variant="outline" onPress={leave}>
          Go back
        </Button>
      </Screen>
    );
  }

  const isSaved = savedData?.isSaved ?? false;
  const creator = recipe.creator;
  const origin = recipe.origin;
  const isOwner = savedData?.canEdit === true;
  // Following: another person's recipe leads with Add to my week (primary,
  // through the friends API); every other recipe gets it as a secondary action.
  const offerAddToWeek = creator !== undefined || (owner !== undefined && !isOwner);
  const totalTime = recipe.prepTimeMins + recipe.cookTimeMins;
  const n = recipe.nutritionInfo;
  // D-18/UX-40: a blank nutrition section (never filled in, or D-19's
  // minimum-only save) shows "Nutrition not added" instead of "0 kcal".
  // plan-ingredient-catalog §10: how the numbers were made. A PARTIAL recipe
  // with nothing resolved still says "Incomplete", never "not added".
  const nutritionStatus = parseNutritionStatus(recipe.nutritionStatus);
  const statusBadge = nutritionStatusBadge(nutritionStatus);
  const nutritionAdded =
    n.calories > 0 || n.protein > 0 || n.carbs > 0 || n.fat > 0 || nutritionStatus === 'PARTIAL';
  // Opened from a portioned plan slot, quantities start at that portion (P1-1);
  // premium households start from the whole table (P2-3) — the two multiply.
  const selectedServings =
    servings ?? defaultCookServings(recipe.servings, scaledMembers, planPortion, cookingFor);
  const planN = scaleNutrition(n, planPortion);
  const totalN = scaleNutrition(n, selectedServings);
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

  const shareRecipe = () => {
    void Share.share({
      message: recipeShareText(
        {
          name: recipe.name,
          description: recipe.description,
          servings: recipe.servings,
          sourceUrl: recipe.sourceUrl,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
        },
        unitSystem,
      ),
    }).catch(() => undefined);
  };

  /** Adds the ingredients (scaled to the stepper) to this week's list. */
  const addToShoppingList = async () => {
    try {
      const plan = await utils.client.mealPlan.getForWeek.query({ weekOffset: 0 });
      if (!plan) {
        snackbar.show({ message: 'Make a plan first, then add ingredients to its list.' });
        return;
      }
      const lines = shoppingLinesFor(recipe.ingredients, selectedServings, recipe.servings);
      for (const items of chunkShoppingLines(lines)) {
        await addShopping.mutateAsync({ planId: plan.planId, items });
      }
      void utils.shoppingList.getForWeek.invalidate();
      snackbar.show({
        message: `Added ${lines.length} ingredient${lines.length === 1 ? '' : 's'} to your shopping list`,
        tone: 'success',
      });
    } catch (error) {
      snackbar.show({
        message: userFacingErrorMessage(error, 'Couldn’t add them to the list. Try again.'),
      });
    }
  };

  const confirmDelete = () => {
    deleteMine.mutate(
      { recipeId: recipe.id },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          void utils.recipe.list.invalidate();
          void utils.mealPlan.getForWeek.invalidate();
          snackbar.show({
            message: `Deleted “${recipe.name}”`,
            actionLabel: 'Undo',
            onAction: () => {
              void utils.client.recipe.restoreMine.mutate({ recipeId: recipe.id }).then(
                () => {
                  void utils.recipe.list.invalidate();
                  void utils.mealPlan.getForWeek.invalidate();
                },
                () => snackbar.show({ message: 'Couldn’t restore the recipe. Try again.' }),
              );
            },
          });
          leave();
        },
      },
    );
  };

  const runOverflowChoice = (choice: OverflowChoice | null) => {
    switch (choice) {
      case 'safety':
        setReportOpen(true);
        break;
      case 'report':
        setReportRecipeOpen(true);
        break;
      case 'week':
        setAddToWeekOpen(true);
        break;
      case 'shopping':
        void addToShoppingList();
        break;
      case 'share':
        shareRecipe();
        break;
      case 'edit':
        router.push({ pathname: '/recipe-form', params: { id: recipe.id } });
        break;
      case 'duplicate':
        router.push({ pathname: '/recipe-form', params: { duplicateOf: recipe.id } });
        break;
      case 'delete':
        deleteMine.reset();
        setDeleteOpen(true);
        break;
      default:
        break;
    }
  };

  const chooseOverflow = (choice: OverflowChoice) => {
    overflowChoice.current = choice;
    setOverflowOpen(false);
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-1">
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="pb-8"
        >
          {/* Hero image — a failed photo becomes a placeholder (UX-REC-10) */}
          <RecipeImage
            testID="recipe-hero"
            imageUrl={recipe.imageUrl}
            className="h-56 w-full"
            accessibilityLabel={recipe.name}
            iconSize={48}
          />

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
              {/* R-14 (Art. 50): AI-generated recipes carry the same label as plan cards. */}
              <AiGeneratedChip recipe={recipe} />
              {creator ? (
                <PressableScale
                  testID="recipe-by"
                  pressScale="control"
                  accessibilityRole="button"
                  accessibilityLabel={FRIENDS_COPY.recipe.byLabel(creator.displayName)}
                  onPress={() =>
                    router.push({ pathname: '/friends/[userId]', params: { userId: creator.id } })
                  }
                  className="min-h-11 flex-row items-center gap-2 self-start"
                >
                  <Avatar name={creator.displayName} seed={creator.id} size="sm" />
                  <Text className="text-sm font-medium text-gray-900">
                    {FRIENDS_COPY.recipe.by(creator.displayName)}
                  </Text>
                </PressableScale>
              ) : null}
              {origin ? (
                <View
                  testID="recipe-from"
                  className="self-start rounded-full bg-gray-100 px-3 py-0.5"
                >
                  <Text className="text-xs text-gray-700">
                    {origin.creatorFirstName
                      ? FRIENDS_COPY.recipe.from(origin.creatorFirstName)
                      : FRIENDS_COPY.recipe.fromGone}
                  </Text>
                </View>
              ) : null}
              {recipe.sourceUrl ? (
                <SourceLink testID="recipe-source" url={recipe.sourceUrl} />
              ) : null}
              {recipe.deleted ? (
                <View
                  testID="recipe-deleted-banner"
                  accessibilityRole="summary"
                  className="rounded-xl bg-gray-100 px-3 py-2"
                >
                  <Text className="text-sm text-gray-800">
                    This recipe was deleted. It stays in the plan slots that already use it.
                  </Text>
                </View>
              ) : null}
              {recipe.hidden ? (
                <View
                  testID="recipe-hidden-banner"
                  accessibilityRole="summary"
                  className="gap-1 rounded-xl bg-blue-50 px-3 py-2"
                >
                  <Text className="text-sm font-semibold text-blue-900">
                    {FRIENDS_COPY.recipe.hidden.title}
                  </Text>
                  <Text className="text-sm text-blue-900">
                    {recipe.hidden.reason === 'FILTER'
                      ? FRIENDS_COPY.recipe.hidden.filter
                      : FRIENDS_COPY.recipe.hidden.reports}
                  </Text>
                  <AppealLink subject="recipe" tone="text-blue-900" testID="recipe-hidden-appeal" />
                </View>
              ) : null}
              <Text variant="muted" className="text-sm">
                {recipe.description}
              </Text>
              <AllergenWarningBanner
                warnings={recipe.allergenWarnings}
                details={safetyData?.safetyChecks?.conflictDetails}
                className="mt-2"
              />
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

            {/* Following (UX §9.4): another person's recipe leads with Add to my week. */}
            {offerAddToWeek ? (
              <Button testID="recipe-add-to-week" onPress={() => setAddToWeekOpen(true)}>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="calendar-outline" size={16} color="white" />
                  <Text className="text-sm font-medium text-primary-foreground">
                    {FRIENDS_COPY.recipe.addToWeek}
                  </Text>
                </View>
              </Button>
            ) : null}

            {/* Actions: cook is primary (web P1-3), save secondary */}
            <View className="flex-row gap-2">
              <Button
                testID="recipe-cook"
                variant={offerAddToWeek ? 'outline' : 'default'}
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
                  <Ionicons
                    name="restaurant-outline"
                    size={16}
                    color={offerAddToWeek ? '#944a00' : 'white'}
                  />
                  <Text
                    className={cn(
                      'text-sm font-medium',
                      offerAddToWeek ? 'text-primary' : 'text-primary-foreground',
                    )}
                  >
                    Cook
                  </Text>
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

            {/* UX-REC-08: every other recipe gets Add to my week too (the leading
              button above is Following's, for another person's recipe). */}
            {!offerAddToWeek && !recipe.deleted ? (
              <Button
                testID="recipe-add-to-week"
                variant="outline"
                onPress={() => setAddToWeekOpen(true)}
              >
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="calendar-outline" size={16} color="#944a00" />
                  <Text className="text-sm font-medium text-primary">
                    {FRIENDS_COPY.recipe.addToWeek}
                  </Text>
                </View>
              </Button>
            ) : null}

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
                    {statusBadge ? (
                      <Text
                        testID="recipe-energy-status"
                        className={cn(
                          'text-xs',
                          nutritionStatus === 'PARTIAL' ? 'text-amber-700' : 'text-gray-500',
                        )}
                      >
                        {statusBadge}
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            )}

            {/* P1-1: the plan sized this slot to the day's targets */}
            {planPortion !== 1 && (
              <View testID="recipe-plan-portion" className="rounded-xl bg-accent px-3 py-2">
                <Text className="text-xs text-primary">
                  Your plan has a {formatPortion(planPortion)} portion here — {planN.calories} kcal
                  · {Math.round(planN.protein)} g protein. Quantities start at it.
                </Text>
              </View>
            )}

            {/* UX-REC-02: the table is the user's portion plus each member, spelled out. */}
            {scaledMembers !== null && (
              <Text testID="recipe-table-breakdown" variant="muted" className="text-xs">
                Sized for your table: {tableBreakdown(planPortion, scaledMembers)}
              </Text>
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
                    className="h-11 w-11 items-center justify-center"
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
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Text className="text-lg text-gray-600">+</Text>
                  </Pressable>
                </View>
              </View>
              {/* UX-REC-11: say what the stepper changed, with the totals. */}
              {selectedServings !== recipe.servings ? (
                <Text testID="recipe-servings-note" variant="muted" className="mb-3 text-xs">
                  Cooking for {formatFractionalQuantity(selectedServings)} (recipe makes{' '}
                  {recipe.servings}) — amounts are scaled
                  {nutritionAdded
                    ? `; about ${Math.round(totalN.calories)} kcal and ${Math.round(totalN.protein)} g protein in total.`
                    : '.'}
                </Text>
              ) : null}
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
                  <NutritionProvenance
                    status={nutritionStatus}
                    lines={recipe.nutritionLines ?? []}
                    ingredientCount={recipe.ingredients.length}
                    servings={recipe.servings}
                    onFix={
                      savedData?.canEdit
                        ? () => router.push({ pathname: '/recipe-form', params: { id: recipe.id } })
                        : undefined
                    }
                  />
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

        {/* Sticky translucent header (UX-REC-10): pinned above the scroll view. */}
        <View
          testID="recipe-header"
          pointerEvents="box-none"
          className="absolute inset-x-0 top-0 flex-row items-center justify-between bg-white/70 px-3 py-1.5"
        >
          <Pressable
            testID="recipe-back"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={leave}
            className="h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white"
          >
            <Ionicons name="arrow-back" size={20} color="#1f2937" />
          </Pressable>
          <View className="flex-row gap-2">
            {/* Owner dogfood 2026-09-30: your own recipes are editable from
              the recipe itself, not only from the Cookbook "Mine" card. */}
            {isOwner ? (
              <Pressable
                testID="recipe-edit"
                accessibilityRole="button"
                accessibilityLabel="Edit recipe"
                onPress={() => router.push({ pathname: '/recipe-form', params: { id: recipe.id } })}
                className="h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white"
              >
                <Ionicons name="pencil" size={18} color="#944a00" />
              </Pressable>
            ) : null}
            <Pressable
              testID="recipe-report-overflow"
              accessibilityRole="button"
              accessibilityLabel="More options"
              onPress={() => setOverflowOpen(true)}
              className="h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#1f2937" />
            </Pressable>
          </View>
        </View>
      </View>

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
      <Sheet
        testID="recipe-overflow-menu"
        visible={overflowOpen}
        title={recipe.name}
        onClose={() => {
          overflowChoice.current = null;
          setOverflowOpen(false);
        }}
        onExited={() => {
          const choice = overflowChoice.current;
          overflowChoice.current = null;
          runOverflowChoice(choice);
        }}
      >
        <View className="gap-2">
          {recipe.deleted ? null : (
            <MenuItem
              testID="recipe-overflow-week"
              icon="calendar-outline"
              label={FRIENDS_COPY.recipe.addToWeek}
              onPress={() => chooseOverflow('week')}
            />
          )}
          <MenuItem
            testID="recipe-overflow-shopping"
            icon="cart-outline"
            label="Add ingredients to shopping list"
            onPress={() => chooseOverflow('shopping')}
          />
          <MenuItem
            testID="recipe-overflow-share"
            icon="share-outline"
            label="Share"
            onPress={() => chooseOverflow('share')}
          />
          {isOwner ? (
            <>
              <MenuItem
                testID="recipe-overflow-edit"
                icon="pencil-outline"
                label="Edit"
                onPress={() => chooseOverflow('edit')}
              />
              <MenuItem
                testID="recipe-overflow-duplicate"
                icon="copy-outline"
                label="Duplicate"
                onPress={() => chooseOverflow('duplicate')}
              />
            </>
          ) : null}
          <MenuItem
            testID="recipe-overflow-safety"
            icon="shield-outline"
            label="Report a safety problem"
            onPress={() => chooseOverflow('safety')}
          />
          {creator ? (
            <MenuItem
              testID="recipe-overflow-report"
              icon="flag-outline"
              label={FRIENDS_COPY.recipe.report}
              onPress={() => chooseOverflow('report')}
            />
          ) : null}
          {isOwner ? (
            <MenuItem
              testID="recipe-overflow-delete"
              icon="trash-outline"
              label="Delete"
              destructive
              onPress={() => chooseOverflow('delete')}
            />
          ) : null}
        </View>
      </Sheet>
      <ConfirmSheet
        testID="recipe-delete-confirm"
        visible={deleteOpen}
        onClose={() => {
          if (!deleteMine.isPending) setDeleteOpen(false);
        }}
        title="Delete this recipe?"
        body={`“${recipe.name}” will be removed from your cookbook, lists and suggestions. Plan slots that already use it keep it. You can undo right after.`}
        confirmLabel="Delete"
        cancelLabel="Keep it"
        destructive
        busy={deleteMine.isPending}
        error={deleteMine.isError ? userFacingErrorMessage(deleteMine.error) : null}
        onConfirm={confirmDelete}
      />
      {creator ? (
        <ReportSheet
          testID="recipe-report-recipe"
          visible={reportRecipeOpen}
          person={creator}
          recipeId={recipe.id}
          onClose={() => setReportRecipeOpen(false)}
          onReported={leave}
        />
      ) : null}
      {addToWeekOpen ? (
        <AddToWeekSheet
          recipe={{ id: recipe.id, name: recipe.name, kcal: n.calories }}
          api={offerAddToWeek ? 'friends' : 'recipe'}
          onDismiss={() => setAddToWeekOpen(false)}
        />
      ) : null}
    </Screen>
  );
}
