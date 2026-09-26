import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { Button, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { getRecipeImageUrl } from '../../src/lib/recipe-image';
import { trpc } from '../../src/lib/trpc';

// Recipes tab — port of apps/web (dashboard)/recipes/page.tsx (M2-3).
// Deviations, deliberate: Import (F5) and Create/Edit recipe forms are not
// ported yet — tracked in the plan as part of M2-10's sweep.

type Tab = 'all' | 'saved' | 'my';

const TABS = [
  { key: 'all', label: 'All Recipes' },
  { key: 'saved', label: '♥ Saved' },
  { key: 'my', label: '✎ My Recipes' },
] as const;

export default function RecipesScreen() {
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const listInput = {
    search: debouncedSearch || undefined,
    savedOnly: tab === 'saved',
    myRecipesOnly: tab === 'my',
    limit: 30,
  };
  const { data: recipes, isLoading, isError, refetch } = trpc.recipe.list.useQuery(listInput);

  const utils = trpc.useUtils();
  const toggleFav = trpc.recipe.toggleFavourite.useMutation({
    // Optimistic: flip the heart immediately, reconcile after (same as web).
    onMutate: async ({ recipeId }) => {
      await utils.recipe.list.cancel(listInput);
      const previous = utils.recipe.list.getData(listInput);
      utils.recipe.list.setData(listInput, (old) =>
        old?.map((r) => (r.id === recipeId ? { ...r, isFavourite: !r.isFavourite } : r)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        utils.recipe.list.setData(listInput, context.previous);
      }
    },
    onSettled: () => void utils.recipe.list.invalidate(),
  });

  return (
    <Screen className="px-0">
      <View className="gap-3 px-4 pb-2 pt-4">
        <ModeSwitch />
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Your Collection
            </Text>
            <Text testID="recipes-title" variant="title">
              Recipes
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
              <Ionicons name="link-outline" size={16} color="#944a00" />
              <Text className="text-sm font-semibold text-primary">Import</Text>
            </Pressable>
            <Pressable
              testID="recipes-new"
              accessibilityRole="button"
              onPress={() => router.push('/recipe-form')}
              className="min-h-11 flex-row items-center gap-1.5 rounded-xl bg-primary px-3"
            >
              <Ionicons name="add" size={16} color="white" />
              <Text className="text-sm font-semibold text-primary-foreground">New</Text>
            </Pressable>
          </View>
        </View>

        {/* Tabs */}
        <View className="flex-row border-b border-border">
          {TABS.map(({ key, label }) => (
            <Pressable
              key={key}
              testID={`recipes-tab-${key}`}
              accessibilityRole="button"
              onPress={() => setTab(key)}
              className={cn(
                'min-h-11 justify-center px-4',
                tab === key && 'border-b-2 border-primary',
              )}
            >
              <Text
                className={cn(
                  'text-sm font-medium',
                  tab === key ? 'text-primary' : 'text-gray-500',
                )}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Search */}
        <TextInput
          testID="recipes-search"
          value={search}
          onChangeText={handleSearch}
          placeholder="Search recipes…"
          placeholderTextColor="#9ca3af"
          className="h-11 rounded-xl border border-input bg-background px-4 text-base text-foreground"
        />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      ) : isError && !recipes ? (
        <ErrorState
          title="Couldn't load your recipes"
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void refetch()}
        />
      ) : !recipes || recipes.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          contentContainerClassName="gap-4 px-4 py-3"
          renderItem={({ item: recipe }) => {
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
                onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <View className="relative">
                  <Image
                    source={{ uri: getRecipeImageUrl(recipe.imageUrl) }}
                    className="h-40 w-full"
                    resizeMode="cover"
                  />
                  <View className="absolute right-2 top-2 flex-row gap-1.5">
                    {tab === 'my' && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Edit recipe"
                        onPress={() =>
                          router.push({ pathname: '/recipe-form', params: { id: recipe.id } })
                        }
                        className="h-11 w-11 items-center justify-center rounded-full bg-white/90"
                      >
                        <Ionicons name="pencil" size={18} color="#944a00" />
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        recipe.isFavourite ? 'Remove from favourites' : 'Save to favourites'
                      }
                      onPress={() => toggleFav.mutate({ recipeId: recipe.id })}
                      className="h-11 w-11 items-center justify-center rounded-full bg-white/90"
                    >
                      <Ionicons
                        name={recipe.isFavourite ? 'heart' : 'heart-outline'}
                        size={20}
                        color={recipe.isFavourite ? '#944a00' : '#6b7280'}
                      />
                    </Pressable>
                  </View>
                </View>
                <View className="gap-1.5 p-4">
                  <View className="self-start rounded-full bg-accent px-2 py-0.5">
                    <Text className="text-[12px] font-medium uppercase tracking-wide text-primary">
                      {recipe.cuisineType}
                    </Text>
                  </View>
                  <Text numberOfLines={1} className="font-semibold text-gray-900">
                    {recipe.name}
                  </Text>
                  <View className="flex-row items-center gap-3">
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="time-outline" size={12} color="#6b7280" />
                      <Text className="text-xs text-gray-500">
                        {recipe.prepTimeMins + recipe.cookTimeMins}m
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="flame-outline" size={12} color="#944a00" />
                      <Text className="text-xs text-gray-500">{n.calories} kcal</Text>
                    </View>
                  </View>
                  <View className="flex-row gap-1.5">
                    {(
                      [
                        ['P', n.protein],
                        ['C', n.carbs],
                        ['F', n.fat],
                      ] as const
                    ).map(([label, value]) => (
                      <View key={label} className="rounded-full bg-gray-100 px-2 py-0.5">
                        <Text className="text-[12px] text-gray-500">
                          {label} {value}g
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <View
      testID="recipes-empty"
      className="mx-4 items-center rounded-2xl border border-dashed border-border bg-gray-50 py-16"
    >
      {tab === 'saved' ? (
        <>
          <Ionicons name="heart-outline" size={40} color="#d1d5db" />
          <Text className="mt-3 font-medium text-gray-700">No saved recipes yet</Text>
          <Text variant="muted" className="mt-1 px-6 text-center text-sm">
            Tap the ♥ on any recipe to save it to your collection.
          </Text>
        </>
      ) : tab === 'my' ? (
        <>
          <Text className="text-4xl">✎</Text>
          <Text className="mt-3 font-medium text-gray-700">No custom recipes yet</Text>
          <Text variant="muted" className="mt-1 px-6 text-center text-sm">
            Recipe creation arrives on mobile soon — use the web app meanwhile.
          </Text>
        </>
      ) : (
        <>
          <Text className="text-4xl">📖</Text>
          <Text className="mt-3 font-medium text-gray-700">No recipes yet</Text>
          <Text variant="muted" className="mb-4 mt-1 px-6 text-center text-sm">
            Generate a meal plan and your recipes will appear here.
          </Text>
          <Link href="/meal-plan" asChild>
            <Button>Go to Meal Planner</Button>
          </Link>
        </>
      )}
    </View>
  );
}
