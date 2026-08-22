'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { IngredientFormModal } from '@/features/ingredients/components/IngredientFormModal';
import { IngredientPicker } from '@/features/recipes/components/IngredientPicker';
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

interface FormErrors {
  name?: string;
  description?: string;
  cuisineType?: string;
  prepTimeMins?: string;
  cookTimeMins?: string;
  servings?: string;
  ingredients?: string;
  instructions?: string;
  calories?: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewRecipePage() {
  const router = useRouter();

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

  const [errors, setErrors] = useState<FormErrors>({});

  const cuisineType = useCustomCuisine ? cuisineCustom.trim() : (cuisineChip ?? '');

  const { data: units } = trpc.ingredients.units.useQuery(undefined, { staleTime: Infinity });
  const unitOptions = units ?? ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece'];

  // ── Auto nutrition ─────────────────────────────────────────────────────────
  const validRows = useMemo(
    () =>
      ingredients
        .filter((i) => i.name.trim() && Number(i.quantity) > 0 && i.unit)
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
  const updateIngredient = (i: number, field: keyof IngredientRow, value: string) =>
    setIngredients((prev) =>
      prev.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing)),
    );

  const addInstruction = () => setInstructions((prev) => [...prev, '']);
  const removeInstruction = (i: number) =>
    setInstructions((prev) => prev.filter((_, idx) => idx !== i));
  const updateInstruction = (i: number, value: string) =>
    setInstructions((prev) => prev.map((ins, idx) => (idx === i ? value : ins)));

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput('');
  };

  // ── Validation & submit ────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = 'Recipe name is required.';
    if (!description.trim()) errs.description = 'Description is required.';
    if (!cuisineType) errs.cuisineType = 'Pick a cuisine or enter your own.';
    if (!prepTimeMins || Number(prepTimeMins) < 0) errs.prepTimeMins = 'Enter prep time (0+).';
    if (!cookTimeMins || Number(cookTimeMins) < 0) errs.cookTimeMins = 'Enter cook time (0+).';
    if (!servings || Number(servings) < 1) errs.servings = 'At least 1 serving.';
    if (validRows.length === 0) errs.ingredients = 'Add at least one ingredient.';
    if (instructions.filter((s) => s.trim()).length === 0)
      errs.instructions = 'Add at least one instruction step.';
    if (nutrition.calories <= 0)
      errs.calories = manualNutrition
        ? 'Enter calories.'
        : 'Nutrition could not be computed — check your ingredients or enter it manually.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
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
          className="flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-500 shadow-sm transition-colors hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            My Recipes
          </p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Create Recipe</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Basic Info ─────────────────────────────────────────────── */}
        <Section title="Basic Info">
          <Field label="Recipe Name" error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grandma's Pasta Sauce"
              className={inputCls(!!errors.name)}
            />
          </Field>

          <Field label="Description" error={errors.description}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of the dish…"
              className={inputCls(!!errors.description)}
            />
          </Field>

          {/* Cuisine chips + free text */}
          <Field label="Cuisine" error={errors.cuisineType}>
            <div className="flex flex-wrap gap-1.5">
              {CUISINE_PRESETS.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={!useCustomCuisine && cuisineChip === c}
                  onClick={() => {
                    setCuisineChip(c);
                    setUseCustomCuisine(false);
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
                type="text"
                value={cuisineCustom}
                onChange={(e) => setCuisineCustom(e.target.value)}
                placeholder="e.g. Fusion, Nordic…"
                className={`mt-2 ${inputCls(!!errors.cuisineType)}`}
              />
            )}
          </Field>

          {/* Dietary tag chips + free text */}
          <Field label="Dietary Tags">
            <div className="flex flex-wrap gap-1.5">
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
              <div className="mt-2 flex flex-wrap gap-1.5">
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
                        aria-label={`Remove ${t}`}
                      >
                        <X className="h-3 w-3" />
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
              className={`mt-2 ${inputCls(false)}`}
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Prep (min)" error={errors.prepTimeMins}>
              <input
                type="number"
                min={0}
                value={prepTimeMins}
                onChange={(e) => setPrepTimeMins(e.target.value)}
                className={inputCls(!!errors.prepTimeMins)}
              />
            </Field>
            <Field label="Cook (min)" error={errors.cookTimeMins}>
              <input
                type="number"
                min={0}
                value={cookTimeMins}
                onChange={(e) => setCookTimeMins(e.target.value)}
                className={inputCls(!!errors.cookTimeMins)}
              />
            </Field>
            <Field label="Servings" error={errors.servings}>
              <input
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
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
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-white shadow hover:bg-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                {imageSource === 'ai' && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white">
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
              <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 sm:min-h-0 sm:w-fit sm:justify-start">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? 'Uploading…' : 'Upload from device'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
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
              <p className="text-[11px] text-gray-500">
                Upload a photo from your phone or computer, or let AI create one from the recipe
                name. The AI image may take ~20 s to appear the first time.
              </p>
              {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
            </div>
          </div>
        </Section>

        {/* ── Ingredients ────────────────────────────────────────────── */}
        <Section title="Ingredients" error={errors.ingredients}>
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
                    aria-label={`Quantity for ingredient ${i + 1}`}
                    className="w-20 shrink-0 rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
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
                      className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 sm:ml-0 sm:h-8 sm:w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addIngredient}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#944a00] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add Ingredient
          </button>
        </Section>

        {/* ── Instructions ───────────────────────────────────────────── */}
        <Section title="Instructions" error={errors.instructions}>
          <div className="space-y-2">
            {instructions.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-[11px] font-bold text-[#944a00]">
                  {i + 1}
                </span>
                <textarea
                  value={step}
                  onChange={(e) => updateInstruction(i, e.target.value)}
                  rows={2}
                  placeholder={`Step ${i + 1}…`}
                  className="flex-1 rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
                />
                {instructions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeInstruction(i)}
                    className="mt-2 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addInstruction}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#944a00] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add Step
          </button>
        </Section>

        {/* ── Nutrition (auto-computed) ──────────────────────────────── */}
        <Section title="Nutrition (per serving)" error={errors.calories}>
          {!manualNutrition ? (
            <div className="rounded-xl border bg-gray-50 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat label="Calories" value={`${Math.round(nutrition.calories)} kcal`} />
                <Stat label="Protein" value={`${nutrition.protein} g`} />
                <Stat label="Carbs" value={`${nutrition.carbs} g`} />
                <Stat label="Fat" value={`${nutrition.fat} g`} />
                <Stat label="Fiber" value={`${nutrition.fiber} g`} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                <span>
                  {computing
                    ? 'Computing from ingredients…'
                    : computed && computed.unmatched.length > 0
                      ? `Estimated from ${computed.matchedCount} of ${computed.totalCount} ingredients — no data yet for: ${computed.unmatched.join(', ')}`
                      : computed
                        ? 'Computed automatically from your ingredients and servings.'
                        : 'Add ingredients to compute nutrition automatically.'}
                </span>
                <button
                  type="button"
                  onClick={() => setManualNutrition(true)}
                  className="font-medium text-[#944a00] hover:underline"
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
                  <Field key={key} label={label}>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={manual[key]}
                      onChange={(e) => setManual((m) => ({ ...m, [key]: e.target.value }))}
                      onFocus={(e) => e.currentTarget.select()}
                      className={inputCls(key === 'calories' && !!errors.calories)}
                    />
                  </Field>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setManualNutrition(false)}
                className="mt-1 text-[11px] font-medium text-[#944a00] hover:underline"
              >
                Compute automatically from ingredients instead
              </button>
            </>
          )}
        </Section>

        {/* ── Submit ─────────────────────────────────────────────────── */}
        {createMutation.error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
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

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
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
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

function Section({
  title,
  children,
  error,
}: {
  title: string;
  children: React.ReactNode;
  error?: string | undefined;
}) {
  return (
    <div>
      <h2 className="mb-4 border-b pb-2 font-semibold text-gray-900">{title}</h2>
      <div className="space-y-4">{children}</div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return `w-full rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none ${
    hasError ? 'border-red-400 focus:border-red-500' : 'focus:border-[#944a00]'
  }`;
}
