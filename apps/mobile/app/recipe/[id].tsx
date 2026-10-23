import { useRef, useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import {
  Avatar,
  ConfirmSheet,
  ErrorState,
  heroHeight,
  IconButton,
  KeyboardAwareScrollView,
  ListRow,
  ListSection,
  PressableScale,
  Screen,
  Sheet,
  Text,
  useQueryState,
  useReadableLayout,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  clampCookServings,
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
import { Icon, type IconName } from '../../src/components/icon';
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
import { BoardCard, SectionTitle } from '../../src/features/shell/today/parts';
import { TrainButton } from '../../src/features/shell/train/train-button';
import { useCookingFor } from '../../src/hooks/use-cooking-for';
import { useHousehold } from '../../src/hooks/use-household';
import { useUnitSystem } from '../../src/hooks/use-unit-system';
import { useT } from '../../src/lib/i18n';
import { isPreparing } from '../../src/lib/recipe-image';
import { trpc } from '../../src/lib/trpc';

/** The hero's height on a phone (Tailwind h-56). */
const RECIPE_HERO_MIN_HEIGHT = 224;
/** How often a recipe still waiting for its photo is re-fetched (F3). */
const PREPARING_REFETCH_MS = 30_000;

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
// UX-REC-10: a failed hero image becomes a placeholder, and the ‹ / ✎ / ⋯
// buttons live in the shell-style top bar pinned above the scroll view (and
// the photo), so they stay on the canvas and never scroll away.
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

/** The ⋯ sheet's rows: brand-tinted glyphs, a danger one for Delete. */
function MenuIcon({
  name,
  ionicon,
  destructive = false,
}: {
  name?: IconName;
  /** A glyph the Icon set lacks (the report flag), tinted the same way. */
  ionicon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
}) {
  const colors = useThemeColors();
  const color = destructive ? colors.danger : colors.brand;
  return name ? (
    <Icon name={name} color={color} />
  ) : (
    <Ionicons
      name={ionicon ?? 'ellipse-outline'}
      size={22}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

export default function RecipeDetailScreen() {
  const { t } = useT();
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

  // F3: a recipe waiting for its generated photo shows "Preparing photo…";
  // re-ask now and then so the photo appears without leaving the screen.
  const recipeQuery = trpc.mealPlan.getRecipe.useQuery(
    { recipeId: id },
    {
      refetchInterval: (query) =>
        isPreparing(query.state.data?.imageStatus) ? PREPARING_REFETCH_MS : false,
    },
  );
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
  const colors = useThemeColors();
  // Large screens: the hero keeps its phone height (h-56) on a phone and
  // grows 16:9 with the readable column elsewhere, capped at 40% of the
  // window — a fixed 224pt strip across a tablet was a thin, upscaled crop.
  const { windowWidth, windowHeight } = useReadableLayout();
  const heroHeightPt = heroHeight({
    windowWidth,
    windowHeight,
    minHeight: RECIPE_HERO_MIN_HEIGHT,
    aspectRatio: 16 / 9,
    horizontalPadding: 32,
  });

  if (recipeState.state === 'loading') {
    return (
      <Screen
        edges={['top', 'bottom', 'left', 'right']}
        className="items-center justify-center bg-canvas"
      >
        <ActivityIndicator size="large" color={colors.brand} />
      </Screen>
    );
  }

  if (recipeState.state === 'error' || !recipe) {
    const notFound = recipeState.state === 'error' && isNotFoundError(recipeQuery.error);
    return (
      <Screen
        edges={['top', 'bottom', 'left', 'right']}
        className="items-center justify-center gap-3 bg-canvas"
      >
        {notFound ? (
          <Text testID="recipe-not-found" className="text-body text-label-secondary">
            {t('recipes.detail.notFound')}
          </Text>
        ) : (
          <ErrorState
            testID="recipe-load-error"
            title={t('recipes.detail.loadError')}
            onRetry={recipeState.retry}
          />
        )}
        <TrainButton variant="outline" label={t('recipes.screen.goBack')} onPress={leave} />
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
      ['prep', recipe.prepTimeMins],
      ['cook', recipe.cookTimeMins],
      ['total', totalTime],
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
        snackbar.show({ message: t('recipes.detail.needPlan') });
        return;
      }
      const lines = shoppingLinesFor(recipe.ingredients, selectedServings, recipe.servings);
      for (const items of chunkShoppingLines(lines)) {
        await addShopping.mutateAsync({ planId: plan.planId, items });
      }
      void utils.shoppingList.getForWeek.invalidate();
      snackbar.show({
        message: t('recipes.detail.addedToList', { count: lines.length }),
        tone: 'success',
      });
    } catch (error) {
      snackbar.show({
        message: userFacingErrorMessage(error, t('recipes.detail.addToListError')),
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
            message: t('recipes.list.deleted', { name: recipe.name }),
            actionLabel: t('recipes.list.undo'),
            onAction: () => {
              void utils.client.recipe.restoreMine.mutate({ recipeId: recipe.id }).then(
                () => {
                  void utils.recipe.list.invalidate();
                  void utils.mealPlan.getForWeek.invalidate();
                },
                () => snackbar.show({ message: t('recipes.screen.restoreError') }),
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
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      {/* Top bar (UX-REC-10, 11 Oct restyle): the shell's pushed-screen bar —
        brand chevron Back, Edit and ⋯ — pinned above the scroll view so it
        never scrolls away and always sits on the canvas, photo or not. */}
      <View
        testID="recipe-header"
        className="min-h-11 flex-row items-center justify-between gap-2 px-4"
      >
        <IconButton
          testID="recipe-back"
          accessibilityLabel={t('common.actions.back')}
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={leave}
          className="-ml-2"
        />
        <View className="flex-row items-center gap-1">
          {/* Owner dogfood 2026-09-30: your own recipes are editable from
            the recipe itself, not only from the Cookbook "Mine" card. */}
          {isOwner ? (
            <IconButton
              testID="recipe-edit"
              accessibilityLabel={t('recipes.list.editRecipe')}
              icon={<Icon name="edit" color={colors.brand} />}
              onPress={() => router.push({ pathname: '/recipe-form', params: { id: recipe.id } })}
            />
          ) : null}
          <IconButton
            testID="recipe-report-overflow"
            accessibilityLabel={t('recipes.screen.moreOptions')}
            icon={<Icon name="more" color={colors.brand} />}
            onPress={() => setOverflowOpen(true)}
            className="-mr-2"
          />
        </View>
      </View>

      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-8">
        {/* Hero image — the page is photo-led; a failed photo becomes a
          placeholder (UX-REC-10), and so does one still being generated (F3) */}
        <View className="px-4 pt-2">
          <RecipeImage
            testID="recipe-hero"
            imageUrl={recipe.imageUrl}
            imageStatus={recipe.imageStatus}
            showStatusLabel
            className="w-full overflow-hidden rounded-card"
            style={{ height: heroHeightPt }}
            accessibilityLabel={recipe.name}
            iconSize={48}
          />
        </View>

        <View className="gap-4 px-4 pt-4">
          {/* Tags + title */}
          <View className="gap-2">
            <View className="flex-row flex-wrap gap-2">
              <Text className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand">
                {recipe.cuisineType}
              </Text>
              {recipe.dietaryTags.slice(0, 2).map((tag) => (
                <Text
                  key={tag}
                  className="rounded-full bg-surface-sunken px-2 text-caption text-label-secondary"
                >
                  {tag}
                </Text>
              ))}
            </View>
            <Text
              testID="recipe-name"
              accessibilityRole="header"
              className="text-title1 font-bold text-label"
            >
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
                <Text className="text-subhead font-semibold text-label">
                  {FRIENDS_COPY.recipe.by(creator.displayName)}
                </Text>
              </PressableScale>
            ) : null}
            {origin ? (
              <View testID="recipe-from" className="self-start rounded-full bg-surface-sunken px-2">
                <Text className="text-caption text-label-secondary">
                  {origin.creatorFirstName
                    ? FRIENDS_COPY.recipe.from(origin.creatorFirstName)
                    : FRIENDS_COPY.recipe.fromGone}
                </Text>
              </View>
            ) : null}
            {recipe.sourceUrl ? <SourceLink testID="recipe-source" url={recipe.sourceUrl} /> : null}
            {recipe.deleted ? (
              <View
                testID="recipe-deleted-banner"
                accessibilityRole="summary"
                className="rounded-card bg-surface-sunken px-3 py-2"
              >
                <Text className="text-subhead text-label">{t('recipes.detail.deletedBanner')}</Text>
              </View>
            ) : null}
            {recipe.hidden ? (
              <View
                testID="recipe-hidden-banner"
                accessibilityRole="summary"
                className="gap-1 rounded-card bg-info/10 px-3 py-2"
              >
                <Text className="text-subhead font-semibold text-info">
                  {FRIENDS_COPY.recipe.hidden.title}
                </Text>
                <Text className="text-subhead text-info">
                  {recipe.hidden.reason === 'FILTER'
                    ? FRIENDS_COPY.recipe.hidden.filter
                    : FRIENDS_COPY.recipe.hidden.reports}
                </Text>
                <AppealLink subject="recipe" tone="text-info" testID="recipe-hidden-appeal" />
              </View>
            ) : null}
            <Text className="text-body text-label-secondary">{recipe.description}</Text>
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
            <TrainButton
              testID="recipe-add-to-week"
              icon="calendar"
              label={FRIENDS_COPY.recipe.addToWeek}
              onPress={() => setAddToWeekOpen(true)}
            />
          ) : null}

          {/* Actions: cook is primary (web P1-3), save secondary */}
          <View className="flex-row gap-2">
            <TrainButton
              testID="recipe-cook"
              variant={offerAddToWeek ? 'tinted' : 'primary'}
              icon="cook"
              label={t('recipes.detail.cook')}
              className="flex-1"
              onPress={() =>
                router.push({
                  pathname: '/cook/[id]',
                  params: {
                    id,
                    ...(meal && { meal }),
                    ...(planPortion !== 1 && { portion: String(planPortion) }),
                    // UX-COOK-05: the stepper's choice follows you into cook mode.
                    ...(servings !== null && { servings: String(selectedServings) }),
                  },
                })
              }
            />
            <TrainButton
              testID="recipe-save"
              variant={isSaved ? 'tinted' : 'outline'}
              icon={isSaved ? 'heart' : 'heartOutline'}
              label={isSaved ? t('common.states.saved') : t('common.actions.save')}
              className="flex-1"
              loading={toggleFav.isPending}
              onPress={() => toggleFav.mutate({ recipeId: id })}
            />
          </View>

          {/* UX-REC-08: every other recipe gets Add to my week too (the leading
            button above is Following's, for another person's recipe). */}
          {!offerAddToWeek && !recipe.deleted ? (
            <TrainButton
              testID="recipe-add-to-week"
              variant="tinted"
              icon="calendar"
              label={FRIENDS_COPY.recipe.addToWeek}
              onPress={() => setAddToWeekOpen(true)}
            />
          ) : null}

          {/* Stats — a 0 prep/cook/total time or an empty nutrition is
            hidden rather than shown as "0m" / "0 kcal" (UX-40). */}
          {(timeStats.length > 0 || nutritionAdded) && (
            <View className="flex-row justify-between rounded-card border border-separator bg-surface px-4 py-3">
              {timeStats.map(([kind, minutes]) => (
                <View key={kind} className="items-center">
                  <Text className="text-caption text-label-secondary">
                    {t(`recipes.screen.time.${kind}`)}
                  </Text>
                  <Text className="text-callout font-semibold text-label">
                    {t('recipes.card.minutesShort', { mins: minutes })}
                  </Text>
                </View>
              ))}
              {nutritionAdded && (
                <View className="items-center">
                  <Text className="text-caption text-label-secondary">
                    {t('recipes.screen.energy')}
                  </Text>
                  <Text className="text-callout font-semibold text-label">
                    {t('recipes.card.kcal', { value: n.calories })}
                  </Text>
                  {statusBadge ? (
                    <Text
                      testID="recipe-energy-status"
                      className={cn(
                        'text-caption',
                        nutritionStatus === 'PARTIAL' ? 'text-attention' : 'text-label-tertiary',
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
            <View testID="recipe-plan-portion" className="rounded-card bg-brand-tint px-3 py-2">
              <Text className="text-subhead text-brand">
                {t('recipes.detail.portionNote', {
                  portion: t('recipes.detail.portionLabel', {
                    portion: formatPortion(planPortion),
                  }),
                  kcal: planN.calories,
                  protein: Math.round(planN.protein),
                })}
              </Text>
            </View>
          )}

          {/* UX-REC-02: the table is the user's portion plus each member, spelled out. */}
          {scaledMembers !== null && (
            <Text testID="recipe-table-breakdown" className="text-caption text-label-secondary">
              {t('recipes.screen.sizedForTable', {
                table: tableBreakdown(planPortion, scaledMembers) ?? '',
              })}
            </Text>
          )}

          {/* Macros — no Fiber (D-18); hidden entirely when nothing was added. */}
          {nutritionAdded && (
            <View className="flex-row gap-2">
              {(
                [
                  ['protein', n.protein],
                  ['carbs', n.carbs],
                  ['fat', n.fat],
                ] as const
              ).map(([kind, value]) => (
                <View
                  key={kind}
                  className="flex-1 items-center rounded-card bg-surface-sunken py-2"
                >
                  <Text className="text-caption text-label-secondary">
                    {t(`recipes.macros.${kind}`)}
                  </Text>
                  <Text className="text-callout font-semibold text-label">{value}g</Text>
                </View>
              ))}
            </View>
          )}

          {/* Ingredients + servings adjuster */}
          <BoardCard testID="recipe-ingredients">
            <View className="flex-row items-center justify-between gap-2">
              <SectionTitle>{t('recipes.detail.ingredients')}</SectionTitle>
              <View className="flex-row items-center rounded-full border border-separator">
                <IconButton
                  accessibilityLabel={t('recipes.detail.decreaseServings')}
                  icon={<Icon name="remove" color={colors.brand} size={20} />}
                  onPress={() => setServings(clampCookServings(selectedServings - 1))}
                />
                <Text
                  testID="recipe-servings-count"
                  className="min-w-[32px] text-center text-callout font-semibold text-label"
                >
                  {formatFractionalQuantity(selectedServings)}
                </Text>
                <IconButton
                  accessibilityLabel={t('recipes.detail.increaseServings')}
                  icon={<Icon name="add" color={colors.brand} size={20} />}
                  onPress={() => setServings(clampCookServings(selectedServings + 1))}
                />
              </View>
            </View>
            {/* UX-REC-11: say what the stepper changed, with the totals. */}
            {selectedServings !== recipe.servings ? (
              <Text testID="recipe-servings-note" className="text-caption text-label-secondary">
                {nutritionAdded
                  ? t('recipes.detail.servingsNoteTotals', {
                      servings: formatFractionalQuantity(selectedServings),
                      base: recipe.servings,
                      kcal: Math.round(totalN.calories),
                      protein: Math.round(totalN.protein),
                    })
                  : t('recipes.detail.servingsNote', {
                      servings: formatFractionalQuantity(selectedServings),
                      base: recipe.servings,
                    })}
              </Text>
            ) : null}
            <View className="gap-2">
              {recipe.ingredients.map((ing, i) => (
                <View key={i} className="flex-row items-baseline gap-2">
                  <Text className="shrink-0 text-body font-semibold text-label">
                    {formatScaledQuantity(ing.quantity, ing.unit, scale, unitSystem)}
                  </Text>
                  <Text className="min-w-0 flex-1 text-body text-label-secondary">{ing.name}</Text>
                </View>
              ))}
            </View>
          </BoardCard>

          {/* Instructions — D10/UX-40: no steps is a valid recipe, not an
            error; the card reads "No steps yet" instead of rendering empty. */}
          <BoardCard testID="recipe-instructions">
            <SectionTitle>{t('recipes.detail.instructions')}</SectionTitle>
            {recipe.instructions.length > 0 ? (
              <View className="gap-4">
                {recipe.instructions.map((step, i) => (
                  <View key={i} className="flex-row gap-3">
                    <View className="h-7 w-7 items-center justify-center rounded-full bg-brand">
                      <Text className="text-caption font-bold text-brand-on">{i + 1}</Text>
                    </View>
                    <Text className="min-w-0 flex-1 text-body text-label">{step}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text testID="recipe-no-steps" className="text-body text-label-secondary">
                {t('recipes.screen.noSteps')}
              </Text>
            )}
          </BoardCard>

          {/* Nutrition facts. bug B-22: the label used to read "per {recipe.
            servings} servings" while sitting right under a stepper that
            changes the SELECTED servings — easy to misread as already
            scaled. The label is fixed; a separate line states the total
            for what's actually selected. */}
          <BoardCard testID="recipe-nutrition-facts">
            <View className="flex-row items-baseline gap-2">
              <SectionTitle>{t('recipes.nutrition.title')}</SectionTitle>
              <Text className="text-subhead text-label-secondary">
                {t('recipes.nutrition.perServing')}
              </Text>
            </View>
            {nutritionAdded ? (
              <>
                <View className="flex-row flex-wrap">
                  {(
                    [
                      ['calories', t('recipes.card.kcal', { value: n.calories })],
                      ['protein', `${n.protein}g`],
                      ['carbs', `${n.carbs}g`],
                      ['fat', `${n.fat}g`],
                    ] as const
                  ).map(([kind, value]) => (
                    <View key={kind} className="w-1/2 flex-row justify-between py-1 pr-4">
                      <Text className="text-subhead text-label-secondary">
                        {kind === 'calories'
                          ? t('recipes.detail.calories')
                          : t(`recipes.macros.${kind}`)}
                      </Text>
                      <Text className="text-subhead font-semibold text-label">{value}</Text>
                    </View>
                  ))}
                </View>
                {selectedServings !== recipe.servings && (
                  <Text
                    testID="recipe-nutrition-scaled"
                    className="text-caption text-label-secondary"
                  >
                    {t('recipes.screen.scaledFor', {
                      servings: formatFractionalQuantity(selectedServings),
                      kcal: Math.round(n.calories * selectedServings),
                    })}
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
              <Text testID="recipe-nutrition-not-added" className="text-body text-label-secondary">
                {t('recipes.screen.nutritionNotAdded')}
              </Text>
            )}
          </BoardCard>

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
        {/* ListSection draws one row per child element: no fragments here. */}
        <ListSection>
          {recipe.deleted ? null : (
            <ListRow
              testID="recipe-overflow-week"
              icon={<MenuIcon name="calendar" />}
              title={FRIENDS_COPY.recipe.addToWeek}
              accessory="none"
              onPress={() => chooseOverflow('week')}
            />
          )}
          <ListRow
            testID="recipe-overflow-shopping"
            icon={<MenuIcon name="cart" />}
            title={t('recipes.screen.addToShoppingList')}
            accessory="none"
            onPress={() => chooseOverflow('shopping')}
          />
          <ListRow
            testID="recipe-overflow-share"
            icon={<MenuIcon name="share" />}
            title={t('recipes.detail.share')}
            accessory="none"
            onPress={() => chooseOverflow('share')}
          />
          {isOwner ? (
            <ListRow
              testID="recipe-overflow-edit"
              icon={<MenuIcon name="edit" />}
              title={t('common.actions.edit')}
              accessory="none"
              onPress={() => chooseOverflow('edit')}
            />
          ) : null}
          {isOwner ? (
            <ListRow
              testID="recipe-overflow-duplicate"
              icon={<MenuIcon name="copy" />}
              title={t('recipes.detail.duplicate')}
              accessory="none"
              onPress={() => chooseOverflow('duplicate')}
            />
          ) : null}
          <ListRow
            testID="recipe-overflow-safety"
            icon={<MenuIcon name="shield" />}
            title={t('recipes.detail.reportLabel')}
            accessory="none"
            onPress={() => chooseOverflow('safety')}
          />
          {creator ? (
            <ListRow
              testID="recipe-overflow-report"
              icon={<MenuIcon ionicon="flag-outline" />}
              title={FRIENDS_COPY.recipe.report}
              accessory="none"
              onPress={() => chooseOverflow('report')}
            />
          ) : null}
          {isOwner ? (
            <ListRow
              testID="recipe-overflow-delete"
              icon={<MenuIcon name="trash" destructive />}
              title={t('common.actions.delete')}
              destructive
              onPress={() => chooseOverflow('delete')}
            />
          ) : null}
        </ListSection>
      </Sheet>
      <ConfirmSheet
        testID="recipe-delete-confirm"
        visible={deleteOpen}
        onClose={() => {
          if (!deleteMine.isPending) setDeleteOpen(false);
        }}
        title={t('recipes.detail.deleteTitle')}
        body={t('recipes.detail.deleteBody', { name: recipe.name })}
        confirmLabel={t('common.actions.delete')}
        cancelLabel={t('recipes.detail.keepIt')}
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
