import { forwardRef, useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import {
  CUISINE_PRESETS,
  FRIENDS_COPY,
  type RecipeFormIngredientLine,
  type RecipeNutritionSource,
} from '@chefer/types';
import {
  Button,
  Card,
  ChipGroup,
  ConfirmSheet,
  ErrorState,
  FormField,
  haptics,
  KeyboardAwareScrollView,
  Screen,
  SelectField,
  Stepper,
  Text,
  useScrollFieldIntoView,
  useSnackbar,
  type SelectOption,
} from '@chefer/ui-mobile';
import {
  firstIncompleteIngredientLineIndex,
  missingSummary,
  parseQuantity,
  recipeMissingFields,
  tagConflicts,
} from '@chefer/utils';
import { textRejectedOf } from '../src/features/friends/api/friends-errors';
import { ComputedNutritionCard } from '../src/features/ingredients/computed-nutrition-card';
import { useComputedNutrition } from '../src/features/ingredients/use-computed-nutrition';
import { recipeFormCopy } from '../src/features/recipes/form/copy';
import { FormFooter } from '../src/features/recipes/form/form-footer';
import { IngredientLine } from '../src/features/recipes/form/ingredient-line';
import {
  NutritionFields,
  type NutritionValues,
} from '../src/features/recipes/form/nutrition-fields';
import { PhotoField } from '../src/features/recipes/form/photo-field';
import { StepLine } from '../src/features/recipes/form/step-line';
import { useIsOnline } from '../src/features/recipes/form/use-is-online';
import { trpc } from '../src/lib/trpc';

// Manual recipe create/edit — rebuilt as sections (T-40.4, UX-40 slice 1).
// One screen: with ?id= it prefills from getMyRecipe and updates, otherwise
// it creates. D-19 minimum: a name + at least one ingredient line with a
// name and an amount — description/cuisine/steps/times/nutrition are all
// optional (D-18: no fiber input, but a stored value round-trips on edit).
// The footer button is never silently disabled (PAT-17): while incomplete,
// a missing summary sits above it and a blocked tap scrolls to and focuses
// the first problem instead of doing nothing.

const DIETARY_TAG_PRESETS = [
  'vegan',
  'vegetarian',
  'gluten-free',
  'dairy-free',
  'keto',
  'paleo',
  'low-carb',
  'high-protein',
  'pescatarian',
  'nut-free',
];

const CUISINE_OPTIONS: SelectOption[] = CUISINE_PRESETS.map((c) => ({ value: c, label: c }));

/** T-BUG-O3 C7: never show a raw server message (Zod issue lists etc). */
function friendlySaveError(message: string): string {
  const looksTechnical = message.length > 160 || /\bExpected\b|\bReceived\b|\[\s*{/.test(message);
  return looksTechnical ? recipeFormCopy.save.error : message;
}

const NameInput = forwardRef<
  TextInput,
  { value: string; onChangeText: (v: string) => void; placeholder: string }
>(function NameInput({ value, onChangeText, placeholder }, ref) {
  return (
    <TextInput
      ref={ref}
      testID="rf-name-input"
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      returnKeyType="next"
      className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
    />
  );
});

function DescriptionInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <TextInput
      testID="rf-description"
      value={value}
      onChangeText={onChangeText}
      placeholder="What makes it special? (optional)"
      placeholderTextColor="#9ca3af"
      multiline
      className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground"
    />
  );
}

function TimeInput({
  value,
  onChangeText,
  testID,
}: {
  value: string;
  onChangeText: (v: string) => void;
  testID: string;
}) {
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder="optional"
      placeholderTextColor="#9ca3af"
      keyboardType="number-pad"
      className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
    />
  );
}

interface FormSnapshot {
  name: string;
  servings: number;
  cuisineType: string;
  description: string;
  prepTime: string;
  cookTime: string;
  ingredients: RecipeFormIngredientLine[];
  instructions: string[];
  dietTags: string[];
  imageUrl: string;
  nutrition: NutritionValues;
}

export default function RecipeFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = typeof id === 'string' && id.length > 0;
  const utils = trpc.useUtils();
  const navigation = useNavigation();
  const snackbar = useSnackbar();
  const scrollFieldIntoView = useScrollFieldIntoView();
  const online = useIsOnline();
  const offline = !online;

  const {
    data: existing,
    isLoading: loadingExisting,
    isError: loadError,
    isFetchedAfterMount,
    isFetching,
    refetch: refetchExisting,
  } = trpc.recipe.getMyRecipe.useQuery(
    { recipeId: id ?? '' },
    { enabled: isEdit, refetchOnMount: 'always' },
  );

  const [name, setName] = useState('');
  const [servings, setServings] = useState(1);
  const [cuisineType, setCuisineType] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  const [ingredients, setIngredients] = useState<RecipeFormIngredientLine[]>([
    { name: '', quantity: '', unit: 'g' },
  ]);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [dietTags, setDietTags] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [nutrition, setNutrition] = useState<NutritionValues>({
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
  });
  // T-40.9 (UX-40 slice 2): 'computed' is the create default (the web
  // model). Edit starts 'manual' unless the loaded recipe was explicitly
  // saved as 'computed' — an old/manual save's numbers are never silently
  // replaced by a fresh recompute on open.
  const [nutritionMode, setNutritionMode] = useState<'computed' | 'manual'>('computed');
  // D-18: fiber has no input on either platform, but a stored value must
  // round-trip on edit (T-BUG-O3 C6) — kept out of band from the form UI.
  const [storedFiber, setStoredFiber] = useState(0);
  const [prefilled, setPrefilled] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);

  const nameInputRef = useRef<TextInput>(null);
  const ingredientQtyRefs = useRef<(TextInput | null)[]>([]);
  const baselineRef = useRef<FormSnapshot | null>(null);
  const savedRef = useRef(false);
  const pendingNavAction = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);

  const snapshot = (): FormSnapshot => ({
    name,
    servings,
    cuisineType: cuisineType ?? '',
    description,
    prepTime,
    cookTime,
    ingredients,
    instructions,
    dietTags,
    imageUrl,
    nutrition,
  });

  // Capture the baseline once — on mount for create, once prefill lands for edit.
  useEffect(() => {
    if (baselineRef.current) return;
    if (isEdit && !prefilled) return;
    baselineRef.current = snapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline is captured once, deliberately
  }, [isEdit, prefilled]);

  const dirty =
    baselineRef.current !== null &&
    JSON.stringify(snapshot()) !== JSON.stringify(baselineRef.current);

  // Discard-changes confirm on the header back, Android back and the iOS
  // swipe-back alike — one navigator listener covers all three (AC9).
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (savedRef.current || !dirty) return;
      e.preventDefault();
      pendingNavAction.current = e.data.action;
      setDiscardVisible(true);
    });
    return unsubscribe;
  }, [navigation, dirty]);

  useEffect(() => {
    if (!existing || prefilled || !isFetchedAfterMount || isFetching) {
      return;
    }
    setName(existing.name);
    setDescription(existing.description === 'Imported recipe.' ? '' : existing.description);
    setCuisineType(existing.cuisineType === 'International' ? null : existing.cuisineType);
    const prep = existing.prepTimeMins > 0 ? String(existing.prepTimeMins) : '';
    const cook = existing.cookTimeMins > 0 ? String(existing.cookTimeMins) : '';
    setPrepTime(prep);
    setCookTime(cook);
    setServings(Math.max(1, existing.servings));
    // Prisma stores nutritionInfo as JSON — same narrowing cast the web list uses.
    const n = (existing.nutritionInfo ?? {}) as {
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
      source?: string;
    };
    setNutrition({
      calories: n.calories ? String(n.calories) : '',
      protein: n.protein ? String(n.protein) : '',
      carbs: n.carbs ? String(n.carbs) : '',
      fat: n.fat ? String(n.fat) : '',
    });
    setStoredFiber(n.fiber ?? 0);
    setNutritionMode(n.source === 'computed' ? 'computed' : 'manual');
    const ings = (existing.ingredients ?? []) as { name: string; quantity: number; unit: string }[];
    setIngredients(
      ings.length > 0
        ? ings.map((i) => ({ name: i.name, quantity: String(i.quantity), unit: i.unit }))
        : [{ name: '', quantity: '', unit: 'g' }],
    );
    setInstructions(existing.instructions.length > 0 ? [...existing.instructions] : ['']);
    setDietTags([...existing.dietaryTags]);
    setImageUrl(existing.imageUrl ?? '');
    // The section opens on edit only if it already has something in it.
    setMoreDetailsOpen(Boolean(existing.description) || prep !== '' || cook !== '');
    setPrefilled(true);
  }, [existing, prefilled, isFetchedAfterMount, isFetching]);

  const onDone = () => {
    savedRef.current = true;
    // T-BUG-O3 C1: invalidate every query this same recipe could be read
    // through, not just recipe.list — otherwise a stale getMyRecipe/
    // mealPlan.getRecipe cache reverts the edit the next time it's opened.
    void utils.recipe.list.invalidate();
    if (isEdit && id) {
      void utils.recipe.getMyRecipe.invalidate({ recipeId: id });
      void utils.mealPlan.getRecipe.invalidate({ recipeId: id });
    }
    snackbar.show({ message: recipeFormCopy.save.saved, tone: 'success' });
    router.back();
  };
  const createMutation = trpc.recipe.create.useMutation({ onSuccess: onDone });
  const updateMutation = trpc.recipe.update.useMutation({ onSuccess: onDone });
  const mutation = isEdit ? updateMutation : createMutation;
  // Following (PRD §9.4): a shared recipe whose name/description trips the
  // word filter comes back BAD_REQUEST + `data.textRejected: 'recipe'`. Show
  // the plain message under the name field instead of the footer.
  const textRejected = mutation.isError && textRejectedOf(mutation.error) === 'recipe';

  const validIngredients = ingredients
    .filter((i) => i.name.trim() && parseQuantity(i.quantity) > 0 && i.unit.trim())
    .map((i) => ({
      name: i.name.trim(),
      quantity: parseQuantity(i.quantity),
      unit: i.unit.trim(),
    }));
  const validInstructions = instructions.map((s) => s.trim()).filter(Boolean);

  // T-40.9: only fetches while nutritionMode is 'computed' — manual mode
  // never calls ingredients.computeNutrition.
  const computedNutrition = useComputedNutrition(
    validIngredients,
    servings,
    nutritionMode === 'computed',
  );

  const parsedIngredients = ingredients.map((i) => ({
    name: i.name,
    quantity: parseQuantity(i.quantity),
  }));
  const missing = recipeMissingFields({ name, ingredients: parsedIngredients });
  const incompleteIndex = firstIncompleteIngredientLineIndex(parsedIngredients);
  const canSave = missing.length === 0;
  const missingText = missingSummary(
    missing,
    incompleteIndex !== null ? incompleteIndex + 1 : undefined,
  );

  const conflicts = tagConflicts(validIngredients, dietTags);

  const save = () => {
    if (mutation.isPending || offline) return;
    setAttemptedSave(true);
    if (!canSave) {
      haptics.error();
      if (missing.includes('name')) {
        scrollFieldIntoView(nameInputRef.current);
        nameInputRef.current?.focus();
      } else if (incompleteIndex !== null) {
        const field = ingredientQtyRefs.current[incompleteIndex] ?? null;
        scrollFieldIntoView(field);
        field?.focus();
      } else {
        const field = ingredientQtyRefs.current[0] ?? null;
        scrollFieldIntoView(field);
        field?.focus();
      }
      return;
    }
    // T-40.9: computed mode sends the live computed numbers (fiber and all —
    // D-18's "still there under the hood"); manual sends the typed fields
    // and the stored fiber (T-BUG-O3 C6). `source` records which one saved,
    // 'none' when computed mode never actually matched anything.
    const computedStats = computedNutrition.data?.perServing;
    const nutritionSource: RecipeNutritionSource =
      nutritionMode === 'manual'
        ? 'manual'
        : computedNutrition.data && computedNutrition.data.matchedCount > 0
          ? 'computed'
          : 'none';
    const nutritionInfo =
      nutritionMode === 'computed' && computedStats
        ? {
            calories: Math.round(computedStats.calories),
            protein: computedStats.protein,
            carbs: computedStats.carbs,
            fat: computedStats.fat,
            fiber: computedStats.fiber,
            source: nutritionSource,
          }
        : {
            calories: Math.round(parseQuantity(nutrition.calories)),
            protein: parseQuantity(nutrition.protein),
            carbs: parseQuantity(nutrition.carbs),
            fat: parseQuantity(nutrition.fat),
            fiber: storedFiber,
            source: nutritionSource,
          };
    const payload = {
      name: name.trim(),
      description: description.trim(),
      ingredients: validIngredients,
      instructions: validInstructions,
      nutritionInfo,
      cuisineType: (cuisineType ?? '').trim(),
      dietaryTags: dietTags,
      prepTimeMins: Math.round(parseQuantity(prepTime)),
      cookTimeMins: Math.round(parseQuantity(cookTime)),
      servings: Math.max(1, Math.round(servings) || 1),
      imageUrl,
    };
    if (isEdit && id) {
      updateMutation.mutate({ recipeId: id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const updateIngredient = (index: number, patch: Partial<RecipeFormIngredientLine>) => {
    setIngredients((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeIngredient = (index: number) => {
    const removed = ingredients[index];
    if (!removed) return;
    setIngredients((prev) => prev.filter((_, i) => i !== index));
    haptics.warning();
    snackbar.show({
      message: recipeFormCopy.removed.ingredient,
      actionLabel: recipeFormCopy.removed.undo,
      onAction: () =>
        setIngredients((prev) => {
          const next = [...prev];
          next.splice(index, 0, removed);
          return next;
        }),
    });
  };

  const removeStep = (index: number) => {
    const removed = instructions[index];
    if (removed === undefined) return;
    setInstructions((prev) => prev.filter((_, i) => i !== index));
    haptics.warning();
    snackbar.show({
      message: recipeFormCopy.removed.step(index + 1),
      actionLabel: recipeFormCopy.removed.undo,
      onAction: () =>
        setInstructions((prev) => {
          const next = [...prev];
          next.splice(index, 0, removed);
          return next;
        }),
    });
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    setInstructions((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      if (moved === undefined) return prev;
      next.splice(target, 0, moved);
      return next;
    });
  };

  // T-BUG-O3 C5: a load error (deleted recipe, stale list) used to render a
  // blank "Edit Recipe" form with a disabled button — now an explicit state.
  if (isEdit && loadError) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <ErrorState
          title={recipeFormCopy.loadError.title}
          description="Nothing has been changed."
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void refetchExisting()}
        />
      </Screen>
    );
  }

  // PAT-8 skeleton instead of a full-screen spinner while an edit loads.
  if (isEdit && (loadingExisting || !prefilled)) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0" testID="rf-skeleton">
        <View className="flex-row items-center gap-3 px-4 py-3">
          <View className="h-6 w-40 rounded bg-muted" />
        </View>
        <View className="gap-4 px-4">
          <View className="h-11 rounded-md bg-muted" />
          <View className="h-11 rounded-md bg-muted" />
          <View className="h-11 rounded-md bg-muted" />
          <View className="h-11 rounded-md bg-muted" />
          <View className="h-11 rounded-md bg-muted" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <View>
          <Text testID="recipe-form-title" variant="title">
            {isEdit ? recipeFormCopy.titles.edit : recipeFormCopy.titles.create}
          </Text>
          <Text variant="muted" className="text-xs">
            {recipeFormCopy.titles.legend}
          </Text>
        </View>
      </View>

      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 px-4 pb-4"
        footer={
          <FormFooter
            isEdit={isEdit}
            missingText={missingText}
            offline={offline}
            saving={mutation.isPending}
            saveError={
              mutation.isError && !textRejected ? friendlySaveError(mutation.error.message) : null
            }
            onPress={save}
          />
        }
      >
        <FormField
          label={recipeFormCopy.fields.name}
          required
          error={
            attemptedSave && missing.includes('name')
              ? recipeFormCopy.missing.fieldName
              : textRejected
                ? FRIENDS_COPY.recipe.textRejected
                : undefined
          }
          testID="rf-name"
        >
          <NameInput
            ref={nameInputRef}
            value={name}
            onChangeText={setName}
            placeholder={recipeFormCopy.fields.namePlaceholder}
          />
        </FormField>

        <FormField label={recipeFormCopy.fields.servings} testID="rf-servings-field">
          <Stepper
            testID="rf-servings"
            accessibilityLabel={recipeFormCopy.fields.servings}
            value={servings}
            onChange={setServings}
            min={1}
            max={20}
          />
        </FormField>

        <SelectField
          testID="rf-cuisine"
          label={recipeFormCopy.fields.cuisine}
          value={cuisineType}
          options={CUISINE_OPTIONS}
          onChange={setCuisineType}
          placeholder={recipeFormCopy.fields.cuisinePlaceholder}
          allowOther={{ inputLabel: recipeFormCopy.fields.cuisine }}
        />

        {/* Diet tags (T-01.6, bug B-01) — kept through the rebuild. */}
        <Card className="gap-2">
          <Text variant="heading">Diet tags</Text>
          <ChipGroup
            testID="rf-diet-tags"
            multiple
            options={DIETARY_TAG_PRESETS.map((tag) => ({ value: tag, label: tag }))}
            value={dietTags}
            onChange={(v) => setDietTags(v)}
          />
          {conflicts.length > 0 && (
            <Text testID="rf-tag-conflict" className="text-xs text-amber-700">
              {conflicts.map((c) => `${c.ingredients.join(', ')} doesn't look ${c.tag}.`).join(' ')}
            </Text>
          )}
        </Card>

        {/* Ingredients — required */}
        <View className="gap-2">
          <Text variant="heading">{recipeFormCopy.fields.ingredients} *</Text>
          {ingredients.map((row, i) => (
            <IngredientLine
              key={i}
              ref={(el) => {
                ingredientQtyRefs.current[i] = el;
              }}
              index={i}
              line={row}
              nativeIDPrefix="rf"
              onChange={(patch) => updateIngredient(i, patch)}
              onRemove={() => removeIngredient(i)}
              error={
                attemptedSave && i === incompleteIndex
                  ? recipeFormCopy.missing.fieldLineAmount
                  : undefined
              }
            />
          ))}
          <Button
            testID="rf-add-ingredient"
            variant="outline"
            onPress={() =>
              setIngredients((prev) => [...prev, { name: '', quantity: '', unit: 'g' }])
            }
          >
            {recipeFormCopy.buttons.addIngredient}
          </Button>
        </View>

        {/* Steps — optional (D-19: "No steps yet" is a valid recipe) */}
        <View className="gap-2">
          <Text variant="heading">{recipeFormCopy.fields.steps}</Text>
          {instructions.map((step, i) => (
            <StepLine
              key={i}
              index={i}
              total={instructions.length}
              value={step}
              onChange={(v) => setInstructions((prev) => prev.map((s, j) => (j === i ? v : s)))}
              onRemove={() => removeStep(i)}
              onMoveUp={() => moveStep(i, -1)}
              onMoveDown={() => moveStep(i, 1)}
            />
          ))}
          <Button
            testID="rf-add-step"
            variant="outline"
            onPress={() => setInstructions((prev) => [...prev, ''])}
          >
            {recipeFormCopy.buttons.addStep}
          </Button>
        </View>

        {/* Photo */}
        <View className="gap-2">
          <Text variant="heading">{recipeFormCopy.fields.photo}</Text>
          <PhotoField imageUrl={imageUrl} onChange={setImageUrl} disabled={offline} />
        </View>

        {/* Nutrition per serving — optional (D-18: no fiber field). T-40.9:
            computed by default from the ingredients above; Edit numbers
            switches to the slice-1 manual fields, prefilled from what was
            last computed. */}
        <View className="gap-2">
          <Text variant="heading">
            {recipeFormCopy.fields.nutrition}{' '}
            <Text variant="muted" className="text-xs">
              {recipeFormCopy.fields.nutritionOptional}
            </Text>
          </Text>
          {nutritionMode === 'computed' ? (
            <ComputedNutritionCard
              computed={computedNutrition.data}
              isComputing={computedNutrition.isComputing}
              hasIngredients={computedNutrition.hasIngredients}
              online={online}
              onEditNumbers={() => {
                const stats = computedNutrition.data?.perServing;
                if (stats) {
                  setNutrition({
                    calories: String(stats.calories),
                    protein: String(stats.protein),
                    carbs: String(stats.carbs),
                    fat: String(stats.fat),
                  });
                  setStoredFiber(stats.fiber);
                }
                setNutritionMode('manual');
              }}
            />
          ) : (
            <View className="gap-2">
              <NutritionFields
                values={nutrition}
                onChange={(patch) => setNutrition((n) => ({ ...n, ...patch }))}
              />
              <Pressable
                testID="rf-nutrition-use-calculated"
                accessibilityRole="button"
                onPress={() => setNutritionMode('computed')}
                className="min-h-11 justify-center self-start"
              >
                <Text className="text-sm font-medium text-primary">
                  {recipeFormCopy.nutrition.useCalculated}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* More details — collapsed by default; opens on edit when any field has a value (MO-05) */}
        <View className="gap-2">
          <Pressable
            testID="rf-more-details-toggle"
            accessibilityRole="button"
            accessibilityState={{ expanded: moreDetailsOpen }}
            onPress={() => setMoreDetailsOpen((v) => !v)}
            className="min-h-11 flex-row items-center gap-1.5"
          >
            <Ionicons
              name={moreDetailsOpen ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color="#6b7280"
            />
            <Text className="text-sm font-medium">{recipeFormCopy.fields.moreDetails}</Text>
          </Pressable>
          {moreDetailsOpen ? (
            <View className="gap-3">
              <FormField label={recipeFormCopy.fields.description} testID="rf-description-field">
                <DescriptionInput value={description} onChangeText={setDescription} />
              </FormField>
              <View className="flex-row gap-2">
                <FormField label={recipeFormCopy.fields.prepTimeMins} testID="rf-prep-field">
                  <TimeInput value={prepTime} onChangeText={setPrepTime} testID="rf-prep" />
                </FormField>
                <FormField label={recipeFormCopy.fields.cookTimeMins} testID="rf-cook-field">
                  <TimeInput value={cookTime} onChangeText={setCookTime} testID="rf-cook" />
                </FormField>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAwareScrollView>

      <ConfirmSheet
        testID="rf-discard"
        visible={discardVisible}
        onClose={() => setDiscardVisible(false)}
        title={recipeFormCopy.discard.title}
        body={recipeFormCopy.discard.body}
        confirmLabel={recipeFormCopy.discard.confirm}
        cancelLabel={recipeFormCopy.discard.cancel}
        destructive
        onConfirm={() => {
          setDiscardVisible(false);
          savedRef.current = true;
          if (pendingNavAction.current) {
            navigation.dispatch(pendingNavAction.current);
          } else {
            router.back();
          }
        }}
      />
    </Screen>
  );
}
