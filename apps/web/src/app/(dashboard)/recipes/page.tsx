'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { RecipeImage, type ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { trpc } from '@/lib/trpc';
import { Clock, Flame, Heart, Pencil, Plus, Search } from 'lucide-react';

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'all' | 'saved' | 'my';

export default function RecipesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawFilter = searchParams.get('filter') ?? searchParams.get('tab') ?? 'all';
  const initialTab: Tab = rawFilter === 'saved' ? 'saved' : rawFilter === 'my' ? 'my' : 'all';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout((window as unknown as { _st?: ReturnType<typeof setTimeout> })._st);
    (window as unknown as { _st?: ReturnType<typeof setTimeout> })._st = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const { data: recipes, isLoading } = trpc.recipe.list.useQuery({
    search: debouncedSearch || undefined,
    savedOnly: tab === 'saved',
    myRecipesOnly: tab === 'my',
    limit: 30,
  });

  const utils = trpc.useUtils();
  const toggleFav = trpc.recipe.toggleFavourite.useMutation({
    onSuccess: () => {
      void utils.recipe.list.invalidate();
    },
  });

  // Check saved status for each recipe
  const savedIds = new Set(tab === 'saved' ? recipes?.map((r) => r.id) : []);

  const handleTabChange = (t: Tab) => {
    setTab(t);
    router.replace(`/recipes?tab=${t}`, { scroll: false });
  };

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Your Collection
          </p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Recipes</h1>
        </div>
        <Link
          href="/recipes/new"
          className="flex items-center gap-1.5 rounded-xl bg-[#944a00] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7a3d00] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create Recipe
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b">
        {(
          [
            { key: 'all', label: 'All Recipes' },
            { key: 'saved', label: '♥ Saved' },
            { key: 'my', label: '✎ My Recipes' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
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
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search recipes…"
          className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-4 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <RecipeGridSkeleton />
      ) : !recipes || recipes.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => {
            const n = recipe.nutritionInfo as {
              calories: number;
              protein: number;
              carbs: number;
              fat: number;
            };
            const isSaved = savedIds.has(recipe.id) || tab === 'saved';
            return (
              <div
                key={recipe.id}
                className="group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md"
              >
                {/* Photo */}
                <div className="relative h-40 overflow-hidden">
                  <RecipeImage
                    imageUrl={recipe.imageUrl ?? null}
                    imageStatus={(recipe.imageStatus ?? 'DONE') as ImageStatusType}
                    recipeName={recipe.name}
                    className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                  />
                  {/* Overlay buttons */}
                  <div className="absolute right-3 top-3 flex gap-1.5">
                    {tab === 'my' && (
                      <Link
                        href={`/recipes/${recipe.id}/edit`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm hover:scale-110 transition-transform"
                        aria-label="Edit recipe"
                      >
                        <Pencil className="h-3.5 w-3.5 text-[#944a00]" />
                      </Link>
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        toggleFav.mutate({ recipeId: recipe.id });
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm hover:scale-110 transition-transform"
                      aria-label={isSaved ? 'Remove from favourites' : 'Save to favourites'}
                    >
                      <Heart
                        className={`h-4 w-4 ${isSaved ? 'fill-[#944a00] text-[#944a00]' : 'text-gray-400'}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <Link href={`/recipes/${recipe.id}`} className="block p-4">
                  <div className="mb-1 flex gap-2">
                    <span className="rounded-full bg-[#fff3e8] px-2 py-0.5 text-[10px] font-medium text-[#944a00] uppercase tracking-wide">
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
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
      {label} {value}g
    </span>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  if (tab === 'saved') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-gray-50 py-16 text-center">
        <Heart className="h-10 w-10 text-gray-300" />
        <p className="font-medium text-gray-700">No saved recipes yet</p>
        <p className="text-sm text-gray-500">
          Tap the ♥ on any recipe to save it to your collection.
        </p>
        <button
          onClick={() => window.history.back()}
          className="text-sm text-[#944a00] hover:underline"
        >
          ← All Recipes
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
          className="flex items-center gap-1.5 rounded-xl bg-[#944a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7a3d00]"
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
        <p className="font-medium text-gray-700">No recipes yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Generate a meal plan and your recipes will appear here.
        </p>
      </div>
      <Link
        href="/meal-plan"
        className="rounded-xl bg-[#944a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7a3d00]"
      >
        Go to Meal Planner →
      </Link>
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
