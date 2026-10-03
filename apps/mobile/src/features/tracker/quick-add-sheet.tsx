import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, View, type TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Chip, Input, SegmentedControl, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
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
import { getRecipeImageUrl } from '../../lib/recipe-image';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { NutritionStatusTag } from '../ingredients/nutrition-provenance';
import { invalidateDayQueries } from './invalidate';
import { recordRebalance } from './rebalance-store';

type IngredientSearchRow = RouterOutputs['ingredients']['search'][number];

// Search-first Log sheet (T-19.1, UX-19 §5.1) — replaces the old
// calories-only Quick add form, which is now the "Enter calories yourself"
// fallback (`view === 'manual'`). Recent → This week's plan → Your recipes →
// Ingredients (per 100 g), in that order, so the fastest path (log a repeat
// food) is one tap into the sheet. Never branded products or barcodes
// (B-29, AC6): the ingredient group is Chefer's own catalogue
// (`ingredients.search`) only.

export type PlannedLogMeal = {
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
};

export interface QuickAddSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Device-local YYYY-MM-DD day the entry is logged to (never UTC). */
  date: string;
  onLogged: () => void;
  /** Today's planned meals — the "This week's plan" group (T-19.1). */
  plannedMeals?: PlannedLogMeal[];
  /** Today only: hands off to Snap-to-Log when "Estimate it" is tapped. */
  onEstimateWithSnap?: () => void;
}

const MEAL_OPTIONS = QUICK_ADD_MEAL_TYPES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
  testID: `quick-add-meal-${value}`,
}));

const MACROS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;

const GRAM_CHIPS = [50, 100, 150, 200];
// UX-FOOD-12: the ingredient group asks for the server's default page first,
// and "Show more" asks for a longer one.
const INGREDIENT_PAGE = 12;
const INGREDIENT_PAGE_MAX = 36;
const SEARCH_DEBOUNCE_MS = 250;
const RECIPE_PORTIONS = [0.5, 0.75, 1, 1.5, 2];

type SheetView = 'search' | 'manual';

/** A recent/plan row's stored mealType may pre-date the fixed enum; logCustomMeal
 * requires one of the four, so fall back to `snack` for anything else. */
function toQuickAddMealType(mealType: string): QuickAddMealType {
  return (QUICK_ADD_MEAL_TYPES as readonly string[]).includes(mealType)
    ? (mealType as QuickAddMealType)
    : 'snack';
}

/** Live macros for `grams` of a `per100g` row, rounded like the API would store them. */
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
  visible,
  onClose,
  date,
  onLogged,
  plannedMeals = [],
  onEstimateWithSnap,
}: QuickAddSheetProps) {
  const snackbar = useSnackbar();
  const utils = trpc.useUtils();

  const [view, setView] = useState<SheetView>('search');
  const [query, setQuery] = useState('');
  const [mealType, setMealType] = useState<QuickAddMealType>(() =>
    defaultMealSlot(new Date().getHours()),
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [gramsText, setGramsText] = useState('100');
  const [gramsCapped, setGramsCapped] = useState(false);
  const [portion, setPortion] = useState(1);
  const [ingredientLimit, setIngredientLimit] = useState(INGREDIENT_PAGE);

  // Manual "Enter calories yourself" form state (the old sheet, verbatim).
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const kcalInputRef = useRef<TextInput>(null);
  const nameInputRef = useRef<TextInput>(null);
  const macroInputRefs = {
    protein: useRef<TextInput>(null),
    carbs: useRef<TextInput>(null),
    fat: useRef<TextInput>(null),
  };
  const [macros, setMacros] = useState({ protein: '', carbs: '', fat: '' });
  const [errors, setErrors] = useState<QuickAddErrors>({});
  const [sanityOverridden, setSanityOverridden] = useState(false);

  const reset = () => {
    setView('search');
    setQuery('');
    setExpandedKey(null);
    setGramsText('100');
    setGramsCapped(false);
    setPortion(1);
    setIngredientLimit(INGREDIENT_PAGE);
    setName('');
    setKcal('');
    setMacros({ protein: '', carbs: '', fat: '' });
    setErrors({});
    setSanityOverridden(false);
  };

  useEffect(() => {
    if (visible) {
      setMealType(defaultMealSlot(new Date().getHours()));
    } else {
      reset();
    }
  }, [visible]);

  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length > 0;

  // UX-FOOD-09: 250 ms debounce for the server groups, and the previous
  // results stay on screen while the next ones load (no flicker).
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(trimmedQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmedQuery]);

  const recentsQuery = trpc.tracker.recents.useQuery({ limit: 15 }, { enabled: visible });
  const recipesQuery = trpc.recipe.list.useQuery(
    { search: debouncedQuery, myRecipesOnly: true, limit: 5 },
    { enabled: visible && debouncedQuery.length > 0, placeholderData: (previous) => previous },
  );
  const ingredientsQuery = trpc.ingredients.search.useQuery(
    { query: debouncedQuery, ...(ingredientLimit > INGREDIENT_PAGE && { limit: ingredientLimit }) },
    { enabled: visible && debouncedQuery.length > 1, placeholderData: (previous) => previous },
  );
  const searchSettling =
    debouncedQuery !== trimmedQuery || recipesQuery.isFetching || ingredientsQuery.isFetching;
  const searchFailed = recipesQuery.isError || ingredientsQuery.isError;

  const recents = useMemo(() => {
    const all = recentsQuery.data ?? [];
    if (!searching) return all.slice(0, 8);
    const q = trimmedQuery.toLowerCase();
    return all.filter((r) => r.name.toLowerCase().includes(q));
  }, [recentsQuery.data, searching, trimmedQuery]);

  const planRows = useMemo(() => {
    if (!searching) return plannedMeals;
    const q = trimmedQuery.toLowerCase();
    return plannedMeals.filter((m) => m.recipeName.toLowerCase().includes(q));
  }, [plannedMeals, searching, trimmedQuery]);

  const hasSearchResults =
    recents.length > 0 ||
    planRows.length > 0 ||
    (recipesQuery.data?.length ?? 0) > 0 ||
    (ingredientsQuery.data?.length ?? 0) > 0;

  const onLoggedCommon = (
    data: RouterOutputs['tracker']['logRecipe'] | RouterOutputs['tracker']['logCustomMeal'],
    message: string,
  ) => {
    recordRebalance(data.rebalance);
    invalidateDayQueries(utils, date);
    onLogged();
    snackbar.show({ message, tone: 'success' });
    onClose();
  };

  // Both mutations render their failure inline (search view and manual form),
  // so neither raises the default snackbar (behind the sheet's modal).
  const logRecipeMutation = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (data, vars) => onLoggedCommon(data, `Logged ${vars.mealType}`),
  });
  const logCustomMutation = trpc.tracker.logCustomMeal.useMutation({
    meta: { silent: true },
    onSuccess: (data, vars) => onLoggedCommon(data, `Logged ${vars.name}`),
  });

  const isPending = logRecipeMutation.isPending || logCustomMutation.isPending;

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

  const startManual = () => {
    setView('manual');
    setName(trimmedQuery);
  };

  const parsedManual = parseQuickAdd({ name, mealType, kcal, ...macros });
  const manualSanity =
    parsedManual.ok && !sanityOverridden ? checkMacroSanity(parsedManual.entry) : null;

  const submitManual = () => {
    if (isPending) return;
    const parsed = parseQuickAdd({ name, mealType, kcal, ...macros });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      // UX-FOOD-10: with the keyboard up an error can sit off-screen and Log
      // looks dead — focus (and so scroll to) the first invalid field.
      const fieldOrder = [
        ['name', nameInputRef],
        ['kcal', kcalInputRef],
        ['protein', macroInputRefs.protein],
        ['carbs', macroInputRefs.carbs],
        ['fat', macroInputRefs.fat],
      ] as const;
      fieldOrder.find(([key]) => parsed.errors[key])?.[1].current?.focus();
      return;
    }
    setErrors({});
    if (!sanityOverridden) {
      const sanity = checkMacroSanity(parsed.entry);
      if (!sanity.ok) {
        // Shown inline below — Log anyway sets the override and re-submits.
        return;
      }
    }
    logCustomMutation.mutate({ date, estimatedBy: 'manual', ...parsed.entry });
  };

  const close = () => {
    logRecipeMutation.reset();
    logCustomMutation.reset();
    onClose();
  };

  const groupHeader = (label: string) => (
    <Text
      accessibilityRole="header"
      className="mt-2 text-xs font-semibold uppercase tracking-widest text-gray-500"
    >
      {label}
    </Text>
  );

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
  const expandedIngredientLive =
    expandedIngredient?.per100g && gramsNumber > 0
      ? scaleFromPer100g(expandedIngredient.per100g, gramsNumber)
      : null;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={view === 'manual' ? 'Enter calories yourself' : 'Log something'}
      eyebrow="Off-plan"
      testID="log-sheet"
      footer={
        view === 'manual' ? (
          <View className="gap-2">
            {manualSanity?.message && (
              <View testID="quick-add-sanity" className="gap-2 rounded-lg bg-amber-50 p-3">
                <Text className="text-xs text-amber-800">{manualSanity.message}</Text>
                <View className="flex-row gap-2">
                  <Button
                    testID="quick-add-sanity-fix"
                    variant="outline"
                    size="sm"
                    onPress={() => kcalInputRef.current?.focus()}
                  >
                    Fix
                  </Button>
                  <Button
                    testID="quick-add-sanity-log-anyway"
                    variant="outline"
                    size="sm"
                    onPress={() => setSanityOverridden(true)}
                  >
                    Log anyway
                  </Button>
                </View>
              </View>
            )}
            <Button
              testID="quick-add-submit"
              loading={logCustomMutation.isPending}
              disabled={!!manualSanity?.message}
              onPress={submitManual}
            >
              {logCustomMutation.isPending ? 'Logging…' : 'Log'}
            </Button>
          </View>
        ) : undefined
      }
    >
      {view === 'search' ? (
        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-xs font-medium text-gray-600">Meal</Text>
            <SegmentedControl
              size="sm"
              options={MEAL_OPTIONS}
              value={mealType}
              onChange={setMealType}
              accessibilityLabel="Meal"
              testID="log-sheet-meal"
            />
          </View>

          <Input
            testID="log-sheet-search"
            accessibilityLabel="What did you eat?"
            autoFocus
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setExpandedKey(null);
              setIngredientLimit(INGREDIENT_PAGE);
            }}
            placeholder="What did you eat?"
            returnKeyType="search"
          />

          {(logRecipeMutation.isError || logCustomMutation.isError) && (
            <Text
              testID="log-sheet-api-error"
              accessibilityLiveRegion="polite"
              className="text-sm text-red-600"
            >
              {"Couldn't log that: "}
              {userFacingErrorMessage(
                logRecipeMutation.isError ? logRecipeMutation.error : logCustomMutation.error,
              )}
            </Text>
          )}

          {recents.length > 0 && (
            <View className="gap-1.5">
              {groupHeader('Recent')}
              {recents.map((r) => (
                <View
                  key={r.key}
                  className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-2.5"
                >
                  <Image
                    source={{ uri: getRecipeImageUrl(r.imageUrl) }}
                    className="h-9 w-9 rounded-lg"
                    resizeMode="cover"
                  />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                      {r.name}
                    </Text>
                    <Text className="text-xs text-gray-500">{Math.round(r.kcal)} kcal</Text>
                  </View>
                  <Pressable
                    testID={`log-sheet-recent-add-${r.key}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Log ${r.name} again, ${Math.round(r.kcal)} kilocalories`}
                    disabled={isPending}
                    onPress={() => logRecentAgain(r)}
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Ionicons name="add-circle" size={26} color="#944a00" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {planRows.length > 0 && (
            <View className="gap-1.5">
              {groupHeader("This week's plan")}
              {planRows.map((m) => {
                const key = `plan:${m.slotIndex ?? m.recipeId}`;
                const isOpen = expandedKey === key;
                return (
                  <View key={key} className="gap-2 rounded-xl border border-border bg-card p-2.5">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setExpandedKey(isOpen ? null : key);
                        setPortion(m.portion ?? 1);
                      }}
                      className="flex-row items-center gap-3"
                    >
                      <Image
                        source={{ uri: getRecipeImageUrl(m.imageUrl) }}
                        className="h-9 w-9 rounded-lg"
                        resizeMode="cover"
                      />
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                          {m.recipeName}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          1 portion · {Math.round(m.kcal)} kcal
                        </Text>
                      </View>
                      <Ionicons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="#9ca3af"
                      />
                    </Pressable>
                    {isOpen && (
                      <View className="gap-2">
                        <View className="flex-row flex-wrap gap-1.5">
                          {RECIPE_PORTIONS.map((p) => (
                            <Chip
                              key={p}
                              testID={`log-sheet-plan-portion-${key}-${p}`}
                              label={formatPortion(p)}
                              selected={portion === p}
                              onPress={() => setPortion(p)}
                            />
                          ))}
                        </View>
                        <Button
                          testID={`log-sheet-plan-log-${key}`}
                          size="sm"
                          loading={logRecipeMutation.isPending}
                          onPress={() => logPlannedRow(m, portion)}
                        >
                          <Text className="text-sm font-medium text-primary-foreground">
                            Log {Math.round(m.kcal * portion)} kcal
                          </Text>
                        </Button>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {searching && (recipesQuery.data?.length ?? 0) > 0 && (
            <View className="gap-1.5">
              {groupHeader('Your recipes')}
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
                  <View key={key} className="gap-2 rounded-xl border border-border bg-card p-2.5">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setExpandedKey(isOpen ? null : key);
                        setPortion(1);
                      }}
                      className="flex-row items-center gap-3"
                    >
                      <Image
                        source={{ uri: getRecipeImageUrl(recipe.imageUrl ?? null) }}
                        className="h-9 w-9 rounded-lg"
                        resizeMode="cover"
                      />
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                          {recipe.name}
                        </Text>
                        <View className="flex-row items-center gap-1">
                          <Text className="text-xs text-gray-500">
                            1 portion · {Math.round(kcalPerServing)} kcal
                          </Text>
                          <NutritionStatusTag status={recipe.nutritionStatus} />
                        </View>
                      </View>
                      <Ionicons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="#9ca3af"
                      />
                    </Pressable>
                    {isOpen && (
                      <View className="gap-2">
                        <View className="flex-row flex-wrap gap-1.5">
                          {RECIPE_PORTIONS.map((p) => (
                            <Chip
                              key={p}
                              testID={`log-sheet-recipe-portion-${key}-${p}`}
                              label={formatPortion(p)}
                              selected={portion === p}
                              onPress={() => setPortion(p)}
                            />
                          ))}
                        </View>
                        <Button
                          testID={`log-sheet-recipe-log-${key}`}
                          size="sm"
                          loading={logRecipeMutation.isPending}
                          onPress={() => logRecipeRow(recipe.id, portion)}
                        >
                          <Text className="text-sm font-medium text-primary-foreground">
                            Log {Math.round(kcalPerServing * portion)} kcal
                          </Text>
                        </Button>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {searching && (ingredientsQuery.data?.length ?? 0) > 0 && (
            <View className="gap-1.5">
              {groupHeader('Ingredients (per 100 g)')}
              {(ingredientsQuery.data ?? []).map((ingredient) => {
                const key = ingredient.name;
                const isOpen = expandedKey === key;
                return (
                  <View key={key} className="gap-2 rounded-xl border border-border bg-card p-2.5">
                    <Pressable
                      accessibilityRole="button"
                      disabled={!ingredient.per100g}
                      onPress={() => {
                        setExpandedKey(isOpen ? null : key);
                        setGramsText('100');
                        setGramsCapped(false);
                      }}
                      className="flex-row items-center gap-3"
                    >
                      <Image
                        source={{ uri: getRecipeImageUrl(ingredient.imageUrl) }}
                        className="h-9 w-9 rounded-lg"
                        resizeMode="cover"
                      />
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                          {ingredient.displayName}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          {ingredient.per100g
                            ? `${Math.round(ingredient.per100g.calories)} kcal / 100 g`
                            : 'No nutrition data yet'}
                        </Text>
                      </View>
                      {ingredient.per100g && (
                        <Ionicons
                          name={isOpen ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="#9ca3af"
                        />
                      )}
                    </Pressable>
                    {isOpen && ingredient.per100g && (
                      <View className="gap-2">
                        <View className="flex-row flex-wrap gap-1.5">
                          {GRAM_CHIPS.map((g) => (
                            <Chip
                              key={g}
                              testID={`log-sheet-grams-${key}-${g}`}
                              label={`${g} g`}
                              selected={gramsNumber === g}
                              onPress={() => {
                                setGramsText(String(g));
                                setGramsCapped(false);
                              }}
                            />
                          ))}
                        </View>
                        <View className="flex-row items-center gap-2">
                          <Input
                            testID={`log-sheet-grams-input-${key}`}
                            accessibilityLabel={`Grams of ${ingredient.displayName}`}
                            value={gramsText}
                            onChangeText={(text) => {
                              if (ingredient.per100g) onGramsChange(text, ingredient.per100g);
                            }}
                            keyboardType="number-pad"
                            className="min-w-0 flex-1"
                          />
                          <Text className="text-sm text-gray-400">g</Text>
                        </View>
                        <Text
                          testID={`log-sheet-grams-live-kcal-${key}`}
                          accessibilityLiveRegion="polite"
                          className="text-xs text-gray-500"
                        >
                          {expandedIngredient === ingredient && expandedIngredientLive
                            ? `${expandedIngredientLive.kcal} kcal · ${expandedIngredientLive.protein}g P`
                            : '—'}
                        </Text>
                        {gramsCapped && gramsInfo && (
                          <Text
                            testID={`log-sheet-grams-max-${key}`}
                            className="text-xs text-amber-700"
                          >
                            One entry holds up to {formatNumber(gramsInfo.max)} g.
                          </Text>
                        )}
                        <Button
                          testID={`log-sheet-grams-log-${key}`}
                          size="sm"
                          disabled={gramsNumber <= 0}
                          loading={logCustomMutation.isPending}
                          onPress={() => logIngredientRow(ingredient, gramsNumber)}
                        >
                          Log
                        </Button>
                      </View>
                    )}
                  </View>
                );
              })}
              {(ingredientsQuery.data?.length ?? 0) >= ingredientLimit &&
                ingredientLimit < INGREDIENT_PAGE_MAX && (
                  <Pressable
                    testID="log-sheet-ingredients-more"
                    accessibilityRole="button"
                    accessibilityLabel="Show more ingredients"
                    onPress={() => setIngredientLimit(INGREDIENT_PAGE_MAX)}
                    className="min-h-11 items-center justify-center"
                  >
                    <Text className="text-sm font-semibold text-primary">Show more</Text>
                  </Pressable>
                )}
            </View>
          )}

          {searching && searchFailed && (
            <View testID="log-sheet-search-error" className="gap-1 rounded-xl bg-amber-50 p-3">
              <Text className="text-sm text-amber-800">
                Couldn&apos;t search just now. Check your connection and try again.
              </Text>
              <Pressable
                testID="log-sheet-search-retry"
                accessibilityRole="button"
                onPress={() => {
                  void recipesQuery.refetch();
                  void ingredientsQuery.refetch();
                }}
                className="min-h-11 justify-center self-start"
              >
                <Text className="text-sm font-semibold text-primary">Retry</Text>
              </Pressable>
            </View>
          )}
          {searching && !searchFailed && !hasSearchResults && searchSettling && (
            <Text testID="log-sheet-searching" className="py-2 text-sm text-gray-500">
              Searching…
            </Text>
          )}
          {searching && !searchFailed && !hasSearchResults && !searchSettling && (
            <Pressable
              testID="log-sheet-no-matches"
              accessibilityRole="button"
              onPress={startManual}
              className="min-h-11 justify-center py-2"
            >
              <Text className="text-sm text-gray-600">
                No matches —{' '}
                <Text className="font-semibold text-primary">enter calories yourself</Text>
              </Text>
            </Pressable>
          )}

          <View className="mt-1 flex-row flex-wrap gap-3 border-t border-border pt-3">
            {onEstimateWithSnap && (
              <Pressable
                testID="log-sheet-estimate"
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onEstimateWithSnap();
                }}
                className="min-h-11 justify-center"
              >
                <Text className="text-sm font-medium text-primary">Not sure? Estimate it</Text>
              </Pressable>
            )}
            <Pressable
              testID="log-sheet-manual"
              accessibilityRole="button"
              onPress={startManual}
              className="min-h-11 justify-center"
            >
              <Text className="text-sm font-medium text-primary">Enter calories yourself</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="gap-4">
          <Pressable
            testID="log-sheet-back-to-search"
            accessibilityRole="button"
            onPress={() => setView('search')}
            className="min-h-11 flex-row items-center gap-1"
          >
            <Ionicons name="arrow-back" size={16} color="#944a00" />
            <Text className="text-sm font-medium text-primary">Back to search</Text>
          </Pressable>

          <Text variant="muted" className="text-sm">
            Ate something off-plan? Log it honestly — name and calories are enough.
          </Text>

          <View className="gap-1">
            <Text className="text-xs font-medium text-gray-600">What did you eat?</Text>
            <Input
              testID="quick-add-name"
              ref={nameInputRef}
              accessibilityLabel="What did you eat?"
              value={name}
              maxLength={QUICK_ADD_LIMITS.nameMaxLength}
              placeholder="e.g. Slice of birthday cake"
              returnKeyType="next"
              onChangeText={(text) => {
                setName(text);
                setSanityOverridden(false);
              }}
            />
            {errors.name && (
              <Text testID="quick-add-name-error" className="text-xs text-red-600">
                {errors.name}
              </Text>
            )}
          </View>

          <View className="gap-1">
            <Text className="text-xs font-medium text-gray-600">Meal</Text>
            <SegmentedControl
              size="sm"
              options={MEAL_OPTIONS}
              value={mealType}
              onChange={setMealType}
              accessibilityLabel="Meal"
              testID="quick-add-meal"
            />
          </View>

          <View className="gap-1">
            <Text className="text-xs font-medium text-gray-600">Roughly how many calories?</Text>
            <View className="flex-row items-center gap-2">
              <Input
                testID="quick-add-kcal"
                ref={kcalInputRef}
                accessibilityLabel="Calories"
                value={kcal}
                placeholder="350"
                keyboardType="number-pad"
                onChangeText={(text) => {
                  setKcal(text);
                  setSanityOverridden(false);
                }}
                className="min-w-0 flex-1"
              />
              <Text className="text-sm text-gray-400">kcal</Text>
            </View>
            {errors.kcal && (
              <Text testID="quick-add-kcal-error" className="text-xs text-red-600">
                {errors.kcal}
              </Text>
            )}
          </View>

          <View className="gap-1">
            <Text className="text-xs font-medium text-gray-600">Macros (optional, grams)</Text>
            <View className="flex-row gap-2">
              {MACROS.map(({ key, label }) => (
                <View key={key} className="min-w-0 flex-1 gap-1">
                  <Text className="text-xs font-medium text-gray-600">{label} (g)</Text>
                  <Input
                    testID={`quick-add-${key}`}
                    ref={macroInputRefs[key]}
                    accessibilityLabel={`${label} grams`}
                    value={macros[key]}
                    placeholder="–"
                    keyboardType="decimal-pad"
                    onChangeText={(text) => {
                      setMacros((prev) => ({ ...prev, [key]: text }));
                      setSanityOverridden(false);
                    }}
                  />
                  {errors[key] && (
                    <Text testID={`quick-add-${key}-error`} className="text-xs text-red-600">
                      {errors[key]}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>

          {logCustomMutation.isError && (
            <Text testID="quick-add-api-error" className="text-sm text-red-600">
              {userFacingErrorMessage(logCustomMutation.error)}
            </Text>
          )}
        </View>
      )}
    </Sheet>
  );
}
