import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import {
  Button,
  Chip,
  ErrorState,
  haptics,
  IconButton,
  MediaTile,
  PressableScale,
  Screen,
  SEARCH_LIST_PROPS,
  SearchField,
  SegmentedControl,
  Text,
  TileGrid,
  useThemeColors,
} from '@chefer/ui-mobile';
import { formatKcal } from '@chefer/utils';
import { Icon, type IconName } from '../../../components/icon';
import { getTranslator, useT } from '../../../lib/i18n';
import { getRecipeImageUrl } from '../../../lib/recipe-image';
import { trpc } from '../../../lib/trpc';
import { nutritionStatusBadge } from '../../ingredients/nutrition-provenance';
import { FilteredForLine } from '../../safety/filtered-for-line';
import { WhatWeCheckSheet } from '../../safety/what-we-check-sheet';
import { ShellTopBar } from '../shell-chrome';

// ─── Cookbook (10 Oct redesign, board "Cookbook") ──────────────────────────
// The old Cookbook tab (`app/(food)/recipes.tsx`) as photo tiles, the same
// grid Meals and the routine days use. Same data: `recipe.list` paged with
// `useInfiniteQuery` (All / Saved / Mine), `recipe.discover` for Discover with
// its meal and time filters and the "filtered for your table" line, the
// optimistic heart (`recipe.toggleFavourite`) and the "From Ana" source.
// Editing your own recipe lives on its detail screen (Edit), so a tile keeps
// one action: the heart.

type Tab = 'all' | 'saved' | 'my' | 'discover';

const PAGE_SIZE = 30;

const TAB_VALUES = ['all', 'saved', 'my', 'discover'] as const;

type MealFilter = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_FILTERS: (MealFilter | null)[] = [null, 'breakfast', 'lunch', 'dinner', 'snack'];
const QUICK_MINS = 30;

/** The fields a tile needs — shared by recipe.list and recipe.discover rows. */
export interface CookbookRecipe {
  id: string;
  name: string;
  imageUrl: string | null;
  prepTimeMins: number;
  cookTimeMins: number;
  nutritionInfo: unknown;
  nutritionStatus?: unknown;
  isFavourite: boolean;
  creator?: { firstName: string };
  origin?: { creatorFirstName: string | null };
}

/** `From {first}` for another person's recipe or my copy of one; null otherwise. */
export function cookbookFromLabel(
  recipe: Pick<CookbookRecipe, 'creator' | 'origin'>,
): string | null {
  if (recipe.creator) return FRIENDS_COPY.recipe.from(recipe.creator.firstName);
  if (recipe.origin) {
    return recipe.origin.creatorFirstName
      ? FRIENDS_COPY.recipe.from(recipe.origin.creatorFirstName)
      : FRIENDS_COPY.recipe.fromGone;
  }
  return null;
}

/** "30 min · 520 kcal", plus the nutrition caveat ("Partial data") when there is one. */
export function cookbookTileMeta(recipe: CookbookRecipe): string {
  const minutes = Math.max(0, Math.round(recipe.prepTimeMins + recipe.cookTimeMins));
  const kcal = (recipe.nutritionInfo as { calories?: number } | null)?.calories;
  const caveat = nutritionStatusBadge(recipe.nutritionStatus);
  const { t } = getTranslator();
  return [
    t('recipes.detail.minutes', { mins: minutes }),
    kcal !== undefined ? t('recipes.card.kcal', { value: formatKcal(kcal) }) : null,
    caveat,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Pairs for the two-column grid (a FlatList row = one TileGrid row). */
function pairs<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

function HeaderButton({
  testID,
  label,
  icon,
  tone,
  onPress,
}: {
  testID: string;
  label: string;
  icon: IconName;
  tone: 'primary' | 'tinted';
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    // MO-01: press feedback through PressableScale.
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      className={
        tone === 'primary'
          ? 'min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-control bg-brand px-3'
          : 'min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-control bg-brand-tint px-3'
      }
    >
      <Icon name={icon} color={tone === 'primary' ? colors.onBrand : colors.brand} size={20} />
      <Text
        className={
          tone === 'primary'
            ? 'text-callout font-semibold text-brand-on'
            : 'text-callout font-semibold text-brand'
        }
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export function CookbookScreen() {
  const { t } = useT();
  const colors = useThemeColors();
  const tabs = TAB_VALUES.map((value) => ({
    value,
    label: t(`recipes.cookbook.tabs.${value}`),
    testID: `cookbook-tab-${value}`,
  }));
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mealFilter, setMealFilter] = useState<MealFilter | null>(null);
  const [quickOnly, setQuickOnly] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // UX-X-17: the clear × (and an emptied field) shows the full list at once.
    if (value === '') {
      setDebouncedSearch('');
      return;
    }
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  // bug B-12: a tab switch starts that tab's own search.
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
  const discoverInput = {
    search: debouncedSearch || undefined,
    mealType: mealFilter ?? undefined,
    maxTotalMins: quickOnly ? QUICK_MINS : undefined,
  };
  const discover = trpc.recipe.discover.useQuery(discoverInput, {
    enabled: tab === 'discover',
    staleTime: 60_000,
  });
  const recipes: CookbookRecipe[] | undefined =
    tab === 'discover' ? discover.data : list.data?.pages.flat();
  const { isLoading, isError, refetch } = tab === 'discover' ? discover : list;
  // T-02.5/T-01.4: Discover says what it filtered.
  const discoverMeta = trpc.recipe.discoverHiddenCount.useQuery(discoverInput, {
    enabled: tab === 'discover',
    staleTime: 60_000,
  });
  const { data: table } = trpc.safety.getTable.useQuery();
  const [whatWeCheckOpen, setWhatWeCheckOpen] = useState(false);

  const utils = trpc.useUtils();
  const toggleFav = trpc.recipe.toggleFavourite.useMutation({
    // Optimistic: flip the heart immediately, reconcile after (same as the old tab).
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
      if (context?.previous) utils.recipe.list.setInfiniteData(listInput, context.previous);
    },
    onSettled: () => {
      void utils.recipe.list.invalidate();
      void utils.recipe.discover.invalidate();
    },
  });

  const tile = (recipe: CookbookRecipe) => {
    const from = cookbookFromLabel(recipe);
    return (
      <MediaTile
        key={recipe.id}
        testID={`cookbook-tile-${recipe.id}`}
        title={recipe.name}
        meta={cookbookTileMeta(recipe)}
        imageUri={getRecipeImageUrl(recipe.imageUrl)}
        illustration={<Icon name="recipes" color={colors.brand} size={32} />}
        {...(from ? { badge: from } : {})}
        accessibilityHint={t('recipes.cookbook.opensRecipe')}
        onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
        action={
          <IconButton
            testID={`cookbook-heart-${recipe.id}`}
            accessibilityLabel={
              recipe.isFavourite ? t('recipes.list.unfavourite') : t('recipes.list.favourite')
            }
            className="bg-surface"
            icon={
              <Icon name={recipe.isFavourite ? 'heart' : 'heartOutline'} color={colors.brand} />
            }
            onPress={() => toggleFav.mutate({ recipeId: recipe.id })}
          />
        }
      />
    );
  };

  const searching = debouncedSearch.trim().length > 0;
  const filtered = mealFilter !== null || quickOnly;
  const hidden = tab === 'discover' ? discoverMeta.data : undefined;

  return (
    <Screen className="bg-canvas px-0">
      <ShellTopBar className="mx-4 mt-3" />
      <View className="gap-3 px-4 pb-2 pt-3">
        <View className="flex-row gap-2.5">
          <HeaderButton
            testID="cookbook-new"
            label={t('recipes.cookbook.newRecipe')}
            icon="add"
            tone="primary"
            onPress={() => router.push('/recipe-form')}
          />
          {/* Import (F5) — every tier: free gets the preview. */}
          <HeaderButton
            testID="cookbook-import"
            label={t('recipes.list.import')}
            icon="link"
            tone="tinted"
            onPress={() => router.push('/import-recipe')}
          />
        </View>
        <SearchField
          testID="cookbook-search"
          accessibilityLabel={
            tab === 'discover'
              ? t('recipes.cookbook.searchDiscover')
              : t('recipes.list.searchLabel')
          }
          value={search}
          onChangeText={handleSearch}
          placeholder={
            tab === 'discover'
              ? t('recipes.cookbook.searchDiscover')
              : t('recipes.list.searchLabel')
          }
        />
        <SegmentedControl
          testID="cookbook-tabs"
          accessibilityLabel={t('recipes.cookbook.tabsLabel')}
          options={tabs}
          value={tab}
          onChange={changeTab}
        />
        {tab === 'discover' ? (
          <ScrollView
            testID="cookbook-discover-filters"
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
                testID={`cookbook-meal-${key ?? 'any'}`}
              />
            ))}
            <Chip
              label={t('recipes.list.quickFilter', { mins: QUICK_MINS })}
              selected={quickOnly}
              onPress={() => setQuickOnly((q) => !q)}
              testID="cookbook-quick"
            />
          </ScrollView>
        ) : null}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : isError && !recipes ? (
        <ErrorState title={t('recipes.list.loadError')} onRetry={() => void refetch()} />
      ) : !recipes || recipes.length === 0 ? (
        <View
          testID="cookbook-empty"
          className="mx-4 items-center gap-2 rounded-card border border-separator bg-surface px-4 py-10"
        >
          {tab === 'discover' && !searching && !filtered && hidden && hidden.hiddenCount > 0 ? (
            // UX-REC-09: the diet filters removed everything — say so.
            <>
              <Text className="text-center text-headline text-label">
                {t('recipes.list.empty.dietHidesTitle')}
              </Text>
              <FilteredForLine
                testID="cookbook-empty-filtered-for"
                filters={hidden.filteredFor.join(' + ')}
                hiddenCount={hidden.hiddenCount}
                onPress={() => setWhatWeCheckOpen(true)}
              />
              <Button variant="outline" onPress={() => router.push('/preferences?section=safety')}>
                {t('recipes.list.empty.dietHidesAction')}
              </Button>
            </>
          ) : searching ? (
            <>
              <Text className="text-center text-headline text-label">
                {t('recipes.cookbook.noMatches')}
              </Text>
              <Text className="text-center text-subhead text-label-secondary">
                {tab === 'discover'
                  ? t('recipes.cookbook.tryAnotherWordFilters')
                  : t('recipes.cookbook.tryAnotherWord')}
              </Text>
            </>
          ) : tab === 'discover' ? (
            <>
              <Text className="text-center text-headline text-label">
                {t('recipes.list.empty.discoverTitle')}
              </Text>
              <Text className="text-center text-subhead text-label-secondary">
                {filtered
                  ? t('recipes.cookbook.tryClearingFilters')
                  : t('recipes.cookbook.checkBackSoon')}
              </Text>
            </>
          ) : tab === 'saved' ? (
            <>
              <Text className="text-center text-headline text-label">
                {t('recipes.list.empty.savedTitle')}
              </Text>
              <Text className="text-center text-subhead text-label-secondary">
                {t('recipes.cookbook.savedBody')}
              </Text>
            </>
          ) : tab === 'my' ? (
            <>
              <Text className="text-center text-headline text-label">
                {t('recipes.cookbook.myTitle')}
              </Text>
              <Text className="text-center text-subhead text-label-secondary">
                {t('recipes.cookbook.myBody')}
              </Text>
              <Button testID="cookbook-empty-create" onPress={() => router.push('/recipe-form')}>
                {t('recipes.cookbook.createRecipe')}
              </Button>
            </>
          ) : (
            <>
              <Text className="text-center text-headline text-label">
                {t('recipes.list.empty.allTitle')}
              </Text>
              <Text className="text-center text-subhead text-label-secondary">
                {t('recipes.list.empty.allBody')}
              </Text>
              <Button testID="cookbook-browse-discover" onPress={() => changeTab('discover')}>
                {t('recipes.list.empty.browseDiscover')}
              </Button>
            </>
          )}
        </View>
      ) : (
        <FlatList
          {...SEARCH_LIST_PROPS}
          testID="cookbook-list"
          data={pairs(recipes)}
          keyExtractor={(row) => row.map((r) => r.id).join('|')}
          contentContainerClassName="gap-2.5 px-4 pb-8 pt-1"
          ListHeaderComponent={
            hidden && hidden.hiddenCount > 0 ? (
              <FilteredForLine
                testID="cookbook-filtered-for"
                filters={hidden.filteredFor.join(' + ')}
                hiddenCount={hidden.hiddenCount}
                onPress={() => setWhatWeCheckOpen(true)}
              />
            ) : null
          }
          renderItem={({ item: row }) => <TileGrid>{row.map(tile)}</TileGrid>}
          onEndReached={() => {
            if (tab !== 'discover' && list.hasNextPage && !list.isFetchingNextPage) {
              void list.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            tab !== 'discover' && list.isFetchingNextPage ? (
              <View testID="cookbook-loading-more" className="items-center py-4">
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : tab !== 'discover' && list.isError && list.hasNextPage ? (
              <Button
                testID="cookbook-load-more-retry"
                variant="outline"
                onPress={() => void list.fetchNextPage()}
              >
                {t('recipes.cookbook.loadMoreError')}
              </Button>
            ) : null
          }
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
