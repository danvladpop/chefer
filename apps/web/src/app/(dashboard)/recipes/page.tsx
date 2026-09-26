'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ImportRecipeSheet } from '@/features/recipes/components/ImportRecipeSheet';
import { RecipeImage, type ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { trpc } from '@/lib/trpc';
import { Clock, Compass, Flame, Heart, Link2, Pencil, Plus, Search } from 'lucide-react';
import { ErrorState } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── Cookbook (P2-8, PM review §5) ────────────────────────────────────────────
// Was "Recipes", which only listed past-plan recipes (F-REC-1-4). The
// Discover tab browses the curated collection — safety-filtered for the user
// and their household — with meal-type and time filters (recipe.discover).

type Tab = 'all' | 'saved' | 'my' | 'discover';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'saved', label: '♥ Saved' },
  { key: 'my', label: '✎ My Recipes' },
  { key: 'discover', label: 'Discover' },
] as const;

type MealFilter = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_FILTERS: { key: MealFilter | null; label: string }[] = [
  { key: null, label: 'Any meal' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];
const QUICK_MINS = 30;

/** The fields a recipe card needs — shared by recipe.list and recipe.discover rows. */
interface CardRecipe {
  id: string;
  name: string;
  imageUrl: string | null;
  imageStatus?: ImageStatusType | null;
  cuisineType: string;
  prepTimeMins: number;
  cookTimeMins: number;
  nutritionInfo: unknown;
  isFavourite: boolean;
}

export default function RecipesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawFilter = searchParams.get('filter') ?? searchParams.get('tab') ?? 'all';
  const initialTab: Tab =
    rawFilter === 'saved' || rawFilter === 'my' || rawFilter === 'discover' ? rawFilter : 'all';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [mealFilter, setMealFilter] = useState<MealFilter | null>(null);
  const [quickOnly, setQuickOnly] = useState(false);

  // Debounce search
  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout((window as unknown as { _st?: ReturnType<typeof setTimeout> })._st);
    (window as unknown as { _st?: ReturnType<typeof setTimeout> })._st = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const listInput = {
    search: debouncedSearch || undefined,
    savedOnly: tab === 'saved',
    myRecipesOnly: tab === 'my',
    limit: 30,
  };
  const {
    data: recipes,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = trpc.recipe.list.useQuery(listInput, { enabled: tab !== 'discover' });
  const discover = trpc.recipe.discover.useQuery(
    {
      search: debouncedSearch || undefined,
      mealType: mealFilter ?? undefined,
      maxTotalMins: quickOnly ? QUICK_MINS : undefined,
    },
    { enabled: tab === 'discover', staleTime: 60_000 },
  );
  const cards: CardRecipe[] | undefined = tab === 'discover' ? discover.data : recipes;
  const cardsLoading = tab === 'discover' ? discover.isLoading : isLoading;
  const cardsError = tab === 'discover' ? discover.isError : isError;

  const utils = trpc.useUtils();
  const toggleFav = trpc.recipe.toggleFavourite.useMutation({
    // Optimistic: flip the heart immediately, reconcile with the server after.
    onMutate: async ({ recipeId }) => {
      await utils.recipe.list.cancel(listInput);
      const previous = utils.recipe.list.getData(listInput);
      utils.recipe.list.setData(listInput, (old) =>
        old?.map((r) => (r.id === recipeId ? { ...r, isFavourite: !r.isFavourite } : r)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) utils.recipe.list.setData(listInput, context.previous);
    },
    onSettled: () => {
      void utils.recipe.list.invalidate();
      void utils.recipe.discover.invalidate();
    },
  });

  const handleTabChange = (t: Tab) => {
    setTab(t);
    router.replace(`/recipes?tab=${t}`, { scroll: false });
  };

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      {/* Header — a full-label button crowds the title at 375px, and a FAB
          would land on top of the chat widget, so the label shortens instead. */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Your Collection
          </p>
          <h1 className="font-serif text-xl font-bold text-gray-900 sm:text-2xl">Cookbook</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Import (F5 Cheferize) — visible on every tier: free users get the
              extraction preview, the diff is their ghost state (§6.4). */}
          <button
            onClick={() => setImportOpen(true)}
            className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[#944a00]/30 bg-white px-4 text-sm font-semibold text-[#944a00] shadow-sm transition-colors hover:bg-[#fff3e8]"
          >
            <Link2 className="h-4 w-4" />
            Import
          </button>
          <Link
            href="/recipes/new"
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#7a3d00]"
          >
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">Create Recipe</span>
          </Link>
        </div>
      </div>

      <ImportRecipeSheet open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Tabs */}
      <div className="scroll-rail mb-4 gap-1 border-b">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={`min-h-11 shrink-0 whitespace-nowrap px-4 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-b-2 border-[#944a00] text-[#944a00]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={tab === 'discover' ? 'Search dishes or ingredients…' : 'Search recipes…'}
          aria-label="Search recipes"
          className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-4 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
        />
      </div>

      {/* Discover filters */}
      {tab === 'discover' && (
        <div
          role="group"
          aria-label="Filter the collection"
          data-testid="discover-filters"
          className="scroll-rail -mt-2 mb-6 gap-2"
        >
          {MEAL_FILTERS.map(({ key, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => setMealFilter(key)}
              aria-pressed={mealFilter === key}
              className={cn(
                'min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
                mealFilter === key
                  ? 'border-[#944a00] bg-[#944a00] text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
              )}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setQuickOnly((q) => !q)}
            aria-pressed={quickOnly}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
              quickOnly
                ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
            )}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />≤ {QUICK_MINS} min
          </button>
        </div>
      )}

      {/* Content */}
      {cardsLoading ? (
        <RecipeGridSkeleton />
      ) : cardsError && !cards ? (
        <ErrorState
          title="Couldn't load your recipes"
          onRetry={() => void (tab === 'discover' ? discover.refetch() : refetch())}
          retrying={tab === 'discover' ? discover.isRefetching : isRefetching}
        />
      ) : !cards || cards.length === 0 ? (
        <EmptyState tab={tab} searching={debouncedSearch.length > 0} onTab={handleTabChange} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((recipe) => {
            const n = recipe.nutritionInfo as {
              calories: number;
              protein: number;
              carbs: number;
              fat: number;
            };
            const isSaved = recipe.isFavourite;
            return (
              <div
                key={recipe.id}
                className="group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md"
              >
                {/* Photo */}
                <div className="relative h-40 overflow-hidden">
                  <RecipeImage
                    imageUrl={recipe.imageUrl ?? null}
                    imageStatus={recipe.imageStatus ?? 'DONE'}
                    recipeName={recipe.name}
                    className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                  />
                  {/* Overlay buttons */}
                  <div className="absolute right-2 top-2 flex gap-1 sm:right-3 sm:top-3 sm:gap-1.5">
                    {tab === 'my' && (
                      <Link
                        href={`/recipes/${recipe.id}/edit`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-transform hover:scale-110 sm:h-8 sm:w-8"
                        aria-label="Edit recipe"
                      >
                        <Pencil className="h-4 w-4 text-[#944a00]" />
                      </Link>
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        toggleFav.mutate({ recipeId: recipe.id });
                      }}
                      aria-pressed={isSaved}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-transform hover:scale-110 sm:h-8 sm:w-8"
                      aria-label={isSaved ? 'Remove from favourites' : 'Save to favourites'}
                    >
                      <Heart
                        className={`h-4 w-4 ${isSaved ? 'fill-[#944a00] text-[#944a00]' : 'text-gray-500'}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <Link href={`/recipes/${recipe.id}`} className="block p-4">
                  <div className="mb-1 flex gap-2">
                    <span className="rounded-full bg-[#fff3e8] px-2 py-0.5 text-xs font-medium text-[#944a00] uppercase tracking-wide">
                      {recipe.cuisineType}
                    </span>
                  </div>
                  <h3 className="line-clamp-1 font-semibold text-gray-900">{recipe.name}</h3>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {recipe.prepTimeMins + recipe.cookTimeMins}m
                    </span>
                    <span className="flex items-center gap-1">
                      <Flame className="h-3 w-3 text-[#944a00]" />
                      {n.calories} kcal
                    </span>
                  </div>
                  {/* Macro chips */}
                  <div className="mt-2 flex gap-1.5">
                    <Chip label="P" value={n.protein} />
                    <Chip label="C" value={n.carbs} />
                    <Chip label="F" value={n.fat} />
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
      {label} {value}g
    </span>
  );
}

function EmptyState({
  tab,
  searching,
  onTab,
}: {
  tab: Tab;
  searching: boolean;
  onTab: (tab: Tab) => void;
}) {
  if (tab === 'discover') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-gray-50 px-4 py-16 text-center">
        <Compass className="h-10 w-10 text-gray-300" aria-hidden="true" />
        <p className="font-medium text-gray-700">No dishes match</p>
        <p className="text-sm text-gray-500">
          {searching
            ? 'Try another word, or clear the filters.'
            : 'Nothing in the collection fits these filters and your allergies.'}
        </p>
      </div>
    );
  }

  if (tab === 'saved') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-gray-50 py-16 text-center">
        <Heart className="h-10 w-10 text-gray-300" />
        <p className="font-medium text-gray-700">No saved recipes yet</p>
        <p className="text-sm text-gray-500">
          Tap the ♥ on any recipe to save it to your collection.
        </p>
        <button
          onClick={() => onTab('all')}
          className="min-h-11 px-2 text-sm text-[#944a00] hover:underline"
        >
          ← All recipes
        </button>
      </div>
    );
  }

  if (tab === 'my') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-gray-50 py-16 text-center">
        <span className="text-4xl" aria-hidden="true">
          ✎
        </span>
        <div>
          <p className="font-medium text-gray-700">No custom recipes yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Create your first recipe and it will appear here.
          </p>
        </div>
        <Link
          href="/recipes/new"
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-[#944a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7a3d00]"
        >
          <Plus className="h-4 w-4" />
          Create Recipe
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-gray-50 py-16 text-center">
      <span className="text-4xl" aria-hidden="true">
        📖
      </span>
      <div>
        <p className="font-medium text-gray-700">
          {searching ? 'No recipes match your search' : 'No recipes yet'}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {searching
            ? 'Try another word, or look in Discover.'
            : 'Recipes from your meal plans appear here. Browse the collection meanwhile.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => onTab('discover')}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#944a00] px-5 text-sm font-semibold text-white hover:bg-[#7a3d00]"
        >
          <Compass className="h-4 w-4" aria-hidden="true" />
          Browse Discover
        </button>
        {!searching && (
          <Link
            href="/meal-plan"
            className="inline-flex min-h-11 items-center rounded-xl border border-[#944a00]/30 px-5 text-sm font-semibold text-[#944a00] hover:bg-[#fff3e8]"
          >
            Go to Meal Planner
          </Link>
        )}
      </div>
    </div>
  );
}

function RecipeGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-2xl border bg-white shadow-sm"
        >
          <div className="h-40 bg-gray-100" />
          <div className="p-4">
            <div className="mb-2 h-3 w-20 rounded bg-gray-100" />
            <div className="mb-1 h-5 w-full rounded bg-gray-100" />
            <div className="h-3 w-28 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
