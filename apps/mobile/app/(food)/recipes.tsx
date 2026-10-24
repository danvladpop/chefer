import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import {
  Button,
  Chip,
  ErrorState,
  Screen,
  SEARCH_LIST_PROPS,
  SearchField,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { NutritionStatusTag } from '../../src/features/ingredients/nutrition-provenance';
import { recipeCardMeta } from '../../src/features/recipes/recipe-actions';
import { RecipeImage } from '../../src/features/recipes/recipe-image';
import { FilteredForLine } from '../../src/features/safety/filtered-for-line';
import { WhatWeCheckSheet } from '../../src/features/safety/what-we-check-sheet';
import { useT } from '../../src/lib/i18n';
import type { RecipeImageStatus } from '../../src/lib/recipe-image';
import { trpc } from '../../src/lib/trpc';

// Cookbook tab (was Recipes) — port of apps/web (dashboard)/recipes/page.tsx
// (M2-3, P2-8). Discover browses the curated collection, safety-filtered for
// the user and their household (recipe.discover), with meal-type and time
// filters — the old tab only listed past-plan recipes (F-REC-1-4).

// UX-REC-05: the cookbook pages with `useInfiniteQuery` over the API's cursor
// (the id of the last row), and each tab says what it holds — "Mine" is what
// you wrote or imported, so the AI dishes your plans made live under "All".
//
// UX-REC-13: a card is a compact row (a 112 pt thumbnail beside the text),
// not a 395 pt tower, and carries its source or date so duplicates can be
// told apart. UX-REC-10: a failed thumbnail becomes a placeholder.

type Tab = 'all' | 'saved' | 'my' | 'discover';

const PAGE_SIZE = 30;

const TABS = ['all', 'saved', 'my', 'discover'] as const;

type MealFilter = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_FILTERS: (MealFilter | null)[] = [null, 'breakfast', 'lunch', 'dinner', 'snack'];
const QUICK_MINS = 30;

/** The fields a card needs — shared by recipe.list and recipe.discover rows. */
interface CardRecipe {
  id: string;
  name: string;
  imageUrl: string | null;
  /** F3: a null image is "preparing" while PENDING/GENERATING. */
  imageStatus?: RecipeImageStatus;
  cuisineType: string;
  prepTimeMins: number;
  cookTimeMins: number;
  nutritionInfo: unknown;
  /** plan-ingredient-catalog §10: PARTIAL / USER_ENTERED get a caveat next to the kcal. */
  nutritionStatus?: unknown;
  isFavourite: boolean;
  /** Following (UX §9.4): a hearted recipe of someone I follow (`recipe.list` only). */
  creator?: { firstName: string };
  /** Following: my copy of someone's recipe (`recipe.list` only). */
  origin?: { creatorFirstName: string | null };
  /** `recipe.list` rows: when it was added and where it was imported from. */
  createdAt?: Date | string;
  sourceUrl?: string | null;
}

/** `From {first}` for another person's recipe or my copy of one; null otherwise. */
function fromChipLabel(recipe: Pick<CardRecipe, 'creator' | 'origin'>): string | null {
  if (recipe.creator) return FRIENDS_COPY.recipe.from(recipe.creator.firstName);
  if (recipe.origin) {
    return recipe.origin.creatorFirstName
      ? FRIENDS_COPY.recipe.from(recipe.origin.creatorFirstName)
      : FRIENDS_COPY.recipe.fromGone;
  }
  return null;
}

export default function RecipesScreen() {
  const colors = useThemeColors();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mealFilter, setMealFilter] = useState<MealFilter | null>(null);
  const [quickOnly, setQuickOnly] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    // UX-X-17: the clear × (and an emptied field) shows the full list at once.
    if (value === '') {
      setDebouncedSearch('');
      return;
    }
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  // bug B-12: a search typed on one tab silently kept filtering the next
  // tab — "All" could show 0 results because Discover's old search term was
  // still applied. Switching tabs always starts that tab's own search.
  const changeTab = (next: Tab) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setTab(next);
    setSearch('');
    setDebouncedSearch('');
  };

  const listInput = {
    search: debouncedSearch || undefined,
    savedOnly: tab === 'saved',
    myRecipesOnly: tab === 'my',
    limit: PAGE_SIZE,
  };
  const list = trpc.recipe.list.useInfiniteQuery(listInput, {
    enabled: tab !== 'discover',
    // The API's cursor is the id of the last row of the page; a short page is the last.
    getNextPageParam: (lastPage) =>
      lastPage.length >= PAGE_SIZE ? lastPage.at(-1)?.id : undefined,
  });
  const discover = trpc.recipe.discover.useQuery(
    {
      search: debouncedSearch || undefined,
      mealType: mealFilter ?? undefined,
      maxTotalMins: quickOnly ? QUICK_MINS : undefined,
    },
    { enabled: tab === 'discover', staleTime: 60_000 },
  );
  const listRows = list.data?.pages.flat();
  const recipes: CardRecipe[] | undefined = tab === 'discover' ? discover.data : listRows;
  const { isLoading, isError, refetch } = tab === 'discover' ? discover : list;

  // T-02.5/T-01.4: Discover says what it filtered — a separate, additive
  // query so the array `discover` itself returns is unaffected.
  const discoverMeta = trpc.recipe.discoverHiddenCount.useQuery(
    {
      search: debouncedSearch || undefined,
      mealType: mealFilter ?? undefined,
      maxTotalMins: quickOnly ? QUICK_MINS : undefined,
    },
    { enabled: tab === 'discover', staleTime: 60_000 },
  );
  const { data: table } = trpc.safety.getTable.useQuery();
  const [whatWeCheckOpen, setWhatWeCheckOpen] = useState(false);

  const utils = trpc.useUtils();
  const toggleFav = trpc.recipe.toggleFavourite.useMutation({
    // Optimistic: flip the heart immediately, reconcile after (same as web).
    onMutate: async ({ recipeId }) => {
      await utils.recipe.list.cancel(listInput);
      const previous = utils.recipe.list.getInfiniteData(listInput);
      utils.recipe.list.setInfiniteData(listInput, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) =>
                page.map((r) => (r.id === recipeId ? { ...r, isFavourite: !r.isFavourite } : r)),
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        utils.recipe.list.setInfiniteData(listInput, context.previous);
      }
    },
    onSettled: () => {
      void utils.recipe.list.invalidate();
      void utils.recipe.discover.invalidate();
    },
  });

  return (
    <Screen className="px-0">
      <View className="gap-3 px-4 pb-2 pt-4">
        <ModeSwitch />
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-xs font-semibold uppercase tracking-widest text-label-tertiary">
              {t('recipes.list.eyebrow')}
            </Text>
            <Text testID="recipes-title" variant="title">
              {t('recipes.list.title')}
            </Text>
          </View>
          <View className="flex-row gap-2">
            {/* Import (F5) — visible on every tier: free gets the preview */}
            <Pressable
              testID="recipes-import"
              accessibilityRole="button"
              onPress={() => router.push('/import-recipe')}
              className="min-h-11 flex-row items-center gap-1.5 rounded-xl border border-primary/30 px-3"
            >
              <Ionicons name="link-outline" size={16} color={colors.brand} />
              <Text className="text-sm font-semibold text-primary">{t('recipes.list.import')}</Text>
            </Pressable>
            <Pressable
              testID="recipes-new"
              accessibilityRole="button"
              onPress={() => router.push('/recipe-form')}
              className="min-h-11 flex-row items-center gap-1.5 rounded-xl bg-primary px-3"
            >
              <Ionicons name="add" size={16} color="white" />
              <Text className="text-sm font-semibold text-primary-foreground">
                {t('recipes.list.newShort')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Tabs */}
        <View className="flex-row border-b border-border">
          {TABS.map((key) => (
            <Pressable
              key={key}
              testID={`recipes-tab-${key}`}
              accessibilityRole="button"
              onPress={() => changeTab(key)}
              className={cn(
                'min-h-11 justify-center px-3',
                tab === key && 'border-b-2 border-primary',
              )}
            >
              <Text
                className={cn(
                  'text-sm font-medium',
                  tab === key ? 'text-primary' : 'text-label-tertiary',
                )}
              >
                {t(`recipes.cookbook.tabs.${key}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text testID="recipes-tab-caption" variant="muted" className="text-xs">
          {t(`recipes.list.captions.${tab}`)}
        </Text>

        {/* Search */}
        <SearchField
          testID="recipes-search"
          accessibilityLabel={
            tab === 'discover'
              ? t('recipes.cookbook.searchDiscover')
              : t('recipes.list.searchLabel')
          }
          value={search}
          onChangeText={handleSearch}
          placeholder={
            tab === 'discover'
              ? t('recipes.list.searchDiscoverPlaceholder')
              : t('recipes.list.searchPlaceholder')
          }
        />

        {/* Discover filters */}
        {tab === 'discover' && (
          <ScrollView
            testID="discover-filters"
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {MEAL_FILTERS.map((key) => (
              <Chip
                key={key ?? 'any'}
                label={t(`recipes.list.mealFilters.${key ?? 'any'}`)}
                selected={mealFilter === key}
                onPress={() => setMealFilter(key)}
                testID={`discover-meal-${key ?? 'any'}`}
              />
            ))}
            <Chip
              label={t('recipes.list.quickFilter', { mins: QUICK_MINS })}
              selected={quickOnly}
              onPress={() => setQuickOnly((q) => !q)}
              testID="discover-quick"
            />
          </ScrollView>
        )}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : isError && !recipes ? (
        <ErrorState
          title={t('recipes.list.loadError')}
          icon={<Ionicons name="cloud-offline-outline" size={40} color={colors.labelTertiary} />}
          onRetry={() => void refetch()}
        />
      ) : !recipes || recipes.length === 0 ? (
        <EmptyState
          tab={tab}
          searching={debouncedSearch.trim().length > 0}
          filtered={mealFilter !== null || quickOnly}
          hidden={tab === 'discover' ? discoverMeta.data : undefined}
          onShowRules={() => setWhatWeCheckOpen(true)}
          onDiscover={() => changeTab('discover')}
        />
      ) : (
        <FlatList
          {...SEARCH_LIST_PROPS}
          testID="recipes-list"
          data={recipes}
          keyExtractor={(r) => r.id}
          contentContainerClassName="gap-3 px-4 py-3"
          ListHeaderComponent={
            tab === 'discover' && discoverMeta.data && discoverMeta.data.hiddenCount > 0 ? (
              <FilteredForLine
                testID="discover-filtered-for"
                filters={discoverMeta.data.filteredFor.join(' + ')}
                hiddenCount={discoverMeta.data.hiddenCount}
                onPress={() => setWhatWeCheckOpen(true)}
              />
            ) : null
          }
          onEndReached={() => {
            if (tab !== 'discover' && list.hasNextPage && !list.isFetchingNextPage) {
              void list.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            tab !== 'discover' && list.isFetchingNextPage ? (
              <View testID="recipes-loading-more" className="items-center py-4">
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : tab !== 'discover' && list.isError && list.hasNextPage ? (
              <Button
                testID="recipes-load-more-retry"
                variant="outline"
                onPress={() => void list.fetchNextPage()}
              >
                {t('recipes.cookbook.loadMoreError')}
              </Button>
            ) : null
          }
          renderItem={({ item: recipe }) => {
            const fromLabel = fromChipLabel(recipe);
            const meta = recipeCardMeta(recipe);
            const n = recipe.nutritionInfo as {
              calories: number;
              protein: number;
              carbs: number;
              fat: number;
            };
            return (
              <Pressable
                testID={`recipe-card-${recipe.id}`}
                accessibilityRole="button"
                accessibilityLabel={recipe.name}
                onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
                className="min-h-28 flex-row overflow-hidden rounded-2xl border border-border bg-card"
              >
                <RecipeImage
                  testID={`recipe-card-${recipe.id}-image`}
                  imageUrl={recipe.imageUrl}
                  imageStatus={recipe.imageStatus}
                  className="h-28 w-28"
                />
                <View className="min-w-0 flex-1 gap-1 py-2.5 pl-3 pr-14">
                  <View className="flex-row flex-wrap gap-1.5">
                    <View className="self-start rounded-full bg-accent px-2 py-0.5">
                      <Text
                        numberOfLines={1}
                        className="text-xs font-medium uppercase tracking-wide text-primary"
                      >
                        {recipe.cuisineType}
                      </Text>
                    </View>
                    {fromLabel ? (
                      <View
                        testID={`recipe-card-${recipe.id}-from`}
                        className="self-start rounded-full bg-surface-sunken px-2 py-0.5"
                      >
                        <Text className="text-xs text-label-secondary">{fromLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text numberOfLines={2} className="font-semibold text-label">
                    {recipe.name}
                  </Text>
                  <View className="flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="time-outline" size={12} color={colors.labelSecondary} />
                      <Text className="text-xs text-label-tertiary">
                        {t('recipes.card.minutesShort', {
                          mins: recipe.prepTimeMins + recipe.cookTimeMins,
                        })}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="flame-outline" size={12} color={colors.brand} />
                      <Text className="text-xs text-label-tertiary">
                        {t('recipes.card.kcal', { value: n.calories })}
                      </Text>
                      <NutritionStatusTag
                        status={recipe.nutritionStatus}
                        testID={`recipe-card-status-${recipe.id}`}
                      />
                    </View>
                    <Text className="text-xs text-label-tertiary">
                      {[
                        t('recipes.card.protein', { value: n.protein }),
                        t('recipes.card.carbs', { value: n.carbs }),
                        t('recipes.card.fat', { value: n.fat }),
                      ].join(' · ')}
                    </Text>
                  </View>
                  {meta ? (
                    <Text
                      testID={`recipe-card-${recipe.id}-meta`}
                      numberOfLines={1}
                      className="text-xs text-label-tertiary"
                    >
                      {meta}
                    </Text>
                  ) : null}
                </View>
                <View className="absolute right-1 top-1 gap-0.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      recipe.isFavourite
                        ? t('recipes.list.unfavourite')
                        : t('recipes.list.favourite')
                    }
                    onPress={() => toggleFav.mutate({ recipeId: recipe.id })}
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Ionicons
                      name={recipe.isFavourite ? 'heart' : 'heart-outline'}
                      size={22}
                      color={recipe.isFavourite ? colors.brand : colors.labelTertiary}
                    />
                  </Pressable>
                  {tab === 'my' && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('recipes.list.editRecipe')}
                      onPress={() =>
                        router.push({ pathname: '/recipe-form', params: { id: recipe.id } })
                      }
                      className="h-11 w-11 items-center justify-center"
                    >
                      <Ionicons name="pencil" size={18} color={colors.brand} />
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
      {table ? (
        <WhatWeCheckSheet
          visible={whatWeCheckOpen}
          onClose={() => setWhatWeCheckOpen(false)}
          table={table}
        />
      ) : null}
    </Screen>
  );
}

/**
 * bug B-12: a no-match SEARCH used to show the same first-run empty state
 * as a genuinely empty tab ("No custom recipes yet" on a search with zero
 * hits reads as "you have no recipes", not "nothing matched"). `searching`
 * switches every tab to a shared no-match message when a search is active.
 * The "arrives on mobile soon" line is also gone — recipe creation (T-40)
 * has shipped on mobile since this PR.
 */
function EmptyState({
  tab,
  searching,
  filtered,
  hidden,
  onShowRules,
  onDiscover,
}: {
  tab: Tab;
  searching: boolean;
  /** A Discover meal / time filter is on. */
  filtered: boolean;
  /** Discover's hidden-by-safety count and active rule labels. */
  hidden?: { hiddenCount: number; filteredFor: string[] } | undefined;
  onShowRules: () => void;
  onDiscover: () => void;
}) {
  const colors = useThemeColors();
  const { t } = useT();
  // UX-REC-09: with no search or filter set, an empty Discover means the
  // diet filters removed everything — say so, with a way to the settings.
  if (tab === 'discover' && !searching && !filtered && hidden && hidden.hiddenCount > 0) {
    return (
      <View
        testID="recipes-empty"
        className="mx-4 items-center gap-2 rounded-2xl border border-dashed border-border bg-surface-sunken px-4 py-12"
      >
        <Ionicons name="compass-outline" size={40} color="#d1d5db" />
        <Text className="font-medium text-label-secondary">
          {t('recipes.list.empty.dietHidesTitle')}
        </Text>
        <FilteredForLine
          testID="discover-empty-filtered-for"
          filters={hidden.filteredFor.join(' + ')}
          hiddenCount={hidden.hiddenCount}
          onPress={onShowRules}
        />
        <Button
          testID="discover-empty-diets"
          variant="outline"
          onPress={() => router.push('/preferences')}
        >
          {t('recipes.list.empty.dietHidesAction')}
        </Button>
      </View>
    );
  }

  if (searching) {
    return (
      <View
        testID="recipes-empty"
        className="mx-4 items-center rounded-2xl border border-dashed border-border bg-surface-sunken py-16"
      >
        <Ionicons name="search-outline" size={40} color="#d1d5db" />
        <Text className="mt-3 font-medium text-label-secondary">
          {t('recipes.cookbook.noMatches')}
        </Text>
        <Text variant="muted" className="mt-1 px-6 text-center text-sm">
          {tab === 'discover'
            ? t('recipes.cookbook.tryAnotherWordFilters')
            : t('recipes.cookbook.tryAnotherWord')}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID="recipes-empty"
      className="mx-4 items-center rounded-2xl border border-dashed border-border bg-surface-sunken py-16"
    >
      {tab === 'discover' ? (
        <>
          <Ionicons name="compass-outline" size={40} color="#d1d5db" />
          <Text className="mt-3 font-medium text-label-secondary">
            {t('recipes.list.empty.discoverTitle')}
          </Text>
          <Text variant="muted" className="mt-1 px-6 text-center text-sm">
            {filtered
              ? t('recipes.cookbook.tryClearingFilters')
              : t('recipes.list.empty.discoverBody')}
          </Text>
        </>
      ) : tab === 'saved' ? (
        <>
          <Ionicons name="heart-outline" size={40} color="#d1d5db" />
          <Text className="mt-3 font-medium text-label-secondary">
            {t('recipes.list.empty.savedTitle')}
          </Text>
          <Text variant="muted" className="mt-1 px-6 text-center text-sm">
            {t('recipes.list.empty.savedBody')}
          </Text>
        </>
      ) : tab === 'my' ? (
        <>
          <Text className="text-4xl">✎</Text>
          <Text className="mt-3 font-medium text-label-secondary">
            {t('recipes.list.empty.myTitle')}
          </Text>
          <Text variant="muted" className="mb-4 mt-1 px-6 text-center text-sm">
            {t('recipes.cookbook.myBodyTab')}
          </Text>
          <Button testID="recipes-empty-create" onPress={() => router.push('/recipe-form')}>
            {t('recipes.cookbook.createRecipe')}
          </Button>
        </>
      ) : (
        <>
          <Text className="text-4xl">📖</Text>
          <Text className="mt-3 font-medium text-label-secondary">
            {t('recipes.list.empty.allTitle')}
          </Text>
          <Text variant="muted" className="mb-4 mt-1 px-6 text-center text-sm">
            {t('recipes.list.empty.allBody')}
          </Text>
          <View className="gap-2">
            <Button testID="recipes-browse-discover" onPress={onDiscover}>
              {t('recipes.list.empty.browseDiscover')}
            </Button>
            <Link href="/meal-plan" asChild>
              <Button variant="outline">{t('recipes.list.empty.goToPlanner')}</Button>
            </Link>
          </View>
        </>
      )}
    </View>
  );
}
