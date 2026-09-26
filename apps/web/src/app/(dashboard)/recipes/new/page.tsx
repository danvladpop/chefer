'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import { IngredientFormModal } from '@/features/ingredients/components/IngredientFormModal';
import { IngredientPicker } from '@/features/recipes/components/IngredientPicker';
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
import { uploadImage } from '@/lib/upload-image';
import { ArrowLeft, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';

// ─── Presets ──────────────────────────────────────────────────────────────────

const CUISINE_PRESETS = [
  'Italian',
  'Mediterranean',
  'Mexican',
  'Asian',
  'Thai',
  'Japanese',
  'Chinese',
  'Indian',
  'French',
  'American',
  'Middle Eastern',
  'Romanian',
];

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngredientRow {
  name: string;
  quantity: string;
  unit: string;
}

const isValidRow = (i: IngredientRow) => Boolean(i.name.trim() && Number(i.quantity) > 0 && i.unit);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewRecipePage() {
  const router = useRouter();

  // Stable ids so every control has a real <label htmlFor> / aria-describedby
  // target (F-X-5-1, F-REC-3-7).
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    description: `${uid}-description`,
    cuisine: `${uid}-cuisine`,
    cuisineFirstChip: `${uid}-cuisine-first`,
    cuisineCustom: `${uid}-cuisine-custom`,
    dietaryTags: `${uid}-dietary-tags`,
    prepTimeMins: `${uid}-prep`,
    cookTimeMins: `${uid}-cook`,
    servings: `${uid}-servings`,
    ingredients: `${uid}-ingredients`,
    instructions: `${uid}-instructions`,
    nutrition: `${uid}-nutrition`,
    enterManual: `${uid}-nutrition-manual`,
  };
  const ingredientNameId = (i: number) => `${uid}-ingredient-${i}-name`;
  const ingredientQtyId = (i: number) => `${uid}-ingredient-${i}-qty`;
  const stepId = (i: number) => `${uid}-step-${i}`;
  const nutritionId = (key: string) => `${uid}-nutrition-${key}`;

  // Basic fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineChip, setCuisineChip] = useState<string | null>(null);
  const [cuisineCustom, setCuisineCustom] = useState('');
  const [useCustomCuisine, setUseCustomCuisine] = useState(false);
  const [prepTimeMins, setPrepTimeMins] = useState('');
  const [cookTimeMins, setCookTimeMins] = useState('');
  const [servings, setServings] = useState('1');

  // Dietary tags: preset chips + free-text additions
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Image
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<'upload' | 'ai' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Ingredients & instructions
  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    { name: '', quantity: '', unit: 'g' },
  ]);
  const [customModalFor, setCustomModalFor] = useState<{ row: number; query: string } | null>(null);
  const [instructions, setInstructions] = useState<string[]>(['']);

  // Nutrition: auto-computed with manual fallback
  const [manualNutrition, setManualNutrition] = useState(false);
  const [manual, setManual] = useState({
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: '',
  });

  const { errors, clear: clearError, report: reportErrors } = useRecipeFormErrors();

  const cuisineType = useCustomCuisine ? cuisineCustom.trim() : (cuisineChip ?? '');

  const { data: units } = trpc.ingredients.units.useQuery(undefined, { staleTime: Infinity });
  const unitOptions = units ?? ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece'];

  // ── Auto nutrition ─────────────────────────────────────────────────────────
  const validRows = useMemo(
    () =>
      ingredients
        .filter(isValidRow)
        .map((i) => ({ name: i.name.trim(), quantity: Number(i.quantity), unit: i.unit })),
    [ingredients],
  );

  // Debounce the computation input so we don't call on every keystroke
  const [debouncedRows, setDebouncedRows] = useState(validRows);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedRows(validRows), 600);
    return () => clearTimeout(t);
  }, [validRows]);

  const servingsNum = Math.max(1, Number(servings) || 1);
  const { data: computed, isFetching: computing } = trpc.ingredients.computeNutrition.useQuery(
    { ingredients: debouncedRows, servings: servingsNum },
    { enabled: !manualNutrition && debouncedRows.length > 0, placeholderData: (p) => p },
  );

  const nutrition = manualNutrition
    ? {
        calories: Number(manual.calories) || 0,
        protein: Number(manual.protein) || 0,
        carbs: Number(manual.carbs) || 0,
        fat: Number(manual.fat) || 0,
        fiber: Number(manual.fiber) || 0,
      }
    : (computed?.perServing ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

  // The auto-computed calories can arrive after a failed submit — drop the
  // then-stale "could not be computed" error.
  useEffect(() => {
    if (nutrition.calories > 0) clearError('calories');
  }, [nutrition.calories, clearError]);

  // ── AI image generation (deterministic URL from name + cuisine) ────────────
  const aiImageQuery = trpc.recipe.aiImageUrl.useQuery(
    { name: name.trim(), cuisineType },
    { enabled: false },
  );

  const generateAiImage = async () => {
    setUploadError(null);
    const res = await aiImageQuery.refetch();
    if (res.data) {
      setImageUrl(res.data.url);
      setImageSource('ai');
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadImage(file);
      setImageUrl(url);
      setImageSource('upload');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── Mutation ───────────────────────────────────────────────────────────────
  const createMutation = trpc.recipe.create.useMutation({
    onSuccess: () => {
      router.push('/recipes?tab=my');
    },
  });

  // ── Row helpers ────────────────────────────────────────────────────────────
  const addIngredient = () =>
    setIngredients((prev) => [...prev, { name: '', quantity: '', unit: 'g' }]);
  const removeIngredient = (i: number) =>
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  const updateIngredient = (i: number, field: keyof IngredientRow, value: string) => {
    clearError('ingredients');
    setIngredients((prev) =>
      prev.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing)),
    );
  };

  const addInstruction = () => setInstructions((prev) => [...prev, '']);
  const removeInstruction = (i: number) =>
    setInstructions((prev) => prev.filter((_, idx) => idx !== i));
  const updateInstruction = (i: number, value: string) => {
    clearError('instructions');
    setInstructions((prev) => prev.map((ins, idx) => (idx === i ? value : ins)));
  };

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput('');
  };

  // ── Validation & submit ────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: RecipeFormErrors = validateRecipeCore({
      name,
      description,
      prepTimeMins,
      cookTimeMins,
      servings,
      instructions,
    });
    if (!cuisineType) errs.cuisineType = 'Pick a cuisine or enter your own.';
    if (validRows.length === 0) errs.ingredients = 'Add at least one ingredient.';
    if (nutrition.calories <= 0)
      errs.calories = manualNutrition
        ? 'Enter calories.'
        : 'Nutrition could not be computed — check your ingredients or enter it manually.';

    // Where focus lands for each error: the first incomplete ingredient row's
    // missing field, the first step, the calories input (or the "enter
    // manually" switch when nutrition is auto-computed).
    const badRow = Math.max(
      0,
      ingredients.findIndex((r) => !isValidRow(r)),
    );
    const targets: RecipeFormFocusTargets = {
      name: ids.name,
      description: ids.description,
      cuisineType: useCustomCuisine ? ids.cuisineCustom : ids.cuisineFirstChip,
      prepTimeMins: ids.prepTimeMins,
      cookTimeMins: ids.cookTimeMins,
      servings: ids.servings,
      ingredients: ingredients[badRow]?.name.trim()
        ? ingredientQtyId(badRow)
        : ingredientNameId(badRow),
      instructions: stepId(0),
      calories: manualNutrition ? nutritionId('calories') : ids.enterManual,
    };
    return reportErrors(errs, targets);
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!validate()) return;

    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      cuisineType,
      prepTimeMins: Number(prepTimeMins),
      cookTimeMins: Number(cookTimeMins),
      servings: servingsNum,
      imageUrl: imageUrl ?? undefined,
      dietaryTags: tags,
      ingredients: validRows,
      instructions: instructions.filter((s) => s.trim()).map((s) => s.trim()),
      nutritionInfo: {
        calories: Math.round(nutrition.calories),
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        fiber: nutrition.fiber,
      },
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/recipes"
          aria-label="Back to recipes"
          className="touch-target relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white text-gray-500 shadow-sm transition-colors hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            My Recipes
          </p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Create Recipe</h1>
        </div>
      </div>

      {/* noValidate: our own validation owns the messages — the browser's
          tooltip fought it (and pointed at fields under the sticky header). */}
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
              placeholder="e.g. Grandma's Pasta Sauce"
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
              {...fieldErrorProps(ids.description, errors.description)}
              rows={3}
              placeholder="Brief description of the dish…"
              className={inputCls(!!errors.description)}
            />
          </Field>

          {/* Cuisine chips + free text */}
          <Field id={ids.cuisine} label="Cuisine" error={errors.cuisineType} group>
            <div className="flex flex-wrap gap-2">
              {CUISINE_PRESETS.map((c, idx) => (
                <Chip
                  key={c}
                  id={idx === 0 ? ids.cuisineFirstChip : undefined}
                  label={c}
                  active={!useCustomCuisine && cuisineChip === c}
                  onClick={() => {
                    setCuisineChip(c);
                    setUseCustomCuisine(false);
                    clearError('cuisineType');
                  }}
                />
              ))}
              <Chip
                label="Other…"
                active={useCustomCuisine}
                onClick={() => setUseCustomCuisine(true)}
              />
            </div>
            {useCustomCuisine && (
              <input
                id={ids.cuisineCustom}
                type="text"
                value={cuisineCustom}
                onChange={(e) => {
                  setCuisineCustom(e.target.value);
                  clearError('cuisineType');
                }}
                placeholder="e.g. Fusion, Nordic…"
                aria-label="Custom cuisine"
                {...fieldErrorProps(ids.cuisine, errors.cuisineType)}
                className={`mt-2 ${inputCls(!!errors.cuisineType)}`}
              />
            )}
          </Field>

          {/* Dietary tag chips + free text */}
          <Field id={ids.dietaryTags} label="Dietary Tags" group>
            <div className="flex flex-wrap gap-2">
              {DIETARY_TAG_PRESETS.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={tags.includes(t)}
                  onClick={() =>
                    setTags((prev) =>
                      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                    )
                  }
                />
              ))}
            </div>
            {/* Custom tags the user added */}
            {tags.filter((t) => !DIETARY_TAG_PRESETS.includes(t)).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {tags
                  .filter((t) => !DIETARY_TAG_PRESETS.includes(t))
                  .map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-1 rounded-full bg-[#fff3e8] px-2.5 py-1 text-xs font-medium text-[#944a00]"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        aria-label={`Remove ${t} tag`}
                        className="touch-target relative rounded-full"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder="Add your own tag and press Enter…"
              aria-label="Add a custom dietary tag"
              className={`mt-2 ${inputCls(false)}`}
            />
          </Field>

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
        </Section>

        {/* ── Photo ──────────────────────────────────────────────────── */}
        <Section title="Photo">
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            {imageUrl ? (
              <div className="relative w-full sm:w-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Recipe preview"
                  className="h-40 w-full rounded-xl border object-cover sm:h-28 sm:w-36"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl(null);
                    setImageSource(null);
                  }}
                  aria-label="Remove image"
                  className="touch-target absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-white shadow hover:bg-gray-600"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {imageSource === 'ai' && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/50 px-1.5 py-0.5 text-xs font-medium text-white">
                    AI generated
                  </span>
                )}
              </div>
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-3xl sm:h-28 sm:w-36">
                🍽️
              </div>
            )}

            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 focus-within:ring-2 focus-within:ring-[#944a00] hover:bg-gray-50 sm:min-h-0 sm:w-fit sm:justify-start">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? 'Uploading…' : 'Upload from device'}
                <input
                  type="file"
                  accept="image/*"
                  // sr-only, not hidden: display:none took the upload out of the tab order.
                  className="sr-only"
                  onChange={(e) => void handleUpload(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={() => void generateAiImage()}
                disabled={name.trim().length < 2 || aiImageQuery.isFetching}
                title={name.trim().length < 2 ? 'Enter a recipe name first' : undefined}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 sm:min-h-0 sm:w-fit sm:justify-start"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiImageQuery.isFetching ? 'Generating…' : 'Generate with AI'}
              </button>
              <p className="text-xs text-gray-500">
                Upload a photo from your phone or computer, or let AI create one from the recipe
                name. The AI image may take ~20 s to appear the first time.
              </p>
              {uploadError && (
                <p role="alert" className="text-xs text-red-600">
                  {uploadError}
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* ── Ingredients ────────────────────────────────────────────── */}
        <Section
          title="Ingredients"
          error={errors.ingredients}
          errorId={errorIdFor(ids.ingredients)}
        >
          <div className="space-y-2">
            {/* Two rows on a phone. Side by side, the quantity (80px), unit
                (112px) and delete (32px) controls plus gaps consume 248px of
                fixed width, leaving the ingredient name about 95px at 375px. */}
            {ingredients.map((ing, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl border p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0"
              >
                <IngredientPicker
                  id={ingredientNameId(i)}
                  ariaLabel={`Name for ingredient ${i + 1}`}
                  invalid={!!errors.ingredients && !ing.name.trim()}
                  describedBy={errors.ingredients ? errorIdFor(ids.ingredients) : undefined}
                  value={ing.name}
                  onSelect={(selected) => updateIngredient(i, 'name', selected)}
                  onCreateCustom={(query) => setCustomModalFor({ row: i, query })}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                    placeholder="Qty"
                    id={ingredientQtyId(i)}
                    aria-label={`Quantity for ingredient ${i + 1}`}
                    aria-invalid={
                      (!!errors.ingredients && !(Number(ing.quantity) > 0)) || undefined
                    }
                    aria-describedby={errors.ingredients ? errorIdFor(ids.ingredients) : undefined}
                    className={`w-20 shrink-0 rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none ${
                      errors.ingredients && !(Number(ing.quantity) > 0)
                        ? 'border-red-400 focus:border-red-500'
                        : 'focus:border-[#944a00]'
                    }`}
                  />
                  <select
                    value={ing.unit}
                    onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                    aria-label={`Unit for ingredient ${i + 1}`}
                    className="w-28 shrink-0 rounded-xl border bg-white px-2 py-2 text-sm text-gray-800 focus:border-[#944a00] focus:outline-none"
                  >
                    {unitOptions.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
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

        {/* ── Nutrition (auto-computed) ──────────────────────────────── */}
        <Section
          title="Nutrition (per serving)"
          error={errors.calories}
          errorId={errorIdFor(ids.nutrition)}
        >
          {!manualNutrition ? (
            <div className="rounded-xl border bg-gray-50 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat label="Calories" value={`${Math.round(nutrition.calories)} kcal`} />
                <Stat label="Protein" value={`${nutrition.protein} g`} />
                <Stat label="Carbs" value={`${nutrition.carbs} g`} />
                <Stat label="Fat" value={`${nutrition.fat} g`} />
                <Stat label="Fiber" value={`${nutrition.fiber} g`} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 text-xs text-gray-500">
                <span className="min-w-0">
                  {computing
                    ? 'Computing from ingredients…'
                    : computed && computed.unmatched.length > 0
                      ? `Estimated from ${computed.matchedCount} of ${computed.totalCount} ingredients — no data yet for: ${computed.unmatched.join(', ')}`
                      : computed
                        ? 'Computed automatically from your ingredients and servings.'
                        : 'Add ingredients to compute nutrition automatically.'}
                </span>
                <button
                  id={ids.enterManual}
                  type="button"
                  onClick={() => {
                    setManualNutrition(true);
                    clearError('calories');
                  }}
                  aria-describedby={errors.calories ? errorIdFor(ids.nutrition) : undefined}
                  className="flex min-h-11 items-center font-medium text-[#944a00] hover:underline"
                >
                  Enter manually instead
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {(
                  [
                    ['calories', 'Calories (kcal)'],
                    ['protein', 'Protein (g)'],
                    ['carbs', 'Carbs (g)'],
                    ['fat', 'Fat (g)'],
                    ['fiber', 'Fiber (g)'],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} id={nutritionId(key)} label={label}>
                    <input
                      id={nutritionId(key)}
                      type="number"
                      min={0}
                      step="0.1"
                      inputMode="decimal"
                      value={manual[key]}
                      onChange={(e) => {
                        setManual((m) => ({ ...m, [key]: e.target.value }));
                        if (key === 'calories') clearError('calories');
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      {...(key === 'calories'
                        ? fieldErrorProps(ids.nutrition, errors.calories)
                        : {})}
                      className={inputCls(key === 'calories' && !!errors.calories)}
                    />
                  </Field>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setManualNutrition(false);
                  clearError('calories');
                }}
                className="flex min-h-11 items-center text-xs font-medium text-[#944a00] hover:underline"
              >
                Compute automatically from ingredients instead
              </button>
            </>
          )}
        </Section>

        {/* ── Submit ─────────────────────────────────────────────────── */}
        <div>
          <FormErrorSummary errors={errors} />
          {createMutation.error && (
            <p
              role="alert"
              className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              {createMutation.error.message}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 pb-8 sm:flex-row sm:justify-end">
            <Link
              href="/recipes"
              className="flex min-h-11 items-center justify-center rounded-xl border bg-white px-5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex min-h-11 items-center justify-center rounded-xl bg-[#944a00] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00] disabled:opacity-60"
            >
              {createMutation.isPending ? 'Saving…' : 'Save Recipe'}
            </button>
          </div>
        </div>
      </form>

      {/* Custom ingredient modal */}
      {customModalFor && (
        <IngredientFormModal
          mode="create"
          initialName={customModalFor.query}
          onClose={() => setCustomModalFor(null)}
          onSaved={(displayName) => {
            updateIngredient(customModalFor.row, 'name', displayName);
            setCustomModalFor(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({
  id,
  label,
  active,
  onClick,
}: {
  id?: string | undefined;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  // touch-target: a 44px hit area without making 22 chips 44px tall; the
  // gap-2 rows keep neighbouring hit areas from overlapping (F-X-2-1).
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`touch-target relative rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-[#944a00] bg-[#944a00] text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-[#944a00]/40 hover:text-[#944a00]'
      }`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
