'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import {
  Field,
  FormErrorSummary,
  inputCls,
  Section,
} from '@/features/recipes/components/recipe-form-fields';
import {
  errorIdFor,
  fieldErrorProps,
  useRecipeFormErrors,
  validateRecipeCore,
  type RecipeFormErrors,
  type RecipeFormFocusTargets,
} from '@/features/recipes/lib/recipe-form';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
}

interface NutritionInfo {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
}

const isValidIngredient = (i: Ingredient) =>
  Boolean(i.name.trim() && Number(i.quantity) > 0 && i.unit.trim());

const NUTRITION_FIELDS = [
  ['calories', 'Calories (kcal)'],
  ['protein', 'Protein (g)'],
  ['carbs', 'Carbs (g)'],
  ['fat', 'Fat (g)'],
  ['fiber', 'Fiber (g)'],
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditRecipePage() {
  const params = useParams<{ id: string }>();
  const recipeId = params.id;
  const router = useRouter();

  // Stable ids for <label htmlFor> / aria-describedby (F-X-5-1, F-REC-3-7).
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    description: `${uid}-description`,
    cuisineType: `${uid}-cuisine`,
    dietaryTags: `${uid}-dietary-tags`,
    prepTimeMins: `${uid}-prep`,
    cookTimeMins: `${uid}-cook`,
    servings: `${uid}-servings`,
    imageUrl: `${uid}-image-url`,
    ingredients: `${uid}-ingredients`,
    instructions: `${uid}-instructions`,
  };
  const ingredientFieldId = (i: number, field: keyof Ingredient) =>
    `${uid}-ingredient-${i}-${field}`;
  const stepId = (i: number) => `${uid}-step-${i}`;
  const nutritionId = (key: keyof NutritionInfo) => `${uid}-nutrition-${key}`;

  const {
    data: recipe,
    isLoading,
    error: loadError,
  } = trpc.recipe.getMyRecipe.useQuery({ recipeId }, { retry: false });

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [prepTimeMins, setPrepTimeMins] = useState('');
  const [cookTimeMins, setCookTimeMins] = useState('');
  const [servings, setServings] = useState('1');
  const [imageUrl, setImageUrl] = useState('');
  const [dietaryTags, setDietaryTags] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: '', quantity: '', unit: '' },
  ]);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [nutrition, setNutrition] = useState<NutritionInfo>({
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: '0',
  });
  const [hydrated, setHydrated] = useState(false);
  const { errors, clear: clearError, report: reportErrors } = useRecipeFormErrors();

  // Pre-fill form when recipe loads
  useEffect(() => {
    if (!recipe || hydrated) return;
    setName(recipe.name);
    setDescription(recipe.description);
    setCuisineType(recipe.cuisineType);
    setPrepTimeMins(String(recipe.prepTimeMins));
    setCookTimeMins(String(recipe.cookTimeMins));
    setServings(String(recipe.servings));
    setImageUrl(recipe.imageUrl ?? '');
    setDietaryTags(recipe.dietaryTags.join(', '));

    const rawIngredients = recipe.ingredients as {
      name: string;
      quantity: number;
      unit: string;
    }[];
    setIngredients(
      rawIngredients.length > 0
        ? rawIngredients.map((i) => ({
            name: i.name,
            quantity: String(i.quantity),
            unit: i.unit,
          }))
        : [{ name: '', quantity: '', unit: '' }],
    );
    setInstructions(recipe.instructions.length > 0 ? recipe.instructions : ['']);

    const n = recipe.nutritionInfo as {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber?: number;
    };
    setNutrition({
      calories: String(n.calories),
      protein: String(n.protein),
      carbs: String(n.carbs),
      fat: String(n.fat),
      fiber: String(n.fiber ?? 0),
    });
    setHydrated(true);
  }, [recipe, hydrated]);

  const updateMutation = trpc.recipe.update.useMutation({
    onSuccess: () => {
      router.push('/recipes?tab=my');
    },
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const addIngredient = () =>
    setIngredients((prev) => [...prev, { name: '', quantity: '', unit: '' }]);

  const removeIngredient = (i: number) =>
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));

  const updateIngredient = (i: number, field: keyof Ingredient, value: string) => {
    clearError('ingredients');
    setIngredients((prev) =>
      prev.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing)),
    );
  };

  // The ingredients error only shows when no row is complete: point every row
  // at it and flag the fields that are actually missing.
  const ingredientErrorProps = (missing: boolean) =>
    errors.ingredients
      ? {
          'aria-invalid': missing || undefined,
          'aria-describedby': errorIdFor(ids.ingredients),
        }
      : {};

  const addInstruction = () => setInstructions((prev) => [...prev, '']);

  const removeInstruction = (i: number) =>
    setInstructions((prev) => prev.filter((_, idx) => idx !== i));

  const updateInstruction = (i: number, value: string) => {
    clearError('instructions');
    setInstructions((prev) => prev.map((ins, idx) => (idx === i ? value : ins)));
  };

  // ─── Validation & Submit ────────────────────────────────────────────────────

  const validate = (): boolean => {
    const errs: RecipeFormErrors = validateRecipeCore({
      name,
      description,
      prepTimeMins,
      cookTimeMins,
      servings,
      instructions,
    });
    if (!cuisineType.trim()) errs.cuisineType = 'Cuisine type is required.';
    if (!ingredients.some(isValidIngredient)) errs.ingredients = 'Add at least one ingredient.';
    if (!nutrition.calories.trim() || !(Number(nutrition.calories) >= 0))
      errs.calories = 'Enter calories (0 or more).';

    // Focus lands on the first incomplete ingredient row's first missing field.
    const badRow = Math.max(
      0,
      ingredients.findIndex((r) => !isValidIngredient(r)),
    );
    const row = ingredients[badRow];
    const badField: keyof Ingredient = !row?.name.trim()
      ? 'name'
      : !(Number(row.quantity) > 0)
        ? 'quantity'
        : 'unit';
    const targets: RecipeFormFocusTargets = {
      name: ids.name,
      description: ids.description,
      cuisineType: ids.cuisineType,
      prepTimeMins: ids.prepTimeMins,
      cookTimeMins: ids.cookTimeMins,
      servings: ids.servings,
      ingredients: ingredientFieldId(badRow, badField),
      instructions: stepId(0),
      calories: nutritionId('calories'),
    };
    return reportErrors(errs, targets);
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const validIngredients = ingredients
      .filter(isValidIngredient)
      .map((i) => ({ name: i.name.trim(), quantity: Number(i.quantity), unit: i.unit.trim() }));

    const validInstructions = instructions.filter((s) => s.trim()).map((s) => s.trim());

    const tags = dietaryTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    updateMutation.mutate({
      recipeId,
      name: name.trim(),
      description: description.trim(),
      cuisineType: cuisineType.trim(),
      prepTimeMins: Number(prepTimeMins),
      cookTimeMins: Number(cookTimeMins),
      servings: Number(servings),
      imageUrl: imageUrl.trim() || undefined,
      dietaryTags: tags,
      ingredients: validIngredients,
      instructions: validInstructions,
      nutritionInfo: {
        calories: Math.round(Number(nutrition.calories)),
        protein: Number(nutrition.protein) || 0,
        carbs: Number(nutrition.carbs) || 0,
        fat: Number(nutrition.fat) || 0,
        fiber: Number(nutrition.fiber) || 0,
      },
    });
  };

  // ─── Loading / Error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-gray-100" />
          <div className="h-64 rounded-2xl bg-gray-100" />
        </div>
      </div>
    );
  }

  if (loadError || !recipe) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8 text-center">
        <p className="text-gray-500">
          Recipe not found or you don&apos;t have permission to edit it.
        </p>
        <Link
          href="/recipes?tab=my"
          className="mt-4 inline-flex min-h-11 items-center text-sm text-[#944a00] hover:underline"
        >
          ← Back to My Recipes
        </Link>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/recipes?tab=my"
          aria-label="Back to my recipes"
          className="touch-target relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white text-gray-500 shadow-sm transition-colors hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            My Recipes
          </p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Edit Recipe</h1>
        </div>
      </div>

      {/* noValidate: our own validation owns the messages (F-REC-3-7). */}
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        {/* ── Basic Info ─────────────────────────────────────────────── */}
        <Section title="Basic Info">
          <Field id={ids.name} label="Recipe Name" error={errors.name}>
            <input
              id={ids.name}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError('name');
              }}
              {...fieldErrorProps(ids.name, errors.name)}
              className={inputCls(!!errors.name)}
            />
          </Field>

          <Field id={ids.description} label="Description" error={errors.description}>
            <textarea
              id={ids.description}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearError('description');
              }}
              rows={3}
              {...fieldErrorProps(ids.description, errors.description)}
              className={inputCls(!!errors.description)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id={ids.cuisineType} label="Cuisine Type" error={errors.cuisineType}>
              <input
                id={ids.cuisineType}
                type="text"
                value={cuisineType}
                onChange={(e) => {
                  setCuisineType(e.target.value);
                  clearError('cuisineType');
                }}
                {...fieldErrorProps(ids.cuisineType, errors.cuisineType)}
                className={inputCls(!!errors.cuisineType)}
              />
            </Field>
            <Field id={ids.dietaryTags} label="Dietary Tags (comma-separated)">
              <input
                id={ids.dietaryTags}
                type="text"
                value={dietaryTags}
                onChange={(e) => setDietaryTags(e.target.value)}
                className={inputCls(false)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field id={ids.prepTimeMins} label="Prep (min)" error={errors.prepTimeMins}>
              <input
                id={ids.prepTimeMins}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={prepTimeMins}
                onChange={(e) => {
                  setPrepTimeMins(e.target.value);
                  clearError('prepTimeMins');
                }}
                {...fieldErrorProps(ids.prepTimeMins, errors.prepTimeMins)}
                className={inputCls(!!errors.prepTimeMins)}
              />
            </Field>
            <Field id={ids.cookTimeMins} label="Cook (min)" error={errors.cookTimeMins}>
              <input
                id={ids.cookTimeMins}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={cookTimeMins}
                onChange={(e) => {
                  setCookTimeMins(e.target.value);
                  clearError('cookTimeMins');
                }}
                {...fieldErrorProps(ids.cookTimeMins, errors.cookTimeMins)}
                className={inputCls(!!errors.cookTimeMins)}
              />
            </Field>
            <Field id={ids.servings} label="Servings" error={errors.servings}>
              <input
                id={ids.servings}
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={servings}
                onChange={(e) => {
                  setServings(e.target.value);
                  clearError('servings');
                }}
                {...fieldErrorProps(ids.servings, errors.servings)}
                className={inputCls(!!errors.servings)}
              />
            </Field>
          </div>

          <Field id={ids.imageUrl} label="Image URL (optional)">
            <input
              id={ids.imageUrl}
              type="url"
              inputMode="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              className={inputCls(false)}
            />
          </Field>
        </Section>

        {/* ── Ingredients ────────────────────────────────────────────── */}
        <Section
          title="Ingredients"
          error={errors.ingredients}
          errorId={errorIdFor(ids.ingredients)}
        >
          <div className="space-y-2">
            {/* Two rows on a phone — see the matching comment in recipes/new.
                The fixed-width quantity, unit and delete controls leave the
                name field about 95px at 375px when laid out side by side. */}
            {ingredients.map((ing, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl border p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0"
              >
                <input
                  id={ingredientFieldId(i, 'name')}
                  type="text"
                  value={ing.name}
                  onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                  placeholder="Ingredient"
                  aria-label={`Name for ingredient ${i + 1}`}
                  {...ingredientErrorProps(!ing.name.trim())}
                  className={`min-w-0 flex-1 ${inputCls(!!errors.ingredients && !ing.name.trim())}`}
                />
                <div className="flex items-center gap-2">
                  <input
                    id={ingredientFieldId(i, 'quantity')}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                    placeholder="Qty"
                    aria-label={`Quantity for ingredient ${i + 1}`}
                    {...ingredientErrorProps(!(Number(ing.quantity) > 0))}
                    className={`w-20 shrink-0 ${inputCls(!!errors.ingredients && !(Number(ing.quantity) > 0))}`}
                  />
                  <input
                    id={ingredientFieldId(i, 'unit')}
                    type="text"
                    value={ing.unit}
                    onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                    placeholder="Unit"
                    aria-label={`Unit for ingredient ${i + 1}`}
                    {...ingredientErrorProps(!ing.unit.trim())}
                    className={`w-24 shrink-0 ${inputCls(!!errors.ingredients && !ing.unit.trim())}`}
                  />
                  {ingredients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeIngredient(i)}
                      aria-label={`Remove ingredient ${i + 1}`}
                      className="touch-target relative ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 sm:ml-0 sm:h-8 sm:w-8"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addIngredient}
            className="mt-1 flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#944a00] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add Ingredient
          </button>
        </Section>

        {/* ── Instructions ───────────────────────────────────────────── */}
        <Section
          title="Instructions"
          error={errors.instructions}
          errorId={errorIdFor(ids.instructions)}
        >
          <div className="space-y-2">
            {instructions.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-xs font-bold text-[#944a00]"
                >
                  {i + 1}
                </span>
                <textarea
                  id={stepId(i)}
                  value={step}
                  onChange={(e) => updateInstruction(i, e.target.value)}
                  rows={2}
                  placeholder={`Step ${i + 1}…`}
                  aria-label={`Step ${i + 1}`}
                  {...fieldErrorProps(ids.instructions, errors.instructions)}
                  className={`min-w-0 flex-1 ${inputCls(!!errors.instructions)}`}
                />
                {instructions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeInstruction(i)}
                    aria-label={`Remove step ${i + 1}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addInstruction}
            className="mt-1 flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#944a00] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add Step
          </button>
        </Section>

        {/* ── Nutrition ──────────────────────────────────────────────── */}
        <Section title="Nutrition (per serving)">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {NUTRITION_FIELDS.map(([key, label]) => {
              const error = key === 'calories' ? errors.calories : undefined;
              return (
                <Field key={key} id={nutritionId(key)} label={label} error={error}>
                  <input
                    id={nutritionId(key)}
                    type="number"
                    min={0}
                    step={key === 'calories' ? 1 : 0.1}
                    inputMode={key === 'calories' ? 'numeric' : 'decimal'}
                    value={nutrition[key]}
                    onChange={(e) => {
                      setNutrition((n) => ({ ...n, [key]: e.target.value }));
                      if (key === 'calories') clearError('calories');
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    {...fieldErrorProps(nutritionId(key), error)}
                    className={inputCls(!!error)}
                  />
                </Field>
              );
            })}
          </div>
        </Section>

        {/* ── Submit ─────────────────────────────────────────────────── */}
        <div>
          <FormErrorSummary errors={errors} />
          {updateMutation.error && (
            <p
              role="alert"
              className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              {updateMutation.error.message}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 pb-8 sm:flex-row sm:justify-end">
            <Link
              href="/recipes?tab=my"
              className="flex min-h-11 items-center justify-center rounded-xl border bg-white px-5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex min-h-11 items-center justify-center rounded-xl bg-[#944a00] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00] disabled:opacity-60"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
