import { forwardRef, useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { CUISINE_PRESETS, FRIENDS_COPY, INGREDIENT_CATALOG_COPY } from '@chefer/types';
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
  parseNutritionStatus,
  parseQuantity,
  recipeMissingFields,
  tagConflicts,
  userFacingErrorMessage,
} from '@chefer/utils';
import { textRejectedOf } from '../src/features/friends/api/friends-errors';
import {
  applyResolution,
  blankLine,
  linesForPreview,
  lineState,
  linesToPayload,
  prefillLines,
  type CatalogFormLine,
  type LineState,
} from '../src/features/ingredients/catalog-line';
import { ComputedNutritionCard } from '../src/features/ingredients/computed-nutrition-card';
import { useComputedNutrition } from '../src/features/ingredients/use-computed-nutrition';
import { recipeFormCopy } from '../src/features/recipes/form/copy';
import { FormFooter } from '../src/features/recipes/form/form-footer';
import { IngredientLine } from '../src/features/recipes/form/ingredient-line';
import { PhotoField } from '../src/features/recipes/form/photo-field';
import { StepLine } from '../src/features/recipes/form/step-line';
import { useIsOnline } from '../src/features/recipes/form/use-is-online';
import { trpc } from '../src/lib/trpc';
import { useUnsavedGuard } from '../src/lib/use-unsaved-guard';

// Manual recipe create/edit — rebuilt as sections (T-40.4, UX-40 slice 1).
// One screen: with ?id= it prefills from getMyRecipe and updates, otherwise
// it creates. D-19 minimum: a name + at least one ingredient line with a
// name and an amount — description/cuisine/steps/times are optional.
// The footer button is never silently disabled (PAT-17): while incomplete,
// a missing summary sits above it and a blocked tap scrolls to and focuses
// the first problem instead of doing nothing.
//
// plan-ingredient-catalog §10 (P9): every line is picked from the ingredient
// catalog and saved with its `ingredientId`; the unit list only offers what
// the engine can weigh for that row. Nutrition is computed — live here with
// the shared engine over `ingredients.getMany`, and authoritatively by the
// server on save — so the manual-macros path is gone. Editing a recipe whose
// lines predate the catalog asks `ingredients.resolve`: EXACT/ALIAS links
// (the server's own rule), anything else shows "Pick a match" with the
// resolver's suggestions. An unlinked line blocks saving like a line with no
// amount does (owner decision recorded in the P9 report).

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
  ingredients: { q: string; u: string; id: string | null; raw: string }[];
  instructions: string[];
  dietTags: string[];
  imageUrl: string;
}

/** The lines' part of the dirty-check snapshot. */
function snapshotLines(lines: readonly CatalogFormLine[]): FormSnapshot['ingredients'] {
  return lines.map((l) => ({
    q: l.quantity,
    u: l.unit,
    id: l.ingredientId ?? null,
    raw: l.rawName ?? l.name,
  }));
}

/** The PAT-17 error under a line, by what it still needs. */
function lineErrorFor(state: LineState): string | undefined {
  switch (state) {
    case 'needsMatch':
      return INGREDIENT_CATALOG_COPY.form.lineNeedsMatch;
    case 'needsQuantity':
      return recipeFormCopy.missing.fieldLineAmount;
    default:
      return undefined;
  }
}

export default function RecipeFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = typeof id === 'string' && id.length > 0;
  const utils = trpc.useUtils();
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
  const [ingredients, setIngredients] = useState<CatalogFormLine[]>(() => [blankLine()]);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [dietTags, setDietTags] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);

  const nameInputRef = useRef<TextInput>(null);
  const ingredientQtyRefs = useRef<(TextInput | null)[]>([]);
  const baselineRef = useRef<FormSnapshot | null>(null);

  const snapshot = (): FormSnapshot => ({
    name,
    servings,
    cuisineType: cuisineType ?? '',
    description,
    prepTime,
    cookTime,
    ingredients: snapshotLines(ingredients),
    instructions,
    dietTags,
    imageUrl,
  });

  // Capture the baseline once — on mount for create, once prefill lands for edit.
  useEffect(() => {
    if (baselineRef.current) return;
    if (isEdit && !prefilled) return;
    baselineRef.current = snapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline is captured once, deliberately
  }, [isEdit, prefilled]);

  const currentSnapshot = useRef<FormSnapshot | null>(null);
  currentSnapshot.current = snapshot();
  const isDirty = () =>
    baselineRef.current !== null &&
    JSON.stringify(currentSnapshot.current) !== JSON.stringify(baselineRef.current);

  // Discard-changes confirm on the header back, Android back and the iOS
  // swipe-back alike (AC9, UX-X-01): `usePreventRemove` also disables the
  // native swipe while dirty, which a `beforeRemove` listener could not. The
  // baseline can be re-captured without a render (after the resolver links a
  // legacy recipe's lines) — it moves BEFORE the ingredients state does, so
  // the render that follows always sees a consistent `dirty`.
  const guard = useUnsavedGuard(isDirty(), {
    title: recipeFormCopy.discard.title,
    message: recipeFormCopy.discard.body,
    discardLabel: recipeFormCopy.discard.confirm,
    keepLabel: recipeFormCopy.discard.cancel,
  });

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
    // Prisma stores `ingredients` as JSON — same narrowing cast the web list uses.
    const ings = (existing.ingredients ?? []) as { name: string; quantity: number; unit: string }[];
    setIngredients(prefillLines(ings, existing.lines));
    setInstructions(existing.instructions.length > 0 ? [...existing.instructions] : ['']);
    setDietTags([...existing.dietaryTags]);
    setImageUrl(existing.imageUrl ?? '');
    // The section opens on edit only if it already has something in it.
    setMoreDetailsOpen(Boolean(existing.description) || prep !== '' || cook !== '');
    setPrefilled(true);
  }, [existing, prefilled, isFetchedAfterMount, isFetching]);

  // Legacy lines (no stored catalog link): ask the resolver once, after prefill.
  const toResolve = ingredients.filter((l) => l.resolving);
  const resolveQuery = trpc.ingredients.resolve.useQuery(
    {
      lines: toResolve
        .slice(0, 100)
        .map((l) => ({ rawName: (l.rawName ?? l.name).slice(0, 200) || '?', unit: l.unit })),
    },
    { enabled: prefilled && toResolve.length > 0, staleTime: Infinity },
  );
  useEffect(() => {
    if (!resolveQuery.data || toResolve.length === 0) return;
    const next = applyResolution(ingredients, resolveQuery.data);
    // Applying the resolver's links is not a user edit: move the baseline
    // with it, so leaving untouched never asks to discard.
    if (!isDirty() && baselineRef.current) {
      baselineRef.current = { ...baselineRef.current, ingredients: snapshotLines(next) };
    }
    setIngredients(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applied once per resolver answer
  }, [resolveQuery.data]);
  useEffect(() => {
    // The resolver failed: the lines stay unlinked and show "Pick a match".
    if (resolveQuery.isError) {
      setIngredients((prev) => prev.map((l) => (l.resolving ? { ...l, resolving: false } : l)));
    }
  }, [resolveQuery.isError]);

  const onDone = () => {
    guard.release();
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
  const createMutation = trpc.recipe.create.useMutation({
    meta: { silent: true },
    onSuccess: onDone,
  });
  const updateMutation = trpc.recipe.update.useMutation({
    meta: { silent: true },
    onSuccess: onDone,
  });
  const mutation = isEdit ? updateMutation : createMutation;
  // Following (PRD §9.4): a shared recipe whose name/description trips the
  // word filter comes back BAD_REQUEST + `data.textRejected: 'recipe'`. Show
  // the plain message under the name field instead of the footer.
  const textRejected = mutation.isError && textRejectedOf(mutation.error) === 'recipe';

  const validIngredients = linesToPayload(ingredients);
  const validInstructions = instructions.map((s) => s.trim()).filter(Boolean);

  // Live preview: the shared engine over the catalog rows the lines link to.
  const computed = useComputedNutrition(linesForPreview(ingredients), servings);
  const ingredientFor = (line: CatalogFormLine) =>
    line.ingredientId ? (computed.details.get(line.ingredientId) ?? line.ingredient) : undefined;
  const lineStates = ingredients.map((l) => lineState(l, ingredientFor(l)));
  const resolving = ingredients.some((l) => l.resolving);

  const parsedIngredients = ingredients.map((i) => ({
    name: i.name,
    quantity: parseQuantity(i.quantity),
  }));
  const missing = recipeMissingFields({ name, ingredients: parsedIngredients });
  const incompleteIndex = firstIncompleteIngredientLineIndex(parsedIngredients);
  // A line that is named but not linked, or linked with a unit its row can't
  // weigh, blocks the save the same way (PAT-17) — after the D-19 checks.
  const catalogIndex = lineStates.findIndex((s) => s === 'needsMatch' || s === 'needsUnit');
  const canSave = missing.length === 0 && catalogIndex === -1 && !resolving;
  const missingText =
    missingSummary(missing, incompleteIndex !== null ? incompleteIndex + 1 : undefined) ??
    (catalogIndex === -1
      ? null
      : lineStates[catalogIndex] === 'needsUnit'
        ? INGREDIENT_CATALOG_COPY.form.missingUnit(catalogIndex + 1)
        : INGREDIENT_CATALOG_COPY.form.missingMatch(catalogIndex + 1));
  const wasUserEntered =
    isEdit && parseNutritionStatus(existing?.nutritionStatus) === 'USER_ENTERED';

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
      } else if (catalogIndex !== -1) {
        // The name field is a sheet trigger, not a text field: scroll the
        // row into view without raising the keyboard.
        scrollFieldIntoView(ingredientQtyRefs.current[catalogIndex] ?? null);
      } else {
        const field = ingredientQtyRefs.current[0] ?? null;
        scrollFieldIntoView(field);
        field?.focus();
      }
      return;
    }
    // The server computes from the linked lines and ignores these numbers
    // (D4); they are the same engine's preview, marked `computed`, so an API
    // that predates the catalog still stores something true.
    const perServing = computed.result?.perServing;
    const payload = {
      name: name.trim(),
      description: description.trim(),
      ingredients: validIngredients,
      instructions: validInstructions,
      ...(perServing
        ? {
            nutritionInfo: {
              calories: Math.round(perServing.calories),
              protein: perServing.protein,
              carbs: perServing.carbs,
              fat: perServing.fat,
              fiber: perServing.fiber,
              source: 'computed' as const,
            },
          }
        : {}),
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

  const updateIngredient = (index: number, patch: Partial<CatalogFormLine>) => {
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
              mutation.isError && !textRejected
                ? friendlySaveError(userFacingErrorMessage(mutation.error))
                : null
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
          {ingredients.map((row, i) => {
            const state = lineStates[i] ?? 'empty';
            const ingredient = ingredientFor(row);
            return (
              <IngredientLine
                key={row.key}
                ref={(el) => {
                  ingredientQtyRefs.current[i] = el;
                }}
                index={i}
                line={row}
                ingredient={ingredient}
                nativeIDPrefix="rf"
                onChange={(patch) => updateIngredient(i, patch)}
                onRemove={() => removeIngredient(i)}
                error={attemptedSave ? lineErrorFor(state) : undefined}
                unitError={
                  state === 'needsUnit'
                    ? INGREDIENT_CATALOG_COPY.unit.notUsable(row.unit, ingredient?.name ?? row.name)
                    : undefined
                }
              />
            );
          })}
          <Button
            testID="rf-add-ingredient"
            variant="outline"
            onPress={() => setIngredients((prev) => [...prev, blankLine()])}
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

        {/* Nutrition per serving — computed from the linked ingredients
            above with the shared engine (plan-ingredient-catalog §10). No
            manual path: the server computes the stored numbers on save. */}
        <View className="gap-2">
          <Text variant="heading">{recipeFormCopy.fields.nutrition}</Text>
          <ComputedNutritionCard
            result={computed.result}
            isComputing={computed.isComputing}
            hasIngredients={computed.hasIngredients}
            online={online}
            wasUserEntered={wasUserEntered}
          />
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

      <ConfirmSheet testID="rf-discard" {...guard.sheetProps} />
    </Screen>
  );
}
