'use client';

import { useEffect, useRef, useState } from 'react';
import { RecipeImage } from '@/features/recipes/components/RecipeImage';
import { useIsPremium } from '@/hooks/useIsPremium';
import { trpc } from '@/lib/trpc';
import { Heart, Wand2 } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import { buildPickerSections } from '@chefer/utils';

// Replace one meal slot — web port of the mobile RecipePickerSheet (parity
// backlog 2026-09-23). Primary action: pick a specific recipe (any tier,
// mealPlan.replaceRecipe has no quota); footer: AI regeneration (premium,
// mealPlan.swapRecipe, quota enforced server-side).

export interface ReplaceTarget {
  planId: string;
  dayOfWeek: number;
  mealType: string;
  mealName: string;
}

export function ReplaceMealSheet({
  target,
  onClose,
}: {
  target: ReplaceTarget | null;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = target !== null;

  // The sheet stays mounted between opens — start each open with a clean search.
  useEffect(() => {
    if (!open) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSearch('');
      setDebouncedSearch('');
    }
  }, [open]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const isPremium = useIsPremium();
  const searchInput = debouncedSearch || undefined;
  const mineQuery = trpc.recipe.list.useQuery(
    { search: searchInput, myRecipesOnly: true, limit: 20 },
    { enabled: open },
  );
  const allQuery = trpc.recipe.list.useQuery({ search: searchInput, limit: 30 }, { enabled: open });

  const utils = trpc.useUtils();
  const invalidate = () => {
    void utils.mealPlan.getForWeek.invalidate();
    void utils.dashboard.invalidate();
    void utils.tracker.invalidate();
    void utils.shoppingList.invalidate();
  };
  const replaceMutation = trpc.mealPlan.replaceRecipe.useMutation({
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const swapMutation = trpc.mealPlan.swapRecipe.useMutation({
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const busy = replaceMutation.isPending || swapMutation.isPending;
  const error = replaceMutation.error?.message ?? swapMutation.error?.message ?? null;
  const sections = buildPickerSections(mineQuery.data, allQuery.data);
  const isLoading = mineQuery.isLoading || allQuery.isLoading;

  const handleClose = () => {
    replaceMutation.reset();
    swapMutation.reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Replace meal"
      description={target?.mealName}
      footer={
        isPremium === true ? (
          <button
            type="button"
            data-testid="picker-ai-swap"
            disabled={busy}
            onClick={() => {
              if (!target) return;
              swapMutation.mutate({
                planId: target.planId,
                dayOfWeek: target.dayOfWeek,
                mealType: target.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
              });
            }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Working…' : 'Regenerate with AI'}
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <input
          data-testid="picker-search"
          type="search"
          aria-label="Search recipes"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search recipes…"
          className="h-11 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]"
        />

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">Loading recipes…</p>
        ) : sections.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No recipes match your search.</p>
        ) : (
          sections.map((section) => (
            <div key={section.title}>
              <h3 className="pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {section.title}
              </h3>
              <ul className="flex flex-col gap-2">
                {section.data.map((recipe) => {
                  const n = recipe.nutritionInfo as { calories: number };
                  return (
                    <li key={recipe.id}>
                      <button
                        type="button"
                        data-testid={`picker-recipe-${recipe.id}`}
                        aria-label={`Use ${recipe.name}`}
                        disabled={busy}
                        onClick={() => {
                          if (!target) return;
                          replaceMutation.mutate({
                            planId: target.planId,
                            dayOfWeek: target.dayOfWeek,
                            mealType: target.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
                            recipeId: recipe.id,
                          });
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors hover:border-[#944a00]/40 hover:bg-orange-50/40 disabled:opacity-50"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                          <RecipeImage
                            imageUrl={recipe.imageUrl ?? null}
                            imageStatus={recipe.imageStatus ?? 'DONE'}
                            recipeName={recipe.name}
                            cuisineType={recipe.cuisineType}
                            className="h-full w-full"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {recipe.name}
                          </p>
                          <p className="text-xs text-gray-500">{n.calories} kcal</p>
                        </div>
                        {recipe.isFavourite && (
                          <Heart
                            className="h-3.5 w-3.5 shrink-0 fill-[#944a00] text-[#944a00]"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}
