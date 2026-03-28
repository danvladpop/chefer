'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useState } from 'react';
import { StarRatingWidget } from '@/features/recipe/components/StarRatingWidget';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, Clock, Flame, Heart, Library, RefreshCw, Search, Users, X } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const MEAL_COLOURS: Record<string, string> = {
  breakfast: 'bg-emerald-100 text-emerald-700',
  lunch: 'bg-orange-100 text-orange-700',
  dinner: 'bg-indigo-100 text-indigo-700',
  snack: 'bg-purple-100 text-purple-700',
};

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface RecipePageProps {
  params: Promise<{ id: string }>;
}

export default function RecipeDetailPage({ params }: RecipePageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const planId = searchParams.get('planId');
  const day = searchParams.get('day');
  const meal = searchParams.get('meal');
  const dayParam = day !== null ? parseInt(day, 10) : null;

  const hasSwapContext = Boolean(planId && day !== null && meal);

  // ── Context label ──────────────────────────────────────────────────────────
  const dayLabel = dayParam !== null ? (DAY_NAMES[dayParam] ?? '') : '';
  const mealLabel = meal ? meal.charAt(0).toUpperCase() + meal.slice(1) : '';
  const contextLabel = dayLabel && mealLabel ? `${mealLabel} · ${dayLabel}` : '';

  const { data: recipe, isLoading, isError } = trpc.mealPlan.getRecipe.useQuery({ recipeId: id });
  const { data: savedData } = trpc.recipe.isSaved.useQuery({ recipeId: id });
  const { data: myRating } = trpc.recipe.getMyRating.useQuery({ recipeId: id });
  const isSaved = savedData?.isSaved ?? false;

  const utils = trpc.useUtils();

  const toggleFav = trpc.recipe.toggleFavourite.useMutation({
    onSuccess: () => {
      void utils.recipe.isSaved.invalidate({ recipeId: id });
      void utils.recipe.list.invalidate();
      void utils.dashboard.summary.invalidate();
    },
  });

  const swapMutation = trpc.mealPlan.swapRecipe.useMutation({
    onSuccess: (newRecipe) => {
      void utils.mealPlan.getActive.invalidate();
      router.push(`/recipes/${newRecipe.id}?planId=${planId}&day=${day}&meal=${meal}`);
    },
  });

  const replaceMutation = trpc.mealPlan.replaceRecipe.useMutation({
    onSuccess: (newRecipe) => {
      void utils.mealPlan.getActive.invalidate();
      setShowPicker(false);
      router.push(`/recipes/${newRecipe.id}?planId=${planId}&day=${day}&meal=${meal}`);
    },
  });

  // Servings adjuster
  const [servings, setServings] = useState<number | null>(null);
  const baseServings = recipe?.servings ?? 1;
  const selectedServings = servings ?? baseServings;
  const scale = selectedServings / baseServings;

  // Saved-recipe picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // ── Back destination ───────────────────────────────────────────────────────
  const backHref = planId ? '/meal-plan' : '/recipes';
  const backLabel = planId ? 'Back to Meal Planner' : 'Back to Recipes';

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl animate-pulse px-6 py-8">
        <div className="mb-6 h-4 w-32 rounded bg-gray-200" />
        <div className="mb-6 h-56 w-full rounded-2xl bg-gray-200" />
        <div className="mb-2 h-8 w-2/3 rounded bg-gray-200" />
        <div className="mb-6 h-4 w-1/3 rounded bg-gray-200" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="mb-3 h-4 rounded bg-gray-200" />
        ))}
      </div>
    );
  }

  if (isError || !recipe) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8 text-center">
        <p className="text-gray-500">Recipe not found.</p>
        <Link href={backHref} className="mt-4 inline-block text-sm text-[#944a00] hover:underline">
          {backLabel}
        </Link>
      </div>
    );
  }

  const totalTime = recipe.prepTimeMins + recipe.cookTimeMins;
  const { nutritionInfo: n } = recipe;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Back link + context label row */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={backHref}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>

        {/* Meal-plan context pill — only when opened from the planner */}
        {hasSwapContext && contextLabel && (
          <span className="flex items-center gap-1.5 rounded-full border border-[#944a00]/20 bg-[#fff3e8] px-3 py-1 text-xs font-semibold text-[#944a00]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${MEAL_COLOURS[meal ?? '']?.split(' ')[0] ?? 'bg-gray-400'}`}
            />
            {contextLabel}
          </span>
        )}
      </div>

      {/* Hero image */}
      <div className="relative mb-6 h-56 w-full overflow-hidden rounded-2xl">
        <Image
          {...getRecipeImageProps(recipe.imageUrl)}
          alt={recipe.name}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
      </div>

      {/* Title + action bar */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          {/* Tags row */}
          <div className="mb-2 flex flex-wrap gap-2">
            {meal && (
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-semibold uppercase ${MEAL_COLOURS[meal] ?? 'bg-gray-100 text-gray-600'}`}
              >
                {meal}
              </span>
            )}
            <span className="rounded-full bg-[#fff3e8] px-3 py-0.5 text-xs font-medium text-[#944a00]">
              {recipe.cuisineType}
            </span>
            {recipe.dietaryTags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-3 py-0.5 text-xs text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">{recipe.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{recipe.description}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {/* Save button */}
          <button
            onClick={() => toggleFav.mutate({ recipeId: id })}
            disabled={toggleFav.isPending}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium shadow-sm transition-colors ${
              isSaved
                ? 'border-[#944a00]/30 bg-[#fff3e8] text-[#944a00]'
                : 'border-gray-200 bg-white text-gray-600 hover:border-[#944a00]/30 hover:text-[#944a00]'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isSaved ? 'fill-[#944a00]' : ''}`} />
            {isSaved ? 'Saved' : 'Save'}
          </button>

          {/* Meal-plan action buttons — only when accessed from the planner */}
          {hasSwapContext && (
            <>
              {/* Choose a recipe from saved or my recipes */}
              <button
                onClick={() => setShowPicker(true)}
                disabled={replaceMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:border-[#944a00]/30 hover:text-[#944a00] disabled:opacity-60"
              >
                <Library className="h-3.5 w-3.5" />
                Choose Recipe
              </button>

              {/* AI Swap */}
              <button
                onClick={() => {
                  if (planId && day !== null && meal) {
                    swapMutation.mutate({
                      planId,
                      dayOfWeek: parseInt(day, 10),
                      mealType: meal as 'breakfast' | 'lunch' | 'dinner' | 'snack',
                    });
                  }
                }}
                disabled={swapMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl border border-[#944a00]/30 bg-white px-3 py-2 text-xs font-medium text-[#944a00] shadow-sm hover:bg-[#fff3e8] disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${swapMutation.isPending ? 'animate-spin' : ''}`}
                />
                {swapMutation.isPending ? 'Swapping…' : 'Swap Recipe'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-3 divide-x rounded-xl border bg-white">
        <Stat
          icon={<Clock className="h-4 w-4 text-gray-400" />}
          label="Total time"
          value={`${totalTime} min`}
        />
        <Stat
          icon={<Users className="h-4 w-4 text-gray-400" />}
          label="Servings"
          value={String(selectedServings)}
        />
        <Stat
          icon={<Flame className="h-4 w-4 text-[#944a00]" />}
          label="Calories"
          value={`${n.calories} kcal`}
        />
      </div>

      {/* Macros */}
      <div className="mb-8 grid grid-cols-4 gap-3">
        <MacroChip label="Protein" value={n.protein} />
        <MacroChip label="Carbs" value={n.carbs} />
        <MacroChip label="Fat" value={n.fat} />
        <MacroChip label="Fiber" value={n.fiber} />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-8 md:grid-cols-[280px_1fr]">
        {/* Ingredients */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-gray-900">Ingredients</h2>
            {/* Servings adjuster */}
            <div className="flex items-center gap-2 rounded-xl border px-2 py-1">
              <button
                onClick={() => setServings(Math.max(1, selectedServings - 1))}
                className="h-5 w-5 rounded-full text-gray-600 hover:bg-gray-100"
              >
                −
              </button>
              <span className="w-8 text-center text-sm font-medium">{selectedServings}</span>
              <button
                onClick={() => setServings(Math.min(8, selectedServings + 1))}
                className="h-5 w-5 rounded-full text-gray-600 hover:bg-gray-100"
              >
                +
              </button>
            </div>
          </div>
          <ul className="space-y-2">
            {recipe.ingredients.map((ing, i) => {
              const qty = Math.round(ing.quantity * scale * 10) / 10;
              return (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="shrink-0 font-medium text-gray-900">
                    {qty % 1 === 0 ? qty : qty.toFixed(1)} {ing.unit}
                  </span>
                  <span className="text-gray-600">{ing.name}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Instructions */}
        <section>
          <h2 className="mb-4 font-serif text-lg font-semibold text-gray-900">Instructions</h2>
          <ol className="space-y-4">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#944a00] text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-gray-700">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Nutrition Facts panel */}
      <div className="mt-8 rounded-2xl border bg-white p-5">
        <h2 className="mb-3 font-serif text-sm font-semibold text-gray-900">
          Nutrition Facts{' '}
          <span className="text-xs font-normal text-gray-400">per {recipe.servings} servings</span>
        </h2>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <NutritionRow label="Calories" value={`${n.calories} kcal`} />
          <NutritionRow label="Protein" value={`${n.protein}g`} />
          <NutritionRow label="Carbs" value={`${n.carbs}g`} />
          <NutritionRow label="Fat" value={`${n.fat}g`} />
        </div>
      </div>

      {/* Star rating — shown when recipe was accessed from a meal plan day */}
      {dayParam !== null && (
        <div className="mt-8">
          <StarRatingWidget
            recipeId={id}
            initialRating={myRating?.rating}
            initialNotes={myRating?.notes}
          />
        </div>
      )}

      {/* Swap error */}
      {swapMutation.isError && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">
            {swapMutation.error?.message ?? 'Failed to swap recipe. Please try again.'}
          </p>
          <button
            onClick={() => swapMutation.reset()}
            className="text-xs text-red-500 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Replace error */}
      {replaceMutation.isError && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">
            {replaceMutation.error?.message ?? 'Failed to replace recipe. Please try again.'}
          </p>
          <button
            onClick={() => replaceMutation.reset()}
            className="text-xs text-red-500 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Saved recipe picker modal */}
      {showPicker && planId && day !== null && meal && (
        <SavedRecipePicker
          contextLabel={contextLabel}
          currentRecipeId={id}
          onSelect={(recipeId) => {
            replaceMutation.mutate({
              planId,
              dayOfWeek: parseInt(day, 10),
              mealType: meal as 'breakfast' | 'lunch' | 'dinner' | 'snack',
              recipeId,
            });
          }}
          onClose={() => setShowPicker(false)}
          isPending={replaceMutation.isPending}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
        />
      )}
    </div>
  );
}

// ─── Saved Recipe Picker Modal ─────────────────────────────────────────────────

interface SavedRecipePickerProps {
  contextLabel: string;
  currentRecipeId: string;
  onSelect: (recipeId: string) => void;
  onClose: () => void;
  isPending: boolean;
  search: string;
  onSearchChange: (v: string) => void;
}

function SavedRecipePicker({
  contextLabel,
  currentRecipeId,
  onSelect,
  onClose,
  isPending,
  search,
  onSearchChange,
}: SavedRecipePickerProps) {
  const { data: savedRecipes, isLoading: loadingSaved } = trpc.recipe.list.useQuery({
    savedOnly: true,
    search: search || undefined,
    limit: 50,
  });

  const { data: myRecipes, isLoading: loadingMy } = trpc.recipe.list.useQuery({
    myRecipesOnly: true,
    search: search || undefined,
    limit: 50,
  });

  const isLoading = loadingSaved || loadingMy;

  // Merge, deduplicate by id, exclude the current recipe
  const myIds = new Set((myRecipes ?? []).map((r) => r.id));
  const combined = [
    ...(myRecipes ?? []).map((r) => ({ ...r, _source: 'mine' as const })),
    ...(savedRecipes ?? [])
      .filter((r) => !myIds.has(r.id))
      .map((r) => ({ ...r, _source: 'saved' as const })),
  ].filter((r) => r.id !== currentRecipeId);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Panel */}
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-serif text-base font-semibold text-gray-900">Choose a Recipe</h2>
            {contextLabel && (
              <p className="mt-0.5 text-xs text-gray-400">
                Replacing <span className="font-medium text-[#944a00]">{contextLabel}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              type="text"
              placeholder="Search your recipes…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Recipe list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3">
                  <div className="h-14 w-14 shrink-0 rounded-xl bg-gray-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-2/3 rounded bg-gray-200" />
                    <div className="h-3 w-1/2 rounded bg-gray-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : combined.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Library className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">
                {search ? 'No recipes match your search.' : 'No recipes in your collection yet.'}
              </p>
              <p className="text-xs text-gray-400">
                Save recipes with ♥ or create your own under My Recipes.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {combined.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onSelect(r.id)}
                    disabled={isPending}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#fff3e8] disabled:opacity-60"
                  >
                    {/* Thumbnail */}
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                      <Image
                        {...getRecipeImageProps(r.imageUrl ?? null)}
                        alt={r.name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-gray-900">{r.name}</p>
                        {r._source === 'mine' && (
                          <span className="shrink-0 rounded-full bg-[#fff3e8] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#944a00]">
                            Mine
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {r.cuisineType} ·{' '}
                        {(r.nutritionInfo as { calories?: number }).calories ?? '—'} kcal
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3">
          <p className="text-center text-xs text-gray-400">
            {combined.length > 0
              ? `${combined.length} recipe${combined.length === 1 ? '' : 's'} · saved & yours`
              : 'Save or create recipes to use them here'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4">
      {icon}
      <span className="text-base font-semibold text-gray-900">{value}</span>
      <span className="text-[11px] text-gray-400">{label}</span>
    </div>
  );
}

function MacroChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-gray-50 px-3 py-3 text-center">
      <p className="text-base font-bold text-gray-900">{value}g</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

function NutritionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  );
}
