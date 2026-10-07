'use client';

import { useEffect, useRef, useState } from 'react';
import { useAiConsent } from '@/features/ai-consent/AiConsentProvider';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { RecipeImage } from '@/features/recipes/components/RecipeImage';
import { CheckedForChip } from '@/features/safety/components/CheckedForChip';
import { FilteredForLine } from '@/features/safety/components/FilteredForLine';
import { useIsPremium } from '@/hooks/useIsPremium';
import { trpc } from '@/lib/trpc';
import { Heart, ShieldCheck, Wand2 } from 'lucide-react';
import { ErrorState, Sheet } from '@chefer/ui';
import {
  buildPickerSections,
  filterReplaceCandidates,
  pickerRowMeta,
  pickerSafetyHeader,
  pickerSafetyHeaderText,
  PLAN_MEAL_MENU_COPY,
  readAddToWeekFailure,
  userFacingErrorMessage,
  verifiedLabels,
  type SlotMealType,
} from '@chefer/utils';

// Replace one meal slot — web port of the mobile RecipePickerSheet (parity
// backlog 2026-09-23; T-08.9/T-08.10 undo + filter parity). Primary action:
// pick a specific recipe (any tier, mealPlan.replaceRecipe has no quota);
// footer: AI regeneration (premium, mealPlan.swapRecipe, quota enforced
// server-side).

export interface ReplaceTarget {
  planId: string;
  dayOfWeek: number;
  mealType: string;
  /** The slot's index in `day.meals` — a curated day can hold two snacks. */
  slotIndex?: number | undefined;
  mealName: string;
  /**
   * T-08.10 (bug B-50): the recipe currently in the slot — never re-offered
   * as its own replacement.
   */
  recipeId: string;
  /**
   * FB7-04: `side` adds the picked recipe as a second dish of this meal type
   * (`recipe.addToWeek` mode 'add') instead of replacing the slot; it needs the
   * plan's `weekOffset`. Absent = a replace.
   */
  side?: { weekOffset: number } | undefined;
}

export interface SideAddedResult {
  target: ReplaceTarget;
  recipeName: string;
  /** `recipe.addToWeek`'s result — exactly what `recipe.undoAddToWeek` takes back. */
  added: {
    planId: string;
    dayOfWeek: number;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    slotIndex: number;
    addedRecipeId: string;
  };
}

export interface ReplaceMealResult {
  target: ReplaceTarget;
  recipeName: string;
  /** T-08.5/T-08.6: present unless there was nothing to undo to. */
  previousRecipeId?: string;
  /** UX-PLAN-04: the replaced slot was pinned — Undo must restore that, not pin it. */
  previousPinned?: boolean;
}

export function ReplaceMealSheet({
  target,
  onClose,
  onChanged,
  onSideAdded,
}: {
  target: ReplaceTarget | null;
  onClose: () => void;
  /** Fired after a successful replace/AI-swap — lets the caller offer Undo. */
  onChanged?: (result: ReplaceMealResult) => void;
  /** FB7-04: fired after a side dish was added — lets the caller offer Undo. */
  onSideAdded?: (result: SideAddedResult) => void;
}) {
  const { proteinOnly } = useNumbersMode(); // WP-08
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
  // Own recipes stay fully listed even when unsafe — that's the only case
  // replaceRecipe's acknowledgeConflict can apply to, so the user must still
  // be able to pick one and see the "Use anyway" offer (T-00.11). The
  // broader/curated list is safety-filtered: never suggest someone else's
  // unsafe dish.
  // UX-PLAN-05: `slotType` makes the server list the recipes that fit this
  // slot first (Lunch used to lead with breakfasts).
  const slotKind = target?.mealType;
  const slotHint: { slotType?: SlotMealType } =
    slotKind === 'breakfast' ||
    slotKind === 'lunch' ||
    slotKind === 'dinner' ||
    slotKind === 'snack'
      ? { slotType: slotKind }
      : {};
  const mineQuery = trpc.recipe.list.useQuery(
    { search: searchInput, myRecipesOnly: true, limit: 20, ...slotHint },
    { enabled: open },
  );
  const allQuery = trpc.recipe.list.useQuery(
    { search: searchInput, limit: 30, forTable: true, ...slotHint },
    { enabled: open },
  );
  // T-02.5/AC7: how many `all` results the table's safety filter hid —
  // mirrors the Discover/cookbook `FilteredForLine` footer.
  const hiddenQuery = trpc.recipe.listHiddenCount.useQuery(
    { search: searchInput },
    { enabled: open },
  );
  // The recipe the sheet last attempted — "Use anyway" retries this one id.
  const [lastAttemptedId, setLastAttemptedId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const invalidate = () => {
    void utils.mealPlan.getForWeek.invalidate();
    void utils.dashboard.invalidate();
    void utils.tracker.invalidate();
    void utils.shoppingList.invalidate();
  };
  const notifyChanged = (
    target: ReplaceTarget,
    recipeName: string,
    previousRecipeId?: string,
    previousPinned?: boolean,
  ) => {
    onChanged?.({
      target,
      recipeName,
      ...(previousRecipeId && { previousRecipeId }),
      ...(previousPinned && { previousPinned }),
    });
  };
  const replaceMutation = trpc.mealPlan.replaceRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      invalidate();
      onClose();
      if (target) notifyChanged(target, data.name, data.previousRecipeId, data.previousPinned);
    },
  });
  const requestAiConsent = useAiConsent();
  const swapMutation = trpc.mealPlan.swapRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      invalidate();
      onClose();
      if (target) notifyChanged(target, data.name, data.previousRecipeId, data.previousPinned);
    },
  });

  // The recipe being added as a side — its name goes in the Undo toast.
  const sideName = useRef('');
  const addSideMutation = trpc.recipe.addToWeek.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      invalidate();
      void utils.recipe.list.invalidate();
      onClose();
      if (target) onSideAdded?.({ target, recipeName: sideName.current, added: data });
    },
  });
  const isSide = target?.side !== undefined;
  const busy = replaceMutation.isPending || swapMutation.isPending || addSideMutation.isPending;
  const failure = replaceMutation.error ?? swapMutation.error ?? addSideMutation.error;
  const sideFailure = addSideMutation.error ? readAddToWeekFailure(addSideMutation.error) : null;
  const error = failure
    ? sideFailure?.kind === 'conflict'
      ? sideFailure.message
      : userFacingErrorMessage(failure)
    : null;
  // T-08.10 (bug B-50): never re-offer the meal being replaced; narrow to
  // the slot's type (rows without a `mealType` still pass).
  const filterOpts = {
    ...(target?.recipeId && { excludeRecipeId: target.recipeId }),
    ...(target?.mealType && { slotType: target.mealType }),
  };
  const mineFiltered = mineQuery.data && filterReplaceCandidates(mineQuery.data, filterOpts);
  const allFiltered = allQuery.data && filterReplaceCandidates(allQuery.data, filterOpts);
  const sections = buildPickerSections(mineFiltered, allFiltered, target?.mealType);
  // UX-PLAN-05: the safety check is said once, in the header — not as the same
  // pill on every row. Only a row that passed fewer rules keeps its own chip.
  const safetyHeader = pickerSafetyHeader(
    (allFiltered ?? []).map((r) => ({ id: r.id, verified: verifiedLabels(r.safetyChecks) })),
  );
  const safetyHeaderText = pickerSafetyHeaderText(safetyHeader.labels);
  const isLoading = mineQuery.isLoading || allQuery.isLoading;
  // UX-X-12: nothing to show because a load FAILED is not "No recipes match".
  const loadFailed =
    (mineQuery.isError && mineQuery.data === undefined) ||
    (allQuery.isError && allQuery.data === undefined);
  const retryLoad = () => {
    if (mineQuery.isError) void mineQuery.refetch();
    if (allQuery.isError) void allQuery.refetch();
  };
  // T-00.11 (B-34/B-46): replaceRecipe rejects an unsafe recipe with
  // FORBIDDEN — offer "Use anyway" only for the user's own recipe, the only
  // case the server's acknowledgeConflict honours.
  const isOwnAttempt = Boolean(
    lastAttemptedId && mineQuery.data?.some((r) => r.id === lastAttemptedId),
  );
  const canAcknowledge =
    (replaceMutation.error?.data?.code === 'FORBIDDEN' ||
      (sideFailure?.kind === 'conflict' && sideFailure.canAcknowledge)) &&
    isOwnAttempt &&
    lastAttemptedId !== null;

  /** FB7-04: put `recipeId` next to the slot's meal (a second dish of its type). */
  const addAsSide = (recipeId: string, acknowledgeConflict = false) => {
    if (!target?.side) return;
    addSideMutation.mutate({
      recipeId,
      weekOffset: target.side.weekOffset,
      dayOfWeek: target.dayOfWeek,
      mealType: target.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
      mode: 'add',
      ...(acknowledgeConflict && { acknowledgeConflict }),
    });
  };

  const handleClose = () => {
    replaceMutation.reset();
    swapMutation.reset();
    addSideMutation.reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={isSide ? PLAN_MEAL_MENU_COPY.addSide : 'Replace meal'}
      description={isSide && target ? `Next to ${target.mealName}` : target?.mealName}
      footer={
        isPremium === true && !isSide ? (
          <button
            type="button"
            data-testid="picker-ai-swap"
            disabled={busy}
            onClick={() => {
              if (!target) return;
              // Premium-only button: always an AI call — ask first (5.1.2(i)).
              requestAiConsent('meal-swap', () =>
                swapMutation.mutate({
                  planId: target.planId,
                  dayOfWeek: target.dayOfWeek,
                  mealType: target.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
                  slotIndex: target.slotIndex,
                }),
              );
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
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-600">{error.replace(/^UNSAFE_FOR_TABLE:\s*/, '')}</p>
            {canAcknowledge && (
              <button
                type="button"
                data-testid="picker-use-anyway"
                disabled={busy}
                onClick={() => {
                  if (!target || !lastAttemptedId) return;
                  if (isSide) {
                    addAsSide(lastAttemptedId, true);
                    return;
                  }
                  replaceMutation.mutate({
                    planId: target.planId,
                    dayOfWeek: target.dayOfWeek,
                    mealType: target.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
                    slotIndex: target.slotIndex,
                    recipeId: lastAttemptedId,
                    acknowledgeConflict: true,
                  });
                }}
                className="mt-1 text-xs font-semibold text-red-700 underline disabled:opacity-50"
              >
                Use anyway
              </button>
            )}
          </div>
        )}

        {safetyHeaderText && (
          <p
            data-testid="picker-checked-header"
            className="flex items-center gap-1.5 text-sm text-gray-600"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#944a00]" aria-hidden="true" />
            <span className="min-w-0">{safetyHeaderText}</span>
          </p>
        )}

        {/* T-02.5/AC7: how many `forTable` results the safety filter hid. */}
        {hiddenQuery.data && hiddenQuery.data.hiddenCount > 0 && (
          <FilteredForLine
            filters={hiddenQuery.data.filteredFor.join(' + ')}
            hiddenCount={hiddenQuery.data.hiddenCount}
          />
        )}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">Loading recipes…</p>
        ) : sections.length === 0 && loadFailed ? (
          <div data-testid="replace-load-error" className="py-4">
            <ErrorState title="Couldn't load recipes" onRetry={retryLoad} />
          </div>
        ) : sections.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No recipes match your search.</p>
        ) : (
          sections.map((section) => {
            // T-02.4: "Checked for …" only applies to the broader/curated
            // list — "Your recipes" can include the user's own unsafe dish
            // (kept visible on purpose, see mineQuery's comment above).
            const isAllSection = section.title === 'All recipes';
            return (
              <div key={section.title}>
                <h3 className="pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {section.title}
                </h3>
                <ul className="flex flex-col gap-2">
                  {section.data.map((recipe) => {
                    const n = recipe.nutritionInfo as { calories: number; protein?: number };
                    return (
                      <li key={recipe.id}>
                        <button
                          type="button"
                          data-testid={`picker-recipe-${recipe.id}`}
                          aria-label={`Use ${recipe.name}`}
                          disabled={busy}
                          onClick={() => {
                            if (!target) return;
                            setLastAttemptedId(recipe.id);
                            if (isSide) {
                              sideName.current = recipe.name;
                              addAsSide(recipe.id);
                              return;
                            }
                            replaceMutation.mutate({
                              planId: target.planId,
                              dayOfWeek: target.dayOfWeek,
                              mealType: target.mealType as
                                | 'breakfast'
                                | 'lunch'
                                | 'dinner'
                                | 'snack',
                              slotIndex: target.slotIndex,
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
                            <p className="line-clamp-2 text-sm font-medium text-gray-900">
                              {recipe.name}
                            </p>
                            <p
                              data-testid={`picker-recipe-${recipe.id}-meta`}
                              className="text-xs text-gray-500"
                            >
                              {pickerRowMeta({
                                ...recipe,
                                // WP-08: protein-only mode lists protein, never kcal.
                                nutritionInfo: proteinOnly ? { protein: n.protein ?? null } : n,
                              })}
                            </p>
                          </div>
                          {recipe.isFavourite && (
                            <Heart
                              className="h-3.5 w-3.5 shrink-0 fill-[#944a00] text-[#944a00]"
                              aria-hidden="true"
                            />
                          )}
                          {isAllSection && safetyHeader.partialIds.has(recipe.id) && (
                            <CheckedForChip labels={verifiedLabels(recipe.safetyChecks)} />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </Sheet>
  );
}
