'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { useAiConsent } from '@/features/ai-consent/AiConsentProvider';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { AiGeneratedChip } from '@/features/privacy/components/AiGeneratedChip';
import { StarRatingWidget } from '@/features/recipe/components/StarRatingWidget';
import { AddToWeekSheet, type AddToWeekResult } from '@/features/recipes/components/AddToWeekSheet';
import { AllergenWarningBanner } from '@/features/recipes/components/AllergenWarning';
import { RecipeDetailImage } from '@/features/recipes/components/RecipeDetailImage';
import { RecipeImage } from '@/features/recipes/components/RecipeImage';
import { RecipeNutritionPanel } from '@/features/recipes/components/RecipeNutritionPanel';
import { writeRecipeDeleteUndo } from '@/features/recipes/lib/recipe-delete-undo';
import { CheckedForLine } from '@/features/safety/components/CheckedForLine';
import { ReportSafetySheet } from '@/features/safety/components/ReportSafetySheet';
import { WhatWeCheckSheet } from '@/features/safety/components/WhatWeCheckSheet';
import { useCookingFor } from '@/hooks/useCookingFor';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useHousehold } from '@/hooks/useHousehold';
import { useIsPremium } from '@/hooks/useIsPremium';
import { useUnitSystem } from '@/hooks/useUnitSystem';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import {
  ArrowLeft,
  CalendarPlus,
  ChefHat,
  Clock,
  Copy,
  Flag,
  Flame,
  Heart,
  Library,
  ListPlus,
  Pencil,
  Pin,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import { FRIENDS_COPY } from '@chefer/types';
import { ErrorState, Sheet, Toast } from '@chefer/ui';
import {
  aiConsentRequiredFor,
  chunkShoppingLines,
  clampCookServings,
  defaultCookServings,
  formatFractionalQuantity,
  formatPortion,
  formatScaledQuantity,
  isNotFoundError,
  labelCaveatLineText,
  recipeShareText,
  reportSentSnackbarText,
  scaleNutrition,
  shoppingLinesFor,
  slotPortion,
  sourceDomainOf,
  tableBreakdown,
  userFacingErrorMessage,
  weekdayShortName,
} from '@chefer/utils';

// Swap-undo handoff (review F-2): the swap navigates to the NEW recipe's page,
// so the undo offer travels through sessionStorage and is only honoured
// briefly and for the exact same plan slot.
const SWAP_UNDO_KEY = 'chefer.last-swap';
const SWAP_UNDO_WINDOW_MS = 15_000;

interface SwapUndoEntry {
  planId: string;
  day: string;
  meal: string;
  /** The slot's index in `day.meals` (two-snack days); absent = first of `meal`. */
  slot?: number | undefined;
  prevId: string;
  ts: number;
}

function readSwapUndo(
  planId: string | null,
  day: string | null,
  meal: string | null,
  slot: number | undefined,
) {
  if (typeof window === 'undefined' || !planId) return null;
  try {
    const raw = sessionStorage.getItem(SWAP_UNDO_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as SwapUndoEntry;
    if (
      entry.planId !== planId ||
      entry.day !== day ||
      entry.meal !== meal ||
      entry.slot !== slot ||
      Date.now() - entry.ts > SWAP_UNDO_WINDOW_MS
    ) {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MEAL_COLOURS: Record<string, string> = {
  breakfast: 'bg-emerald-100 text-emerald-700',
  lunch: 'bg-orange-100 text-orange-700',
  dinner: 'bg-indigo-100 text-indigo-700',
  snack: 'bg-purple-100 text-purple-700',
};

/** `?slot=` — the plan slot's index in `day.meals`; undefined when absent or invalid. */
function parseSlotIndex(raw: string | null): number | undefined {
  if (raw === null || !/^\d{1,2}$/.test(raw)) return undefined;
  return parseInt(raw, 10);
}

/**
 * Cook-mode query: the meal type, for a portioned plan slot its portion, and
 * (UX-COOK-05) the servings the stepper was set to — only when it was touched.
 */
function cookQuery(meal: string | null, portion: number, servings: number | null): string {
  const params = new URLSearchParams();
  if (meal) params.set('meal', meal);
  if (portion !== 1) params.set('portion', String(portion));
  if (servings !== null) params.set('servings', String(servings));
  const query = params.toString();
  return query ? `?${query}` : '';
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface RecipePageProps {
  params: Promise<{ id: string }>;
}

export default function RecipeDetailPage({ params }: RecipePageProps) {
  const { id } = use(params);
  const hasMounted = useHasMounted();
  const router = useRouter();
  const searchParams = useSearchParams();
  const unitSystem = useUnitSystem();
  const isPremium = useIsPremium();
  const requestAiConsent = useAiConsent();

  const planId = searchParams.get('planId');
  const day = searchParams.get('day');
  const meal = searchParams.get('meal');
  // Which slot of `meal` this is — a curated day can hold two snacks.
  const slotIndex = parseSlotIndex(searchParams.get('slot'));
  const slotQuery = slotIndex !== undefined ? `&slot=${slotIndex}` : '';
  // P1-1: the plan slot's portion (servings of this recipe), when not 1×.
  const planPortion = slotPortion(parseFloat(searchParams.get('portion') ?? ''));
  const dayParam = day !== null ? parseInt(day, 10) : null;

  const hasSwapContext = Boolean(planId && day !== null && meal);

  // ── Context label ──────────────────────────────────────────────────────────
  const dayLabel = dayParam !== null ? (DAY_NAMES[dayParam] ?? '') : '';
  const mealLabel = meal ? meal.charAt(0).toUpperCase() + meal.slice(1) : '';
  const contextLabel = dayLabel && mealLabel ? `${mealLabel} · ${dayLabel}` : '';

  const recipeQuery = trpc.mealPlan.getRecipe.useQuery({ recipeId: id });
  const { data: recipe, isLoading, isError } = recipeQuery;
  const { data: savedData } = trpc.recipe.isSaved.useQuery({ recipeId: id });
  const { data: myRating } = trpc.recipe.getMyRating.useQuery({ recipeId: id });
  // T-02.3: a separate, additive query (mealPlan.getRecipe is another
  // lane's file this wave) — null when the table has nothing to check.
  const { data: safetyData } = trpc.recipe.getSafetyChecks.useQuery({ recipeId: id });
  const { data: table } = trpc.safety.getTable.useQuery();
  const isSaved = savedData?.isSaved ?? false;
  const [whatWeCheckOpen, setWhatWeCheckOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportedToast, setReportedToast] = useState(false);
  // UX-REC-04: owner Delete (soft) + Share.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  // UX-REC-08: Add to my week (with Undo) and Add ingredients to the shopping list.
  const [addToWeekOpen, setAddToWeekOpen] = useState(false);
  const [weekToast, setWeekToast] = useState<{
    message: string;
    type: 'success' | 'error';
    undo?: () => void;
  } | null>(null);
  const [addingToList, setAddingToList] = useState(false);

  const utils = trpc.useUtils();

  const deleteMine = trpc.recipe.deleteMine.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      // The Undo toast lives on the cookbook, which this page navigates to.
      writeRecipeDeleteUndo({ recipeId: id, name: recipe?.name ?? 'Recipe' });
      void utils.recipe.list.invalidate();
      void utils.mealPlan.getForWeek.invalidate();
      setDeleteOpen(false);
      router.push('/recipes');
    },
  });

  const undoAddToWeek = trpc.recipe.undoAddToWeek.useMutation({ meta: { silent: true } });
  const addShopping = trpc.shoppingList.addCustomItems.useMutation({ meta: { silent: true } });

  const toggleFav = trpc.recipe.toggleFavourite.useMutation({
    onSuccess: () => {
      void utils.recipe.isSaved.invalidate({ recipeId: id });
      void utils.recipe.list.invalidate();
      void utils.dashboard.summary.invalidate();
    },
  });

  // Pin for next plan (P1-1's producer side — generation reads this flag).
  const isPinned = savedData?.useInNextPlan ?? false;
  const togglePin = trpc.recipe.toggleUseInNextPlan.useMutation({
    onSuccess: (data) => {
      capture('recipe_pinned', { pinned: data.useInNextPlan });
      void utils.recipe.isSaved.invalidate({ recipeId: id });
    },
  });

  const swapMutation = trpc.mealPlan.swapRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (newRecipe) => {
      capture('meal_swapped', { tier: isPremium ? 'premium' : 'free' });
      void utils.mealPlan.getForWeek.invalidate();
      void utils.mealPlan.getActive.invalidate();
      // Offer undo on the destination page (F-2): the swap itself is instant
      // and unconfirmed, so a mis-tap needs a way back to the old recipe.
      if (planId && day !== null && meal) {
        const entry: SwapUndoEntry = {
          planId,
          day,
          meal,
          slot: slotIndex,
          prevId: id,
          ts: Date.now(),
        };
        sessionStorage.setItem(SWAP_UNDO_KEY, JSON.stringify(entry));
      }
      router.push(`/recipes/${newRecipe.id}?planId=${planId}&day=${day}&meal=${meal}${slotQuery}`);
    },
    onError: (err) => {
      console.error('Swap recipe failed:', err.message);
    },
  });

  // Swap-undo toast: shown when this page was just navigated to by a swap.
  // Read in an effect (not the render) so the hydration render stays
  // byte-identical to SSR — this page sits under a route-level loading.tsx
  // (the React #418 pattern from prod-followups #1).
  const [swapUndo, setSwapUndo] = useState<SwapUndoEntry | null>(null);
  useEffect(() => {
    const entry = readSwapUndo(planId, day, meal, slotIndex);
    if (entry) {
      sessionStorage.removeItem(SWAP_UNDO_KEY);
      setSwapUndo(entry);
    }
  }, [planId, day, meal, slotIndex]);
  const undoMutation = trpc.mealPlan.replaceRecipe.useMutation({
    onSuccess: (restored) => {
      void utils.mealPlan.getForWeek.invalidate();
      void utils.mealPlan.getActive.invalidate();
      router.push(`/recipes/${restored.id}?planId=${planId}&day=${day}&meal=${meal}${slotQuery}`);
    },
  });

  const replaceMutation = trpc.mealPlan.replaceRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (newRecipe) => {
      void utils.mealPlan.getForWeek.invalidate();
      void utils.mealPlan.getActive.invalidate();
      setShowPicker(false);
      router.push(`/recipes/${newRecipe.id}?planId=${planId}&day=${day}&meal=${meal}${slotQuery}`);
    },
  });

  // Servings adjuster. F2: with household members it defaults to the whole
  // table's portion sum — the count generation scaled the plan's recipes to.
  const { portionSum, peopleCount, tablePortions, scaledMembers } = useHousehold();
  const cookingFor = useCookingFor();
  const [servings, setServings] = useState<number | null>(null);
  const baseServings = recipe?.servings ?? 1;
  // P1-1: opened from a portioned plan slot, quantities start at that
  // portion (it composes with the household portion sum, never replaces it).
  const defaultServings = defaultCookServings(baseServings, scaledMembers, planPortion, cookingFor);
  const selectedServings = servings ?? defaultServings;
  const tableLine = scaledMembers ? tableBreakdown(planPortion, scaledMembers) : null;
  const scale = selectedServings / baseServings;

  /** The native share sheet where there is one, else the clipboard. */
  const shareRecipe = async () => {
    if (!recipe) return;
    const text = recipeShareText(
      {
        name: recipe.name,
        description: recipe.description,
        servings: recipe.servings,
        sourceUrl: recipe.sourceUrl,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
      },
      unitSystem,
    );
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: recipe.name, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareToast('Recipe copied to the clipboard.');
    } catch {
      // A dismissed share sheet rejects — nothing to report.
    }
  };

  // Saved-recipe picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // ── Back destination ───────────────────────────────────────────────────────
  const backHref = planId ? '/meal-plan' : '/recipes';
  const backLabel = planId ? 'Back to Meal Planner' : 'Back to Recipes';

  // ── Loading ────────────────────────────────────────────────────────────────
  // `!hasMounted` keeps the hydration render identical to the SSR HTML even
  // when the shared query cache already holds this recipe (this page hydrates
  // lazily under its loading.tsx boundary — see useHasMounted).
  if (!hasMounted || isLoading) {
    return (
      <div className="mx-auto max-w-3xl animate-pulse px-4 py-6 sm:px-6 sm:py-8">
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

  // UX-REC-03: a failed LOAD is not "Recipe not found" — only a real
  // NOT_FOUND says that. Everything else offers Try again.
  if (isError && !recipe && !isNotFoundError(recipeQuery.error)) {
    return (
      <div
        data-testid="recipe-load-error"
        className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 text-center"
      >
        <ErrorState
          title="Couldn't load this recipe"
          onRetry={() => void recipeQuery.refetch()}
          retrying={recipeQuery.isRefetching}
        />
        <Link
          href={backHref}
          className="mt-4 inline-flex min-h-11 items-center text-sm text-[#944a00] hover:underline"
        >
          {backLabel}
        </Link>
      </div>
    );
  }

  if (isError || !recipe) {
    return (
      <div
        data-testid="recipe-not-found"
        className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 text-center"
      >
        <p className="text-gray-500">Recipe not found.</p>
        <Link
          href={backHref}
          className="mt-4 inline-flex min-h-11 items-center text-sm text-[#944a00] hover:underline"
        >
          {backLabel}
        </Link>
      </div>
    );
  }

  const totalTime = recipe.prepTimeMins + recipe.cookTimeMins;
  const { nutritionInfo: n } = recipe;

  /** "Added to Tue lunch" with Undo, which restores a replaced slot too. */
  const onAddedToWeek = (result: AddToWeekResult) => {
    setWeekToast({
      message: FRIENDS_COPY.addToWeek.done(weekdayShortName(result.dayOfWeek), result.mealType),
      type: 'success',
      undo: () => {
        setWeekToast(null);
        undoAddToWeek.mutate(
          {
            planId: result.planId,
            dayOfWeek: result.dayOfWeek,
            mealType: result.mealType,
            slotIndex: result.slotIndex,
            addedRecipeId: result.addedRecipeId,
            ...(result.previousRecipeId ? { previousRecipeId: result.previousRecipeId } : {}),
            ...(result.previousPinned !== undefined
              ? { previousPinned: result.previousPinned }
              : {}),
          },
          {
            onSuccess: () => {
              void utils.mealPlan.getForWeek.invalidate();
              void utils.dashboard.summary.invalidate();
            },
            onError: () => setWeekToast({ message: FRIENDS_COPY.relation.error, type: 'error' }),
          },
        );
      },
    });
  };

  /** Adds the ingredients (scaled to the stepper) to this week's shopping list. */
  const addToShoppingList = async () => {
    setAddingToList(true);
    try {
      const plan = await utils.mealPlan.getForWeek.fetch({ weekOffset: 0 });
      if (!plan) {
        setWeekToast({
          message: 'Make a plan first, then add ingredients to its list.',
          type: 'error',
        });
        return;
      }
      const lines = shoppingLinesFor(recipe.ingredients, selectedServings, recipe.servings);
      for (const items of chunkShoppingLines(lines)) {
        await addShopping.mutateAsync({ planId: plan.planId, items });
      }
      void utils.shoppingList.getForWeek.invalidate();
      setWeekToast({
        message: `Added ${lines.length} ingredient${lines.length === 1 ? '' : 's'} to your shopping list`,
        type: 'success',
      });
    } catch (error) {
      setWeekToast({
        message: userFacingErrorMessage(error, 'Couldn’t add them to the list. Try again.'),
        type: 'error',
      });
    } finally {
      setAddingToList(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Back link + context label row */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="flex min-h-11 shrink-0 items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {/* Full label plus the context pill overflows a 375px row */}
          <span className="sm:hidden">Back</span>
          <span className="hidden sm:inline">{backLabel}</span>
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
      <div className="relative mb-6 h-48 w-full overflow-hidden rounded-2xl sm:h-56 lg:h-72">
        <RecipeDetailImage
          recipeId={id}
          recipeName={recipe.name}
          initialImageUrl={recipe.imageUrl ?? null}
          initialImageStatus={recipe.imageStatus ?? 'DONE'}
          className="h-full w-full"
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
          {/* R-14 (Art. 50): AI-generated recipes carry the same label as plan cards. */}
          <AiGeneratedChip recipe={recipe} className="mt-1" />
          <p className="mt-1 text-sm text-gray-500">{recipe.description}</p>
          {/* UX-REC-07: an imported recipe (a video included) links back to where it came from. */}
          {recipe.sourceUrl && sourceDomainOf(recipe.sourceUrl) ? (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="recipe-source"
              className="mt-1 inline-flex min-h-11 items-center text-sm text-[#944a00] underline"
            >
              Source: {sourceDomainOf(recipe.sourceUrl)}
            </a>
          ) : null}
          {recipe.deleted ? (
            <p
              data-testid="recipe-deleted-banner"
              className="mt-2 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-800"
            >
              This recipe was deleted. It stays in the plan slots that already use it.
            </p>
          ) : null}
          <AllergenWarningBanner
            warnings={recipe.allergenWarnings}
            details={safetyData?.safetyChecks?.conflictDetails}
            className="mt-3"
          />
          {/* T-02.3 AC3: never both — only shows when the conflict banner
              above isn't already showing one. */}
          {(recipe.allergenWarnings?.length ?? 0) === 0 && safetyData?.safetyChecks ? (
            <CheckedForLine
              checks={safetyData.safetyChecks}
              onOpenSheet={() => setWhatWeCheckOpen(true)}
              className="mt-3"
            />
          ) : null}
          {safetyData?.safetyChecks?.labelCaveats &&
          safetyData.safetyChecks.labelCaveats.length > 0 ? (
            <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              {labelCaveatLineText(safetyData.safetyChecks.labelCaveats.map((c) => c.ingredient))}
            </p>
          ) : null}
        </div>

        {/* Action buttons — up to three ~110px buttons wrap raggedly on a
            phone; a two-up grid keeps them even. */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          {/* Save button */}
          <button
            onClick={() => toggleFav.mutate({ recipeId: id })}
            disabled={toggleFav.isPending}
            className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium min-h-11 sm:min-h-0 shadow-sm transition-colors ${
              isSaved
                ? 'border-[#944a00]/30 bg-[#fff3e8] text-[#944a00]'
                : 'border-gray-200 bg-white text-gray-600 hover:border-[#944a00]/30 hover:text-[#944a00]'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isSaved ? 'fill-[#944a00]' : ''}`} />
            {isSaved ? 'Saved' : 'Save'}
          </button>

          {/* Owner dogfood 2026-09-30: your own recipes are editable from
              the recipe page itself. */}
          {savedData?.canEdit ? (
            <Link
              href={`/recipes/${id}/edit`}
              data-testid="recipe-edit"
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:border-[#944a00]/30 hover:text-[#944a00]"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>
          ) : null}

          {/* UX-REC-08: any recipe can go on your week or its ingredients on the list. */}
          {!recipe.deleted ? (
            <button
              type="button"
              data-testid="recipe-add-to-week"
              onClick={() => setAddToWeekOpen(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:border-[#944a00]/30 hover:text-[#944a00]"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Add to my week
            </button>
          ) : null}
          <button
            type="button"
            data-testid="recipe-add-to-list"
            disabled={addingToList}
            onClick={() => void addToShoppingList()}
            className="flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:border-[#944a00]/30 hover:text-[#944a00] disabled:opacity-60"
          >
            <ListPlus className="h-3.5 w-3.5" />
            {addingToList ? 'Adding…' : 'Add ingredients to list'}
          </button>

          {/* UX-REC-04: Duplicate opens the create form prefilled as "Copy of …". */}
          {savedData?.canEdit ? (
            <Link
              href={`/recipes/new?duplicateOf=${encodeURIComponent(id)}`}
              data-testid="recipe-duplicate"
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:border-[#944a00]/30 hover:text-[#944a00]"
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </Link>
          ) : null}

          {/* UX-REC-04: Share for every recipe, Delete (with Undo) on your own. */}
          <button
            type="button"
            data-testid="recipe-share"
            onClick={() => void shareRecipe()}
            className="flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:border-[#944a00]/30 hover:text-[#944a00]"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
          {savedData?.canEdit ? (
            <button
              type="button"
              data-testid="recipe-delete"
              onClick={() => {
                deleteMine.reset();
                setDeleteOpen(true);
              }}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:border-red-300 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          ) : null}

          {/* UX-01 (d), T-01.5: report a safety problem — hides this recipe
              from the reporter's plans, swaps and suggestions at once. */}
          <button
            onClick={() => setReportOpen(true)}
            aria-label="Report a safety problem"
            className="flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:border-red-300 hover:text-red-700"
          >
            <Flag className="h-3.5 w-3.5" />
            Report
          </button>

          {/* Cook mode (P1-3) — the primary action on a recipe you're about to make */}
          <Link
            href={`/recipes/${id}/cook${cookQuery(meal, planPortion, servings === null ? null : selectedServings)}`}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-[#944a00] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#7a3d00]"
          >
            <ChefHat className="h-3.5 w-3.5" />
            Cook
          </Link>

          {/* Pin for the next generated plan — only meaningful once saved */}
          {isSaved && (
            <button
              onClick={() => togglePin.mutate({ recipeId: id, useInNextPlan: !isPinned })}
              disabled={togglePin.isPending}
              title="Pinned recipes are guaranteed a slot in your next generated plan"
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium shadow-sm disabled:opacity-60 ${
                isPinned
                  ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-[#944a00]/30 hover:text-[#944a00]'
              }`}
            >
              <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-[#944a00]' : ''}`} />
              {isPinned ? 'Pinned for next plan' : 'Pin for next plan'}
            </button>
          )}

          {/* Meal-plan action buttons — only when accessed from the planner */}
          {hasSwapContext && (
            <>
              {/* Choose a recipe from saved or my recipes */}
              <button
                onClick={() => setShowPicker(true)}
                disabled={replaceMutation.isPending}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:border-[#944a00]/30 hover:text-[#944a00] disabled:opacity-60"
              >
                <Library className="h-3.5 w-3.5" />
                Choose Recipe
              </button>

              {/* AI Swap */}
              <button
                onClick={() => {
                  if (planId && day !== null && meal) {
                    // Premium swaps call the AI — ask first (App Store 5.1.2(i)).
                    requestAiConsent(
                      'meal-swap',
                      () =>
                        swapMutation.mutate({
                          planId,
                          dayOfWeek: parseInt(day, 10),
                          mealType: meal as 'breakfast' | 'lunch' | 'dinner' | 'snack',
                          slotIndex,
                        }),
                      { usesAi: aiConsentRequiredFor('meal-swap', isPremium) },
                    );
                  }
                }}
                disabled={swapMutation.isPending}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[#944a00]/30 bg-white px-3 py-2 text-xs font-medium text-[#944a00] shadow-sm hover:bg-[#fff3e8] disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${swapMutation.isPending ? 'animate-spin' : ''}`}
                />
                {swapMutation.isPending ? 'Swapping…' : 'Swap Recipe'}
              </button>
              {swapMutation.isError && (
                <p className="w-full text-center text-xs text-red-500">
                  {userFacingErrorMessage(swapMutation.error, 'Swap failed. Please try again.')}
                </p>
              )}

              {/* Swap touchpoint (PW-2): free swaps draw from the curated
                  pool — the moment of need for the AI alternative. */}
              {isPremium === false && (
                <span className="flex w-full items-center justify-center gap-2 pt-1 text-xs text-gray-500">
                  Free swaps pick from the chef-curated pool.
                  <UpgradeButton className="px-2 py-1 text-xs" source="swap" />
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-3 divide-x rounded-xl border bg-white">
        <Stat
          icon={<Clock className="h-4 w-4 text-gray-500" />}
          label="Total time"
          value={`${totalTime} min`}
        />
        <Stat
          icon={<Users className="h-4 w-4 text-gray-500" />}
          label="Servings"
          value={formatFractionalQuantity(selectedServings)}
        />
        <Stat
          icon={<Flame className="h-4 w-4 text-[#944a00]" />}
          label="Calories"
          value={`${n.calories} kcal`}
        />
      </div>

      {/* F2: per-person framing when a household is set up. Free tables keep
          the recipe as written — scaling is premium (P2-3). */}
      {portionSum === null && tablePortions !== null && (
        <p className="-mt-6 mb-8 flex items-center gap-1.5 text-xs text-gray-500">
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            Everyone&apos;s allergies at your table of {peopleCount} are checked. Premium scales the
            quantities to all of you — use the servings control to adjust by hand.
          </span>
        </p>
      )}
      {portionSum !== null && (
        <p className="-mt-6 mb-8 flex items-center gap-1.5 text-xs text-gray-500">
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            Quantities are set for your household of {peopleCount}
            {tableLine ? ` (${tableLine})` : ''}
            {selectedServings !== defaultServings
              ? ` — adjusted to ${formatFractionalQuantity(selectedServings)} servings`
              : ''}
            . Nutrition facts stay per serving.
          </span>
        </p>
      )}

      {/* P1-1: the plan sized this slot to the day's targets */}
      {planPortion !== 1 && (
        <p
          data-testid="plan-portion-note"
          className="-mt-6 mb-8 rounded-xl bg-[#fff3e8] px-3 py-2 text-xs text-[#944a00]"
        >
          Your plan has a <strong>{formatPortion(planPortion)} portion</strong> here —{' '}
          {scaleNutrition(n, planPortion).calories} kcal ·{' '}
          {Math.round(scaleNutrition(n, planPortion).protein)} g protein. Quantities start at it.
        </p>
      )}

      {/* Macros — no Fiber (D-18) */}
      <div className="mb-8 grid grid-cols-3 gap-3">
        <MacroChip label="Protein" value={n.protein} />
        <MacroChip label="Carbs" value={n.carbs} />
        <MacroChip label="Fat" value={n.fat} />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-8 md:grid-cols-[280px_1fr]">
        {/* Ingredients */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-gray-900">Ingredients</h2>
            {/* Servings adjuster — was 20x20px per button */}
            <div className="flex items-center gap-1 rounded-xl border px-1">
              <button
                onClick={() => setServings(clampCookServings(selectedServings - 1))}
                aria-label="Decrease servings"
                className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-gray-600 hover:bg-gray-100"
              >
                −
              </button>
              <span aria-live="polite" className="w-8 text-center text-sm font-medium tabular-nums">
                {formatFractionalQuantity(selectedServings)}
              </span>
              <button
                onClick={() => setServings(clampCookServings(selectedServings + 1))}
                aria-label="Increase servings"
                className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-gray-600 hover:bg-gray-100"
              >
                +
              </button>
            </div>
          </div>
          {/* UX-REC-11: say what the stepper changed, with the totals. */}
          {selectedServings !== baseServings ? (
            <p data-testid="recipe-servings-note" className="mb-3 text-xs text-gray-500">
              Cooking for {formatFractionalQuantity(selectedServings)} (recipe makes {baseServings})
              — amounts are scaled
              {n.calories > 0
                ? `; about ${Math.round(scaleNutrition(n, selectedServings).calories)} kcal and ${Math.round(scaleNutrition(n, selectedServings).protein)} g protein in total.`
                : '.'}
            </p>
          ) : null}
          <ul className="space-y-2">
            {recipe.ingredients.map((ing, i) => {
              return (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="shrink-0 font-medium text-gray-900">
                    {formatScaledQuantity(ing.quantity, ing.unit, scale, unitSystem)}
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

      {/* Nutrition Facts + how they were computed (plan-ingredient-catalog §10) */}
      <RecipeNutritionPanel recipe={recipe} recipeId={id} canEdit={savedData?.canEdit ?? false} />

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
            {userFacingErrorMessage(swapMutation.error, 'Failed to swap recipe. Please try again.')}
          </p>
          <button
            onClick={() => swapMutation.reset()}
            className="touch-target relative text-xs text-red-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Replace error */}
      {replaceMutation.isError && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">
            {userFacingErrorMessage(
              replaceMutation.error,
              'Failed to replace recipe. Please try again.',
            )}
          </p>
          <button
            onClick={() => replaceMutation.reset()}
            className="touch-target relative text-xs text-red-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Swap undo (F-2): brief window to restore the replaced recipe */}
      {swapUndo && planId && dayParam !== null && meal && (
        <Toast
          message="Meal swapped."
          duration={6000}
          onClose={() => setSwapUndo(null)}
          action={{
            label: undoMutation.isPending ? 'Undoing…' : 'Undo',
            onClick: () => {
              if (undoMutation.isPending) return;
              undoMutation.mutate({
                planId,
                dayOfWeek: dayParam,
                mealType: meal as 'breakfast' | 'lunch' | 'dinner' | 'snack',
                slotIndex,
                recipeId: swapUndo.prevId,
              });
              setSwapUndo(null);
            },
          }}
        />
      )}

      {/* T-02.2 sheet + T-01.5 report sheet */}
      {table && (
        <WhatWeCheckSheet
          open={whatWeCheckOpen}
          onClose={() => setWhatWeCheckOpen(false)}
          table={table}
        />
      )}
      <Sheet
        open={deleteOpen}
        onClose={() => {
          if (!deleteMine.isPending) setDeleteOpen(false);
        }}
        title="Delete this recipe?"
        description={`“${recipe.name}” will be removed from your cookbook, lists and suggestions. Plan slots that already use it keep it. You can undo right after.`}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={deleteMine.isPending}
              onClick={() => setDeleteOpen(false)}
              className="min-h-11 rounded-xl border bg-white px-5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Keep it
            </button>
            <button
              type="button"
              data-testid="recipe-delete-confirm"
              disabled={deleteMine.isPending}
              onClick={() => deleteMine.mutate({ recipeId: id })}
              className="min-h-11 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleteMine.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        }
      >
        {deleteMine.isError ? (
          <p role="alert" data-testid="recipe-delete-error" className="text-sm text-red-600">
            {userFacingErrorMessage(deleteMine.error, 'Couldn’t delete the recipe. Try again.')}
          </p>
        ) : null}
      </Sheet>
      {shareToast ? <Toast message={shareToast} onClose={() => setShareToast(null)} /> : null}
      {weekToast ? (
        <Toast
          message={weekToast.message}
          type={weekToast.type}
          duration={weekToast.undo ? 10_000 : 4_000}
          onClose={() => setWeekToast(null)}
          {...(weekToast.undo ? { action: { label: 'Undo', onClick: weekToast.undo } } : {})}
        />
      ) : null}
      <AddToWeekSheet
        open={addToWeekOpen}
        onClose={() => setAddToWeekOpen(false)}
        recipe={{ id, name: recipe.name, kcal: n.calories }}
        onAdded={onAddedToWeek}
      />
      <ReportSafetySheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        recipeId={id}
        recipeName={recipe.name}
        surface="recipe_detail"
        onSent={() => setReportedToast(true)}
      />
      {reportedToast && (
        <Toast
          message={reportSentSnackbarText(recipe.name)}
          onClose={() => setReportedToast(false)}
        />
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
              slotIndex,
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
    <Sheet
      open
      onClose={onClose}
      title="Choose a Recipe"
      description={
        contextLabel ? (
          <>
            Replacing <span className="font-medium text-[#944a00]">{contextLabel}</span>
          </>
        ) : undefined
      }
      footer={
        <p className="text-center text-xs text-gray-500">
          {combined.length > 0
            ? `${combined.length} recipe${combined.length === 1 ? '' : 's'} · saved & yours`
            : 'Save or create recipes to use them here'}
        </p>
      }
    >
      <div className="flex h-full flex-col">
        {/* Search */}
        <div className="border-y px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-500" />
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
              <p className="text-xs text-gray-500">
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
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#fff3e8] disabled:opacity-60"
                  >
                    {/* Thumbnail */}
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                      <RecipeImage
                        imageUrl={r.imageUrl ?? null}
                        imageStatus={r.imageStatus ?? 'DONE'}
                        recipeName={r.name}
                        className="h-full w-full"
                      />
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-gray-900">{r.name}</p>
                        {r._source === 'mine' && (
                          <span className="shrink-0 rounded-full bg-[#fff3e8] px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-[#944a00]">
                            Mine
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
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
      </div>
    </Sheet>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4">
      {icon}
      <span className="text-base font-semibold text-gray-900">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function MacroChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-gray-50 px-3 py-3 text-center">
      <p className="text-base font-bold text-gray-900">{value}g</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
