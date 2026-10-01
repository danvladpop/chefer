import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FRIENDS_COPY, FRIENDS_LIMITS, type FriendRecipeCard } from '@chefer/types';
import {
  EmptyState,
  ErrorState,
  haptics,
  PressableScale,
  SearchField,
  Skeleton,
  springs,
  Text,
  useReducedMotion,
  useSnackbar,
} from '@chefer/ui-mobile';
import { getRecipeImageUrl } from '../../../../lib/recipe-image';
import { trpc } from '../../../../lib/trpc';

// ─── FriendRecipeGrid: another person's shared recipes (UX §9.3, FR-16) ───────
// `friends.recipes` (keyset pages of 20). Two columns (one at font scale ≥
// 1.4): photo 4:3, name, `{kcal} kcal · {min} min`, the source domain of an
// imported recipe, and a heart. The heart is a live reference to their
// recipe (PRD §13): optimistic, MO-14 pop + `haptics.success`, and a snackbar
// with Undo. Server-side search appears above 12 recipes. Auto-hidden
// recipes never come back from the server.

/** UX §9.3: one column from this text scale. */
export const RECIPE_GRID_SINGLE_COLUMN_SCALE = 1.4;
/** UX §9.3: search appears above this many recipes. */
export const RECIPE_SEARCH_THRESHOLD = 12;

export type FriendRecipeGridProps = {
  userId: string;
  firstName: string;
  /** `friends.profile.recipeCount` (null when recipes aren't visible). */
  recipeCount: number | null;
  /**
   * The profile's scroll view calls this near its end; the grid answers by
   * loading the next page (the grid lives inside that one scroll view, so it
   * can't be its own FlatList).
   */
  registerLoadMore?: (loadMore: (() => void) | null) => void;
  testID?: string;
};

export function FriendRecipeGrid({
  userId,
  firstName,
  recipeCount,
  registerLoadMore,
  testID = 'friends-recipes',
}: FriendRecipeGridProps) {
  const { fontScale } = useWindowDimensions();
  const oneColumn = fontScale >= RECIPE_GRID_SINGLE_COLUMN_SCALE;
  const [search, setSearch] = useState('');
  const input = {
    userId,
    limit: FRIENDS_LIMITS.pageSize,
    ...(search.trim() ? { search: search.trim() } : {}),
  };
  const recipes = trpc.friends.recipes.useInfiniteQuery(input, {
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = recipes;

  useEffect(() => {
    if (!registerLoadMore) return;
    registerLoadMore(() => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    });
    return () => registerLoadMore(null);
  }, [registerLoadMore, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const heart = useRecipeHeart(input);
  const items = recipes.data?.pages.flatMap((p) => p.items) ?? [];
  const showSearch = (recipeCount ?? 0) > RECIPE_SEARCH_THRESHOLD || search.trim().length > 0;

  return (
    <View testID={testID} className="gap-3">
      {showSearch ? (
        <SearchField
          testID={`${testID}-search`}
          accessibilityLabel={FRIENDS_COPY.recipes.search(firstName)}
          placeholder={FRIENDS_COPY.recipes.search(firstName)}
          autoCapitalize="none"
          onDebouncedChange={setSearch}
        />
      ) : null}

      {recipes.isLoading ? (
        <View testID={`${testID}-loading`} className="flex-row flex-wrap gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 min-w-[45%] flex-1 rounded-2xl" />
          ))}
        </View>
      ) : recipes.isError && items.length === 0 ? (
        <ErrorState
          testID={`${testID}-error`}
          title={FRIENDS_COPY.profile.error}
          onRetry={() => void recipes.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          testID={`${testID}-empty`}
          icon={<Ionicons name="book-outline" size={40} color="#9ca3af" />}
          title={FRIENDS_COPY.recipes.empty(firstName)}
        />
      ) : (
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {items.map((recipe) => (
            <View key={recipe.id} className={oneColumn ? 'w-full' : 'w-[48.5%]'}>
              <FriendRecipeTile
                recipe={recipe}
                ownerId={userId}
                testID={`${testID}-card-${recipe.id}`}
                onHeart={() => heart(recipe)}
              />
            </View>
          ))}
        </View>
      )}
      {isFetchingNextPage ? <ActivityIndicator testID={`${testID}-more`} color="#944a00" /> : null}
    </View>
  );
}

type RecipesInput = { userId: string; limit: number; search?: string };

/** Optimistic heart on the grid's cache + snackbar with Undo. */
function useRecipeHeart(input: RecipesInput): (recipe: FriendRecipeCard) => void {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const toggle = trpc.recipe.toggleFavourite.useMutation();

  const flip = (recipeId: string, to: boolean) =>
    utils.friends.recipes.setInfiniteData(input, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((r) => (r.id === recipeId ? { ...r, isFavourite: to } : r)),
            })),
          }
        : old,
    );

  const run = async (recipe: FriendRecipeCard, to: boolean, withUndo: boolean) => {
    flip(recipe.id, to);
    if (to) haptics.success();
    else haptics.selection();
    try {
      const result = await toggle.mutateAsync({ recipeId: recipe.id });
      flip(recipe.id, result.isSaved);
      void utils.recipe.list.invalidate();
      void utils.recipe.isSaved.invalidate({ recipeId: recipe.id });
      if (withUndo) {
        snackbar.show({
          message: result.isSaved ? FRIENDS_COPY.recipes.saved : FRIENDS_COPY.recipes.removed,
          actionLabel: FRIENDS_COPY.common.undo,
          onAction: () => void run(recipe, !result.isSaved, false),
        });
      }
    } catch {
      flip(recipe.id, !to);
      haptics.error();
      snackbar.show({ message: FRIENDS_COPY.relation.error });
    }
  };

  return (recipe) => void run(recipe, !recipe.isFavourite, true);
}

export function FriendRecipeTile({
  recipe,
  ownerId,
  onHeart,
  testID,
}: {
  recipe: FriendRecipeCard;
  ownerId: string;
  onHeart: () => void;
  testID: string;
}) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const pop = () => {
    // MO-14 heart pop: 1 → 1.2 → 1 on `spring.bouncy`; nothing under reduced motion.
    if (reduced) return;
    scale.set(withSequence(withSpring(1.2, springs.bouncy), withSpring(1, springs.bouncy)));
  };
  const kcal = Math.round(recipe.perServing.kcal);
  return (
    <View className="relative">
      <PressableScale
        testID={testID}
        pressScale="card"
        accessibilityRole="button"
        accessibilityLabel={`${recipe.name}, ${FRIENDS_COPY.recipes.perServing(kcal, recipe.totalTimeMins)}`}
        onPress={() =>
          router.push({ pathname: '/recipe/[id]', params: { id: recipe.id, owner: ownerId } })
        }
        className="overflow-hidden rounded-2xl border border-border bg-card"
      >
        {/* MO-13: the placeholder photo stays when the image fails. */}
        <Image
          source={{ uri: getRecipeImageUrl(recipe.imageUrl) }}
          className="aspect-[4/3] w-full bg-muted"
          resizeMode="cover"
        />
        <View className="gap-1 p-3">
          <Text numberOfLines={2} className="text-sm font-semibold text-gray-900">
            {recipe.name}
          </Text>
          <Text className="text-xs text-gray-600">
            {FRIENDS_COPY.recipes.perServing(kcal, recipe.totalTimeMins)}
          </Text>
          {recipe.sourceDomain ? (
            <Text
              testID={`${testID}-domain`}
              numberOfLines={1}
              className="text-xs text-muted-foreground"
            >
              {recipe.sourceDomain}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      <Pressable
        testID={`${testID}-heart`}
        accessibilityRole="button"
        accessibilityLabel={
          recipe.isFavourite
            ? FRIENDS_COPY.recipes.unsave(recipe.name)
            : FRIENDS_COPY.recipes.save(recipe.name)
        }
        accessibilityState={{ selected: recipe.isFavourite }}
        hitSlop={4}
        onPress={() => {
          if (!recipe.isFavourite) pop();
          onHeart();
        }}
        className="absolute right-1.5 top-1.5 h-11 w-11 items-center justify-center rounded-full bg-white/90"
      >
        <Animated.View style={heartStyle}>
          <Ionicons
            name={recipe.isFavourite ? 'heart' : 'heart-outline'}
            size={20}
            color={recipe.isFavourite ? '#944a00' : '#6b7280'}
          />
        </Animated.View>
      </Pressable>
    </View>
  );
}
