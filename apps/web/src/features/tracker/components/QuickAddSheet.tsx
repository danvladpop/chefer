'use client';

import { useEffect, useRef, useState } from 'react';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { ChevronDown, ChevronUp, Plus, Search } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import {
  checkMacroSanity,
  clampIngredientGrams,
  defaultMealSlot,
  formatNumber,
  formatPortion,
  formatQuickAddGrams,
  parseQuickAdd,
  QUICK_ADD_LIMITS,
  QUICK_ADD_MEAL_TYPES,
  userFacingErrorMessage,
  type QuickAddErrors,
  type QuickAddMealType,
} from '@chefer/utils';
import { invalidateDayQueries } from '../lib/invalidate';
import { handleRebalanceResult } from '../lib/rebalance-storage';

// ─── Search-first Log sheet (T-19.1, UX-19) ────────────────────────────────────
// Web counterpart of mobile's quick-add-sheet.tsx. Recent → This week's plan →
// Your recipes → Ingredients (per 100 g), in that order; "Enter calories
// yourself" is the old calories-only form, now gated by the macro sanity
// check (bug B-39, T-19.5). Never branded products or barcodes (B-29, AC6).

type IngredientSearchRow = RouterOutputs['ingredients']['search'][number];

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

export function QuickAddSheet({ date, onLogged, plannedMeals = [] }: QuickAddSheetProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'search' | 'manual'>('search');
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
  const recipesQuery = trpc.recipe.list.useQuery(
    { search: debouncedQuery, myRecipesOnly: true, limit: 5 },
    { enabled: open && debouncedQuery.length > 0, placeholderData: (previous) => previous },
  );
  const ingredientsQuery = trpc.ingredients.search.useQuery(
    { query: debouncedQuery, ...(ingredientLimit > INGREDIENT_PAGE && { limit: ingredientLimit }) },
    { enabled: open && debouncedQuery.length > 1, placeholderData: (previous) => previous },
  );
  const searchSettling =
    debouncedQuery !== trimmedQuery || recipesQuery.isFetching || ingredientsQuery.isFetching;
  const searchFailed = recipesQuery.isError || ingredientsQuery.isError;

  const reset = () => {
    setView('search');
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
    if (open) setMealType(defaultMealSlot(new Date().getHours()));
    else reset();
  }, [open]);

  const utils = trpc.useUtils();

  const onLoggedCommon = (
    data: RouterOutputs['tracker']['logRecipe'] | RouterOutputs['tracker']['logCustomMeal'],
  ) => {
    handleRebalanceResult(data.rebalance);
    // Recent (AC1) — and the weekly/monthly summaries, dashboard ring — must
    // reflect this log the next time the sheet (or those surfaces) opens, not
    // after the query's 60s staleTime. onLogged() alone only refetches
    // tracker.getDay via the page.
    invalidateDayQueries(utils, date);
    onLogged();
    setOpen(false);
  };

  // Both mutations render their failure inline (search view and manual form).
  const logRecipeMutation = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    onSuccess: onLoggedCommon,
  });
  const logCustomMutation = trpc.tracker.logCustomMeal.useMutation({
    meta: { silent: true },
    onSuccess: onLoggedCommon,
  });
  const isPending = logRecipeMutation.isPending || logCustomMutation.isPending;

  const recents = (recentsQuery.data ?? []).filter(
    (r) => !searching || r.name.toLowerCase().includes(trimmedQuery.toLowerCase()),
  );
  const planRows = plannedMeals.filter(
    (m) => !searching || m.recipeName.toLowerCase().includes(trimmedQuery.toLowerCase()),
  );

  const hasSearchResults =
    recents.length > 0 ||
    planRows.length > 0 ||
    (recipesQuery.data?.length ?? 0) > 0 ||
    (ingredientsQuery.data?.length ?? 0) > 0;

  const logRecentAgain = (recent: NonNullable<typeof recentsQuery.data>[number]) => {
    if (isPending) return;
    if (recent.recipeId) {
      logRecipeMutation.mutate({
        date,
        recipeId: recent.recipeId,
        mealType: recent.mealType,
        portionMultiplier: recent.portionMultiplier ?? 1,
      });
      return;
    }
    logCustomMutation.mutate({
      date,
      name: recent.name,
      estimatedBy: recent.estimatedBy ?? 'manual',
      mealType: toQuickAddMealType(recent.mealType),
      kcal: recent.kcal,
      protein: recent.protein,
      carbs: recent.carbs,
      fat: recent.fat,
      ...(recent.unknownMacros && { unknownMacros: recent.unknownMacros }),
    });
  };

  const logPlannedRow = (meal: PlannedLogMeal, chosenPortion: number) => {
    if (isPending) return;
    logRecipeMutation.mutate({
      date,
      recipeId: meal.recipeId,
      mealType: meal.mealType,
      portionMultiplier: chosenPortion,
      ...(meal.slotIndex !== undefined && { slotIndex: meal.slotIndex }),
    });
  };

  const logRecipeRow = (recipeId: string, chosenPortion: number) => {
    if (isPending) return;
    logRecipeMutation.mutate({ date, recipeId, mealType, portionMultiplier: chosenPortion });
  };

  const logIngredientRow = (ingredient: IngredientSearchRow, grams: number) => {
    if (isPending || !ingredient.per100g) return;
    const scaled = scaleFromPer100g(ingredient.per100g, grams);
    logCustomMutation.mutate({
      date,
      name: `${ingredient.displayName}, ${formatQuickAddGrams(grams)} g`,
      estimatedBy: 'manual',
      mealType,
      kcal: scaled.kcal,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
    });
  };

  const parsedManual = parseQuickAdd({ name, mealType, kcal, ...macros });
  const sanity = parsedManual.ok && !sanityOverridden ? checkMacroSanity(parsedManual.entry) : null;

  const submitManual = () => {
    if (isPending) return;
    const parsedNow = parseQuickAdd({ name, mealType, kcal, ...macros });
    if (!parsedNow.ok) {
      setErrors(parsedNow.errors);
      return;
    }
    setErrors({});
    if (!sanityOverridden && checkMacroSanity(parsedNow.entry).message) return;
    logCustomMutation.mutate({ date, estimatedBy: 'manual', ...parsedNow.entry });
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
      <button
        type="button"
        data-testid="tracker-quick-add"
        onClick={() => setOpen(true)}
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50"
      >
        <Plus className="h-4 w-4" />
        Log something
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={view === 'manual' ? 'Enter calories yourself' : 'Log something'}
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

            {(logRecipeMutation.isError || logCustomMutation.isError) && (
              <p data-testid="log-sheet-api-error" role="alert" className="text-sm text-red-600">
                Couldn&apos;t log that:{' '}
                {userFacingErrorMessage(
                  logRecipeMutation.isError ? logRecipeMutation.error : logCustomMutation.error,
                )}
              </p>
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
                      <p className="text-xs text-neutral-500">{Math.round(r.kcal)} kcal</p>
                    </div>
                    <button
                      type="button"
                      data-testid={`log-sheet-recent-add-${r.key}`}
                      aria-label={`Log ${r.name} again, ${Math.round(r.kcal)} kilocalories`}
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
                            1 portion · {Math.round(m.kcal)} kcal
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
                            Log {Math.round(m.kcal * portion)} kcal
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
                            1 portion · {Math.round(kcalPerServing)} kcal
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
                            onClick={() => logRecipeRow(recipe.id, portion)}
                            className="min-h-11 w-full rounded-lg bg-[#944a00] px-3 text-xs font-semibold text-white"
                          >
                            Log {Math.round(kcalPerServing * portion)} kcal
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                              ? `${Math.round(ingredient.per100g.calories)} kcal / 100 g`
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
                              ? `${expandedLive.kcal} kcal · ${expandedLive.protein}g P`
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
                <span className="font-semibold text-[#944a00]">enter calories yourself</span>
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
                Enter calories yourself
              </button>
            </div>
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
              Ate something off-plan? Log it honestly — name and calories are enough.
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
