'use client';

import { useEffect, useRef, useState } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { capture } from '@/lib/analytics';
import { trackMealLogged } from '@/lib/analytics-events';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import {
  AlertTriangle,
  Barcode,
  Bookmark,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  Search,
} from 'lucide-react';
import {
  PACKAGED_PRODUCT_COPY,
  SAVED_MEALS_COPY,
  type PackagedProductView,
  type ProductAllergenWarning,
} from '@chefer/types';
import { Sheet } from '@chefer/ui';
import {
  checkMacroSanity,
  clampIngredientGrams,
  defaultMealSlot,
  estimateKcalFromProtein,
  formatNumber,
  formatPortion,
  formatQuickAddGrams,
  nutritionLabel,
  parseQuickAdd,
  productDisplayName,
  proteinLabel,
  QUICK_ADD_LIMITS,
  QUICK_ADD_MEAL_TYPES,
  savedMealSummary,
  userFacingErrorMessage,
  type QuickAddErrors,
  type QuickAddMealType,
  type SlotRef,
} from '@chefer/utils';
import { invalidateDayQueries } from '../lib/invalidate';
import {
  handleRebalanceOutcome,
  REBALANCE_PREVIEW,
  type DayFitLike,
} from '../lib/rebalance-storage';
import { ProductFlow } from './products/ProductFlow';

// ─── Search-first Log sheet (T-19.1, UX-19) ────────────────────────────────────
// Web counterpart of mobile's quick-add-sheet.tsx. Recent → This week's plan →
// Your recipes → Ingredients (per 100 g), in that order; "Enter calories
// yourself" is the old calories-only form, now gated by the macro sanity
// check (bug B-39, T-19.5). Packaged products (ADR 0005, which replaced B-29)
// are a separate search group and the "Scan barcode" view.

type IngredientSearchRow = RouterOutputs['ingredients']['search'][number];
type ProductStart = { product: PackagedProductView; warnings: ProductAllergenWarning[] };

export interface PlannedLogMeal {
  recipeId: string;
  recipeName: string;
  mealType: string;
  imageUrl: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  portion?: number;
  slotIndex?: number;
}

interface QuickAddSheetProps {
  /** YYYY-MM-DD day the entry is logged to. */
  date: string;
  onLogged: () => void;
  /** Today's planned meals — the "This week's plan" group. */
  plannedMeals?: PlannedLogMeal[];
  /**
   * WP-06 "Ate something else": the plan slot this sheet logs INSTEAD of. Every
   * entry it writes is a custom entry carrying `replacesSlot` (a recipe from
   * Recent or search is logged with its numbers, so the planned slot is
   * replaced rather than a second recipe ticked on it). The meal is the
   * slot's, so the meal chips and the plan group go.
   */
  replacesSlot?: SlotRef | undefined;
  /** Controlled open state — the slot flow opens this sheet from its own sheet. */
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Hide the "Log something" button (controlled use). */
  hideTrigger?: boolean | undefined;
  /** After a custom entry is logged: its id and name, for an Undo toast. */
  /** `dayFit`: today's open meals resized to absorb the log (the caller's toast says so). */
  onLoggedEntry?:
    | ((entry: { entryId: string; name: string; dayFit?: DayFitLike | null | undefined }) => void)
    | undefined;
  /** Lane A2: after a saved meal is logged — its new entry ids, for an Undo toast. */
  onLoggedEntries?:
    | ((logged: {
        entryIds: string[];
        name: string;
        dayFit?: DayFitLike | null | undefined;
      }) => void)
    | undefined;
}

const MEAL_OPTIONS = QUICK_ADD_MEAL_TYPES.map((v) => ({
  value: v,
  label: v.charAt(0).toUpperCase() + v.slice(1),
}));
const GRAM_CHIPS = [50, 100, 150, 200];
const SEARCH_DEBOUNCE_MS = 250;
// UX-FOOD-12: the ingredient group asks for the server's default page first,
// and "Show more" asks for a longer one.
const INGREDIENT_PAGE = 12;
const INGREDIENT_PAGE_MAX = 36;
const RECIPE_PORTIONS = [0.5, 0.75, 1, 1.5, 2];

function toQuickAddMealType(mealType: string): QuickAddMealType {
  return (QUICK_ADD_MEAL_TYPES as readonly string[]).includes(mealType)
    ? (mealType as QuickAddMealType)
    : 'snack';
}

function scaleFromPer100g(
  per100g: { calories: number; protein: number; carbs: number; fat: number },
  grams: number,
) {
  const factor = grams / 100;
  return {
    kcal: Math.round(per100g.calories * factor),
    protein: Math.round(per100g.protein * factor * 10) / 10,
    carbs: Math.round(per100g.carbs * factor * 10) / 10,
    fat: Math.round(per100g.fat * factor * 10) / 10,
  };
}

export function QuickAddSheet({
  date,
  onLogged,
  plannedMeals = [],
  replacesSlot,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  onLoggedEntry,
  onLoggedEntries,
}: QuickAddSheetProps) {
  // WP-08: protein-only mode asks protein first and shows no calorie figure.
  const { proteinOnly } = useNumbersMode();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };
  /** Adds `replacesSlot` to a custom entry when this sheet is slot-targeted. */
  // Every log write also asks for an offer instead of a silent rebalance (WP-07).
  const forSlot = <T extends object>(
    entry: T,
  ): T & { replacesSlot?: SlotRef; rebalanceMode: 'preview' } =>
    replacesSlot
      ? { ...entry, replacesSlot, ...REBALANCE_PREVIEW }
      : { ...entry, ...REBALANCE_PREVIEW };
  const [view, setView] = useState<'search' | 'manual' | 'product'>('search');
  // The product a "Packaged products" row opens on; undefined = the barcode start.
  const [productStart, setProductStart] = useState<ProductStart | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [ingredientLimit, setIngredientLimit] = useState(INGREDIENT_PAGE);
  const [mealType, setMealType] = useState<QuickAddMealType>(() =>
    defaultMealSlot(new Date().getHours()),
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [gramsText, setGramsText] = useState('100');
  const [gramsCapped, setGramsCapped] = useState(false);
  const [portion, setPortion] = useState(1);

  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [macros, setMacros] = useState({ protein: '', carbs: '', fat: '' });
  const [errors, setErrors] = useState<QuickAddErrors>({});
  const [sanityOverridden, setSanityOverridden] = useState(false);
  // UX-FOOD-10: a field's error goes the moment that field is edited.
  const clearError = (key: keyof QuickAddErrors) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      return Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key));
    });
  const kcalRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length > 0;

  // UX-FOOD-09: 250 ms debounce for the server groups; the previous results
  // stay on screen while the next ones load (no flicker).
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(trimmedQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmedQuery]);

  const recentsQuery = trpc.tracker.recents.useQuery({ limit: 15 }, { enabled: open });
  // Lane A2: one-tap saved meals. Not offered when replacing a plan slot (a
  // slot is replaced by one entry; a saved meal is several).
  const savedMealsQuery = trpc.savedMeals.list.useQuery(undefined, {
    enabled: open && !replacesSlot,
  });
  const recipesQuery = trpc.recipe.list.useQuery(
    { search: debouncedQuery, myRecipesOnly: true, limit: 5 },
    { enabled: open && debouncedQuery.length > 0, placeholderData: (previous) => previous },
  );
  const ingredientsQuery = trpc.ingredients.search.useQuery(
    { query: debouncedQuery, ...(ingredientLimit > INGREDIENT_PAGE && { limit: ingredientLimit }) },
    { enabled: open && debouncedQuery.length > 1, placeholderData: (previous) => previous },
  );
  const productsQuery = trpc.products.search.useQuery(
    { query: debouncedQuery, limit: 5 },
    { enabled: open && debouncedQuery.length > 1, placeholderData: (previous) => previous },
  );
  const searchSettling =
    debouncedQuery !== trimmedQuery ||
    recipesQuery.isFetching ||
    ingredientsQuery.isFetching ||
    productsQuery.isFetching;
  const searchFailed = recipesQuery.isError || ingredientsQuery.isError;

  const reset = () => {
    setView('search');
    setProductStart(undefined);
    setQuery('');
    setIngredientLimit(INGREDIENT_PAGE);
    setExpandedKey(null);
    setGramsText('100');
    setGramsCapped(false);
    setPortion(1);
    setName('');
    setKcal('');
    setMacros({ protein: '', carbs: '', fat: '' });
    setErrors({});
    setSanityOverridden(false);
  };

  useEffect(() => {
    if (open) {
      setMealType(
        replacesSlot
          ? toQuickAddMealType(replacesSlot.mealType)
          : defaultMealSlot(new Date().getHours()),
      );
    } else reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed only when the sheet opens
  }, [open]);

  const utils = trpc.useUtils();

  const onLoggedCommon = (
    data:
      | RouterOutputs['tracker']['logRecipe']
      | RouterOutputs['tracker']['logCustomMeal']
      | RouterOutputs['tracker']['logProduct'],
    options: { announceDayFit?: boolean } = {},
  ) => {
    handleRebalanceOutcome(data, options);
    // Recent (AC1) — and the weekly/monthly summaries, dashboard ring — must
    // reflect this log the next time the sheet (or those surfaces) opens, not
    // after the query's 60s staleTime. onLogged() alone only refetches
    // tracker.getDay via the page.
    invalidateDayQueries(utils, date);
    onLogged();
    setOpen(false);
  };

  // UX-PO-02: a planned row is `planned`; anything else logged into a meal type
  // the day's plan already has a meal for is `replaced`; the rest is `quick`.
  const plannedRowPending = useRef(false);
  const quickAddSource = (vars: { mealType: string }, fromPlanRow: boolean) =>
    fromPlanRow
      ? 'planned'
      : replacesSlot || plannedMeals.some((m) => m.mealType === vars.mealType)
        ? 'replaced'
        : 'quick';

  // Both mutations render their failure inline (search view and manual form).
  const logRecipeMutation = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (data, vars) => {
      trackMealLogged(quickAddSource(vars, plannedRowPending.current), vars.mealType);
      plannedRowPending.current = false;
      onLoggedCommon(data);
    },
    onError: () => {
      plannedRowPending.current = false;
    },
  });
  const logCustomMutation = trpc.tracker.logCustomMeal.useMutation({
    meta: { silent: true },
    onSuccess: (data, vars) => {
      trackMealLogged(quickAddSource(vars, false), vars.mealType);
      // A caller with its own "Logged …" toast carries the day-fit line itself.
      const ownToast = Boolean(data.entryId && onLoggedEntry);
      onLoggedCommon(data, { announceDayFit: !ownToast });
      if (data.entryId) {
        onLoggedEntry?.({ entryId: data.entryId, name: vars.name, dayFit: data.dayFit });
      }
    },
  });
  const logSavedMutation = trpc.tracker.logSavedMeal.useMutation({
    meta: { silent: true },
    onSuccess: (data, vars) => {
      const meal = savedMealsQuery.data?.find((m) => m.id === vars.savedMealId);
      capture('saved_meal_logged', { itemCount: data.entryIds.length });
      trackMealLogged(quickAddSource(vars, false), vars.mealType);
      void utils.savedMeals.list.invalidate();
      onLoggedCommon(data, { announceDayFit: !onLoggedEntries });
      onLoggedEntries?.({
        entryIds: data.entryIds,
        name: meal?.name ?? 'saved meal',
        dayFit: data.dayFit,
      });
    },
  });
  const isPending =
    logRecipeMutation.isPending || logCustomMutation.isPending || logSavedMutation.isPending;
  const savedMeals = replacesSlot
    ? []
    : (savedMealsQuery.data ?? [])
        .filter((m) => !searching || m.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
        .slice(0, searching ? undefined : 5);

  const recents = (recentsQuery.data ?? []).filter(
    (r) => !searching || r.name.toLowerCase().includes(trimmedQuery.toLowerCase()),
  );
  // The plan group is for ticking the planned meal; a slot-targeted sheet is
  // for what you had INSTEAD of it.
  const planRows = replacesSlot
    ? []
    : plannedMeals.filter(
        (m) => !searching || m.recipeName.toLowerCase().includes(trimmedQuery.toLowerCase()),
      );

  const hasSearchResults =
    savedMeals.length > 0 ||
    recents.length > 0 ||
    planRows.length > 0 ||
    (recipesQuery.data?.length ?? 0) > 0 ||
    (ingredientsQuery.data?.length ?? 0) > 0 ||
    (productsQuery.data?.length ?? 0) > 0;

  const logRecentAgain = (recent: NonNullable<typeof recentsQuery.data>[number]) => {
    if (isPending) return;
    if (recent.recipeId && !replacesSlot) {
      logRecipeMutation.mutate({
        ...REBALANCE_PREVIEW,
        date,
        recipeId: recent.recipeId,
        mealType: recent.mealType,
        portionMultiplier: recent.portionMultiplier ?? 1,
      });
      return;
    }
    logCustomMutation.mutate(
      forSlot({
        date,
        name: recent.name,
        estimatedBy: recent.estimatedBy ?? 'manual',
        mealType: toQuickAddMealType(recent.mealType),
        kcal: recent.kcal,
        protein: recent.protein,
        carbs: recent.carbs,
        fat: recent.fat,
        ...(recent.unknownMacros && { unknownMacros: recent.unknownMacros }),
      }),
    );
  };

  const logPlannedRow = (meal: PlannedLogMeal, chosenPortion: number) => {
    if (isPending) return;
    plannedRowPending.current = true;
    logRecipeMutation.mutate({
      ...REBALANCE_PREVIEW,
      date,
      recipeId: meal.recipeId,
      mealType: meal.mealType,
      portionMultiplier: chosenPortion,
      ...(meal.slotIndex !== undefined && { slotIndex: meal.slotIndex }),
    });
  };

  const logRecipeRow = (
    recipe: { id: string; name: string },
    perServing: { kcal: number; protein: number; carbs: number; fat: number },
    chosenPortion: number,
  ) => {
    if (isPending) return;
    if (replacesSlot) {
      // "Ate something else": the recipe's numbers as a custom entry, so the
      // planned slot is replaced (logRecipe would tick a second recipe on it).
      const scale = (v: number, digits: number) => {
        const f = 10 ** digits;
        return Math.round(v * chosenPortion * f) / f;
      };
      logCustomMutation.mutate(
        forSlot({
          date,
          name: recipe.name,
          estimatedBy: 'manual' as const,
          mealType,
          kcal: scale(perServing.kcal, 0),
          protein: scale(perServing.protein, 1),
          carbs: scale(perServing.carbs, 1),
          fat: scale(perServing.fat, 1),
        }),
      );
      return;
    }
    logRecipeMutation.mutate({
      ...REBALANCE_PREVIEW,
      date,
      recipeId: recipe.id,
      mealType,
      portionMultiplier: chosenPortion,
    });
  };

  const logIngredientRow = (ingredient: IngredientSearchRow, grams: number) => {
    if (isPending || !ingredient.per100g) return;
    const scaled = scaleFromPer100g(ingredient.per100g, grams);
    logCustomMutation.mutate(
      forSlot({
        date,
        name: `${ingredient.displayName}, ${formatQuickAddGrams(grams)} g`,
        estimatedBy: 'manual' as const,
        mealType,
        kcal: scaled.kcal,
        protein: scaled.protein,
        carbs: scaled.carbs,
        fat: scaled.fat,
      }),
    );
  };

  // WP-08: protein is the one required number in protein-only mode; the kcal the
  // plan balances on is estimated from it (same rule as the app).
  const parseManual = () => {
    const proteinGrams = Number(macros.protein.replace(',', '.'));
    const proteinOk = Number.isFinite(proteinGrams) && proteinGrams > 0;
    const parsed = parseQuickAdd({
      name,
      mealType,
      kcal: proteinOnly ? String(estimateKcalFromProtein(proteinOk ? proteinGrams : 0)) : kcal,
      ...(proteinOnly ? { protein: macros.protein } : macros),
    });
    return { parsed, proteinOk };
  };
  const parsedManual = parseManual().parsed;
  // Protein-only has no calories to compare the macros against.
  const sanity =
    !proteinOnly && parsedManual.ok && !sanityOverridden
      ? checkMacroSanity(parsedManual.entry)
      : null;

  const submitManual = () => {
    if (isPending) return;
    const { parsed: parsedNow, proteinOk } = parseManual();
    if (proteinOnly && !proteinOk) {
      const rest: QuickAddErrors = parsedNow.ok ? {} : { ...parsedNow.errors };
      delete rest.kcal; // protein-only has no calories field to show it on
      setErrors({ ...rest, protein: 'Enter the protein in grams.' });
      return;
    }
    if (!parsedNow.ok) {
      setErrors(parsedNow.errors);
      return;
    }
    setErrors({});
    if (!sanityOverridden && checkMacroSanity(parsedNow.entry).message) return;
    logCustomMutation.mutate(forSlot({ date, estimatedBy: 'manual' as const, ...parsedNow.entry }));
  };

  const expandedIngredient = ingredientsQuery.data?.find((i) => i.name === expandedKey);
  // UX-FOOD-09: grams are clamped to what one entry can hold (server: kcal ≤ 5000).
  const gramsInfo = expandedIngredient?.per100g
    ? clampIngredientGrams(gramsText, expandedIngredient.per100g)
    : null;
  const gramsNumber = gramsInfo?.grams ?? 0;
  const onGramsChange = (text: string, per100g: NonNullable<IngredientSearchRow['per100g']>) => {
    const info = clampIngredientGrams(text, per100g);
    setGramsCapped(info.clamped);
    setGramsText(info.clamped ? String(info.max) : text);
  };
  const expandedLive =
    expandedIngredient?.per100g && gramsNumber > 0
      ? scaleFromPer100g(expandedIngredient.per100g, gramsNumber)
      : null;

  const chipBtn = (selected: boolean) =>
    `min-h-11 rounded-full border px-3 text-xs font-medium ${selected ? 'border-[#944a00] bg-[#944a00] text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`;

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          data-testid="tracker-quick-add"
          onClick={() => setOpen(true)}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50"
        >
          <Plus className="h-4 w-4" />
          Log something
        </button>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={
          view === 'manual'
            ? proteinOnly
              ? 'Enter protein yourself'
              : 'Enter calories yourself'
            : view === 'product'
              ? PACKAGED_PRODUCT_COPY.scanBarcode
              : replacesSlot
                ? 'Ate something else'
                : 'Log something'
        }
        size="sm"
        footer={
          view === 'manual' ? (
            <div className="w-full space-y-2 px-5 pb-2">
              {sanity?.message && (
                <div
                  data-testid="quick-add-sanity"
                  className="space-y-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"
                >
                  <p>{sanity.message}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid="quick-add-sanity-fix"
                      onClick={() => kcalRef.current?.focus()}
                      className="min-h-11 rounded-lg border border-amber-300 px-3 text-xs font-semibold"
                    >
                      Fix
                    </button>
                    <button
                      type="button"
                      data-testid="quick-add-sanity-log-anyway"
                      onClick={() => setSanityOverridden(true)}
                      className="min-h-11 rounded-lg border border-amber-300 px-3 text-xs font-semibold"
                    >
                      Log anyway
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                data-testid="quick-add-submit"
                onClick={submitManual}
                disabled={!!sanity?.message || logCustomMutation.isPending}
                className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00] disabled:opacity-50"
              >
                {logCustomMutation.isPending ? 'Logging…' : 'Log'}
              </button>
            </div>
          ) : undefined
        }
      >
        {view === 'search' ? (
          <div className="space-y-4 px-5 pb-4">
            {!replacesSlot && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meal">
                {MEAL_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    data-testid={`quick-add-meal-${o.value}`}
                    onClick={() => setMealType(o.value)}
                    className={chipBtn(mealType === o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                data-testid="log-sheet-search"
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIngredientLimit(INGREDIENT_PAGE);
                  setExpandedKey(null);
                }}
                placeholder="What did you eat?"
                aria-label="What did you eat?"
                className="min-h-11 w-full rounded-xl border border-neutral-200 py-2 pl-9 pr-3 text-sm text-neutral-900"
              />
            </label>

            {/* ADR 0005: next to the search, where it is seen first. */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="log-sheet-scan-barcode"
                onClick={() => {
                  setProductStart(undefined);
                  setView('product');
                }}
                className="flex min-h-11 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 text-sm font-semibold text-[#944a00] hover:bg-neutral-50"
              >
                <Barcode className="h-4 w-4" aria-hidden />
                {PACKAGED_PRODUCT_COPY.scanBarcode}
              </button>
            </div>

            {(logRecipeMutation.isError || logCustomMutation.isError) && (
              <p data-testid="log-sheet-api-error" role="alert" className="text-sm text-red-600">
                Couldn&apos;t log that:{' '}
                {userFacingErrorMessage(
                  logRecipeMutation.isError ? logRecipeMutation.error : logCustomMutation.error,
                )}
              </p>
            )}

            {logSavedMutation.isError && (
              <p data-testid="log-sheet-saved-error" role="alert" className="text-sm text-red-600">
                Couldn&apos;t log that: {userFacingErrorMessage(logSavedMutation.error)}
              </p>
            )}

            {savedMeals.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  {SAVED_MEALS_COPY.groupTitle}
                </p>
                {savedMeals.map((meal) => (
                  <div
                    key={meal.id}
                    className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5"
                  >
                    <Bookmark className="h-4 w-4 shrink-0 text-[#944a00]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-800">{meal.name}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {savedMealSummary(meal.items, proteinOnly)}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={`log-sheet-saved-add-${meal.id}`}
                      aria-label={`Log ${meal.name} to ${mealType}`}
                      disabled={isPending}
                      onClick={() =>
                        logSavedMutation.mutate({
                          ...REBALANCE_PREVIEW,
                          date,
                          savedMealId: meal.id,
                          mealType,
                        })
                      }
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#944a00] hover:bg-neutral-100 disabled:opacity-50"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {recents.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  Recent
                </p>
                {recents.map((r) => (
                  <div
                    key={r.key}
                    className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-800">{r.name}</p>
                      <p className="text-xs text-neutral-500">{nutritionLabel(r, proteinOnly)}</p>
                    </div>
                    <button
                      type="button"
                      data-testid={`log-sheet-recent-add-${r.key}`}
                      aria-label={
                        proteinOnly
                          ? `Log ${r.name} again, ${proteinLabel(r.protein)}`
                          : `Log ${r.name} again, ${Math.round(r.kcal)} kilocalories`
                      }
                      disabled={isPending}
                      onClick={() => logRecentAgain(r)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#944a00] hover:bg-[#fff2e2]"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {planRows.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  This week&apos;s plan
                </p>
                {planRows.map((m) => {
                  const key = `plan:${m.slotIndex ?? m.recipeId}`;
                  const isOpen = expandedKey === key;
                  return (
                    <div
                      key={key}
                      className="space-y-2 rounded-xl border border-neutral-200 bg-white p-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedKey(isOpen ? null : key);
                          setPortion(m.portion ?? 1);
                        }}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-800">
                            {m.recipeName}
                          </p>
                          <p className="text-xs text-neutral-500">
                            1 portion · {nutritionLabel(m, proteinOnly)}
                          </p>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-neutral-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-neutral-400" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="space-y-2">
                          <div
                            className="flex flex-wrap gap-1.5"
                            role="group"
                            aria-label={`Portion for ${m.recipeName}`}
                          >
                            {RECIPE_PORTIONS.map((p) => (
                              <button
                                key={p}
                                type="button"
                                data-testid={`log-sheet-plan-portion-${key}-${p}`}
                                onClick={() => setPortion(p)}
                                className={chipBtn(portion === p)}
                              >
                                {formatPortion(p)}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            data-testid={`log-sheet-plan-log-${key}`}
                            onClick={() => logPlannedRow(m, portion)}
                            className="min-h-11 w-full rounded-lg bg-[#944a00] px-3 text-xs font-semibold text-white"
                          >
                            Log{' '}
                            {nutritionLabel(
                              { kcal: m.kcal * portion, protein: m.protein * portion },
                              proteinOnly,
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {searching && (recipesQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  Your recipes
                </p>
                {(recipesQuery.data ?? []).map((recipe) => {
                  const key = `recipe:${recipe.id}`;
                  const isOpen = expandedKey === key;
                  const nutrition = recipe.nutritionInfo as {
                    calories?: number;
                    protein?: number;
                    carbs?: number;
                    fat?: number;
                  } | null;
                  const kcalPerServing = nutrition?.calories ?? 0;
                  return (
                    <div
                      key={key}
                      className="space-y-2 rounded-xl border border-neutral-200 bg-white p-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedKey(isOpen ? null : key);
                          setPortion(1);
                        }}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-800">
                            {recipe.name}
                          </p>
                          <p className="text-xs text-neutral-500">
                            1 portion ·{' '}
                            {nutritionLabel(
                              { kcal: kcalPerServing, protein: nutrition?.protein ?? 0 },
                              proteinOnly,
                            )}
                          </p>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-neutral-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-neutral-400" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="space-y-2">
                          <div
                            className="flex flex-wrap gap-1.5"
                            role="group"
                            aria-label={`Portion for ${recipe.name}`}
                          >
                            {RECIPE_PORTIONS.map((p) => (
                              <button
                                key={p}
                                type="button"
                                data-testid={`log-sheet-recipe-portion-${key}-${p}`}
                                onClick={() => setPortion(p)}
                                className={chipBtn(portion === p)}
                              >
                                {formatPortion(p)}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            data-testid={`log-sheet-recipe-log-${key}`}
                            onClick={() =>
                              logRecipeRow(
                                recipe,
                                {
                                  kcal: nutrition?.calories ?? 0,
                                  protein: nutrition?.protein ?? 0,
                                  carbs: nutrition?.carbs ?? 0,
                                  fat: nutrition?.fat ?? 0,
                                },
                                portion,
                              )
                            }
                            className="min-h-11 w-full rounded-lg bg-[#944a00] px-3 text-xs font-semibold text-white"
                          >
                            Log{' '}
                            {nutritionLabel(
                              {
                                kcal: kcalPerServing * portion,
                                protein: (nutrition?.protein ?? 0) * portion,
                              },
                              proteinOnly,
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {searching && (productsQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  {PACKAGED_PRODUCT_COPY.packagedGroup}
                </p>
                {(productsQuery.data ?? []).map(({ product, warnings }) => (
                  <button
                    key={product.id}
                    type="button"
                    data-testid={`log-sheet-product-${product.id}`}
                    aria-label={`${productDisplayName(product)}${warnings.length > 0 ? ', allergen warning' : ''}`}
                    onClick={() => {
                      setProductStart({ product, warnings });
                      setView('product');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5 text-left hover:bg-neutral-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-800">
                        {productDisplayName(product)}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {product.per100g.kcal === null
                          ? 'No calories yet'
                          : proteinOnly
                            ? product.per100g.protein === null
                              ? 'Protein not stated'
                              : `${Math.round(product.per100g.protein)} g protein / 100 g`
                            : `${Math.round(product.per100g.kcal)} kcal / 100 g`}
                        {product.isOwn ? ' · yours' : ''}
                      </p>
                    </div>
                    {warnings.length > 0 && (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                  </button>
                ))}
              </div>
            )}

            {searching && (ingredientsQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  Ingredients (per 100 g)
                </p>
                {(ingredientsQuery.data ?? []).map((ingredient) => {
                  const key = ingredient.name;
                  const isOpen = expandedKey === key;
                  return (
                    <div
                      key={key}
                      className="space-y-2 rounded-xl border border-neutral-200 bg-white p-2.5"
                    >
                      <button
                        type="button"
                        disabled={!ingredient.per100g}
                        onClick={() => {
                          setExpandedKey(isOpen ? null : key);
                          setGramsText('100');
                          setGramsCapped(false);
                        }}
                        className="flex w-full items-center gap-3 text-left disabled:opacity-60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-800">
                            {ingredient.displayName}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {ingredient.per100g
                              ? proteinOnly
                                ? `${Math.round(ingredient.per100g.protein)} g protein / 100 g`
                                : `${Math.round(ingredient.per100g.calories)} kcal / 100 g`
                              : 'No nutrition data yet'}
                          </p>
                        </div>
                        {ingredient.per100g &&
                          (isOpen ? (
                            <ChevronUp className="h-4 w-4 text-neutral-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-neutral-400" />
                          ))}
                      </button>
                      {isOpen && ingredient.per100g && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            {GRAM_CHIPS.map((g) => (
                              <button
                                key={g}
                                type="button"
                                data-testid={`log-sheet-grams-${key}-${g}`}
                                onClick={() => {
                                  setGramsText(String(g));
                                  setGramsCapped(false);
                                }}
                                className={chipBtn(gramsNumber === g)}
                              >
                                {g} g
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              data-testid={`log-sheet-grams-input-${key}`}
                              aria-label={`Grams of ${ingredient.displayName}`}
                              value={gramsText}
                              onChange={(e) => {
                                if (ingredient.per100g) {
                                  onGramsChange(e.target.value, ingredient.per100g);
                                }
                              }}
                              className="min-h-11 w-full min-w-0 rounded-lg border border-neutral-200 px-3 text-sm"
                            />
                            <span className="shrink-0 text-sm text-neutral-400">g</span>
                          </div>
                          <p
                            data-testid={`log-sheet-grams-live-kcal-${key}`}
                            aria-live="polite"
                            className="text-xs text-neutral-500"
                          >
                            {expandedIngredient === ingredient && expandedLive
                              ? proteinOnly
                                ? `${expandedLive.protein} g protein`
                                : `${expandedLive.kcal} kcal · ${expandedLive.protein}g P`
                              : '—'}
                          </p>
                          {gramsCapped && gramsInfo && (
                            <p
                              data-testid={`log-sheet-grams-max-${key}`}
                              className="text-xs text-amber-700"
                            >
                              One entry holds up to {formatNumber(gramsInfo.max)} g.
                            </p>
                          )}
                          <button
                            type="button"
                            data-testid={`log-sheet-grams-log-${key}`}
                            disabled={gramsNumber <= 0}
                            onClick={() => logIngredientRow(ingredient, gramsNumber)}
                            className="min-h-11 w-full rounded-lg bg-[#944a00] px-3 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Log
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(ingredientsQuery.data?.length ?? 0) >= ingredientLimit &&
                  ingredientLimit < INGREDIENT_PAGE_MAX && (
                    <button
                      type="button"
                      data-testid="log-sheet-ingredients-more"
                      onClick={() => setIngredientLimit(INGREDIENT_PAGE_MAX)}
                      className="min-h-11 w-full text-sm font-semibold text-[#944a00] hover:underline"
                    >
                      Show more
                    </button>
                  )}
              </div>
            )}

            {searching && searchFailed && (
              <div
                data-testid="log-sheet-search-error"
                role="alert"
                className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
              >
                <p>Couldn&apos;t search just now. Check your connection and try again.</p>
                <button
                  type="button"
                  data-testid="log-sheet-search-retry"
                  onClick={() => {
                    void recipesQuery.refetch();
                    void ingredientsQuery.refetch();
                  }}
                  className="min-h-11 text-sm font-semibold text-[#944a00] hover:underline"
                >
                  Retry
                </button>
              </div>
            )}
            {searching && !searchFailed && !hasSearchResults && searchSettling && (
              <p data-testid="log-sheet-searching" className="py-2 text-sm text-neutral-500">
                Searching…
              </p>
            )}
            {searching && !searchFailed && !hasSearchResults && !searchSettling && (
              <button
                type="button"
                data-testid="log-sheet-no-matches"
                onClick={() => {
                  setView('manual');
                  setName(trimmedQuery);
                }}
                className="min-h-11 py-2 text-left text-sm text-neutral-600"
              >
                No matches —{' '}
                <span className="font-semibold text-[#944a00]">
                  {proteinOnly ? 'enter protein yourself' : 'enter calories yourself'}
                </span>
              </button>
            )}

            <div className="flex flex-wrap gap-4 border-t border-neutral-100 pt-3">
              <button
                type="button"
                data-testid="log-sheet-manual"
                onClick={() => {
                  setView('manual');
                  setName(trimmedQuery);
                }}
                className="min-h-11 text-sm font-semibold text-[#944a00] hover:underline"
              >
                {proteinOnly ? 'Enter protein yourself' : 'Enter calories yourself'}
              </button>
            </div>
          </div>
        ) : view === 'product' ? (
          <div className="space-y-4 px-5 pb-4">
            <button
              type="button"
              data-testid="log-sheet-product-back"
              onClick={() => setView('search')}
              className="min-h-11 text-sm font-semibold text-[#944a00] hover:underline"
            >
              ← Back to search
            </button>
            {!replacesSlot && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meal">
                {MEAL_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    data-testid={`log-sheet-product-meal-${o.value}`}
                    onClick={() => setMealType(o.value)}
                    className={chipBtn(mealType === o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <ProductFlow
              key={productStart?.product.id ?? 'start'}
              date={date}
              mealType={replacesSlot ? toQuickAddMealType(replacesSlot.mealType) : mealType}
              replacesSlot={replacesSlot}
              proteinOnly={proteinOnly}
              initial={productStart}
              onLogged={(data, productName) => {
                const loggedMealType = replacesSlot ? replacesSlot.mealType : mealType;
                trackMealLogged(
                  quickAddSource({ mealType: loggedMealType }, false),
                  loggedMealType,
                );
                const ownToast = Boolean(data.entryId && onLoggedEntry);
                onLoggedCommon(data, { announceDayFit: !ownToast });
                if (data.entryId) {
                  onLoggedEntry?.({
                    entryId: data.entryId,
                    name: productName,
                    dayFit: data.dayFit,
                  });
                }
              }}
            />
          </div>
        ) : (
          <div className="space-y-4 px-5 pb-4">
            <button
              type="button"
              data-testid="log-sheet-back-to-search"
              onClick={() => setView('search')}
              className="min-h-11 text-sm font-semibold text-[#944a00] hover:underline"
            >
              ← Back to search
            </button>
            <p className="text-sm text-neutral-500">
              {proteinOnly
                ? 'Name and protein are enough — a rough guess is fine.'
                : 'Name and calories are enough — a rough guess is fine.'}
            </p>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
              What did you eat?
              <input
                type="text"
                data-testid="quick-add-name"
                value={name}
                maxLength={QUICK_ADD_LIMITS.nameMaxLength}
                placeholder="e.g. Slice of birthday cake"
                onChange={(e) => {
                  setName(e.target.value);
                  clearError('name');
                  setSanityOverridden(false);
                }}
                className="min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
              />
              {errors.name && (
                <span data-testid="quick-add-name-error" className="text-xs text-red-600">
                  {errors.name}
                </span>
              )}
            </label>
            {!replacesSlot && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meal">
                {MEAL_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    data-testid={`quick-add-meal-${o.value}`}
                    onClick={() => setMealType(o.value)}
                    className={chipBtn(mealType === o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {proteinOnly ? (
              <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
                Roughly how many grams of protein?
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    data-testid="quick-add-protein"
                    value={macros.protein}
                    placeholder="30"
                    onChange={(e) => {
                      setMacros((prev) => ({ ...prev, protein: e.target.value }));
                      clearError('protein');
                    }}
                    className="min-h-11 w-full min-w-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
                  />
                  <span className="shrink-0 text-neutral-400">g</span>
                </span>
                {errors.protein && (
                  <span data-testid="quick-add-protein-error" className="text-xs text-red-600">
                    {errors.protein}
                  </span>
                )}
              </label>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
                  Roughly how many calories?
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      data-testid="quick-add-kcal"
                      ref={kcalRef}
                      value={kcal}
                      placeholder="350"
                      onChange={(e) => {
                        setKcal(e.target.value);
                        clearError('kcal');
                        setSanityOverridden(false);
                      }}
                      className="min-h-11 w-full min-w-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
                    />
                    <span className="shrink-0 text-neutral-400">kcal</span>
                  </span>
                  {errors.kcal && (
                    <span data-testid="quick-add-kcal-error" className="text-xs text-red-600">
                      {errors.kcal}
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  {(['protein', 'carbs', 'fat'] as const).map((k) => (
                    <label
                      key={k}
                      className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-neutral-600"
                    >
                      {k.charAt(0).toUpperCase() + k.slice(1)} (g)
                      <input
                        type="number"
                        inputMode="decimal"
                        data-testid={`quick-add-${k}`}
                        value={macros[k]}
                        onChange={(e) => {
                          setMacros((prev) => ({ ...prev, [k]: e.target.value }));
                          clearError(k);
                          setSanityOverridden(false);
                        }}
                        className="min-h-11 w-full min-w-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
                      />
                      {errors[k] && (
                        <span data-testid={`quick-add-${k}-error`} className="text-xs text-red-600">
                          {errors[k]}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
            {logCustomMutation.isError && (
              <p data-testid="quick-add-api-error" className="text-xs text-red-600">
                {userFacingErrorMessage(logCustomMutation.error)}
              </p>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
